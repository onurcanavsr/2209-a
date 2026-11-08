import hashlib
import logging
import threading
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse, Response
from starlette.concurrency import run_in_threadpool

from .. import audio_cache
from ..auth import CurrentUser, get_current_user
from ..config import get_settings
from ..i18n import Lang, get_lang, translate, translate_title
from ..extract import (ExtractError, UnsupportedFile, clean_filename, detect_kind, extract, gecerli_baslangiclar,
                       kelime_sayisi, sayfa_kelime_baslangiclari, sayfa_metni)
from ..store import DuplicateError, get_store

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/documents", tags=["belgeler"])

PREVIEW_CHARS = 20_000
_gate: threading.BoundedSemaphore | None = None
_gate_lock = threading.Lock()


def _extract_limited(kind: str, data: bytes):
    """Aynı anda en fazla N belge işlenir (bellek koruması). Thread içinde çalışır."""
    global _gate
    with _gate_lock:
        if _gate is None:
            _gate = threading.BoundedSemaphore(get_settings().max_concurrent_extractions)
    with _gate:
        return extract(kind, data)


def _public(d: dict, lang: str = "tr") -> dict:
    """İstemciye giden belge. Sistemin ürettiği başlık/not/hata iletileri istek diline çevrilir (kullanıcı dosya adları değil)."""
    out = {k: v for k, v in d.items() if k not in ("raw_text", "user_id", "content_hash", "page_starts", "page_meta")}
    if lang != "tr":
        for k in ("note", "error"):
            if out.get(k):
                out[k] = translate(out[k], lang)
        out["title"] = translate_title(out.get("title"), lang)
    return out


def _page_meta(doc: dict, n: int) -> tuple[list[str], bool]:
    """Sayfa türleri ("text" | "ocr" | "image") ve Word sayfalarının yaklaşık olup olmadığı. Bozuk kayıtta güvenli varsayılan."""
    meta = doc.get("page_meta")
    meta = meta if isinstance(meta, dict) else {}
    kinds = meta.get("kinds")
    if not (isinstance(kinds, list) and len(kinds) == n and all(k in ("text", "ocr", "image") for k in kinds)):
        kinds = ["text"] * n
    return kinds, bool(meta.get("approx"))


def _uuid(doc_id: str) -> str:
    try:
        return str(uuid.UUID(doc_id))
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Belge bulunamadı")


async def _process(store, user_id: str, doc_id: str, kind: str, data: bytes) -> None:
    """Arka plan: metni çıkarır, dosyayı SAKLAMADAN yalnızca metni kaydeder."""
    try:
        res = await run_in_threadpool(_extract_limited, kind, data)
        await store.update_document(doc_id, user_id, {
            "status": "ready", "raw_text": res.text, "page_count": res.page_count,
            "char_count": len(res.text), "used_ocr": res.used_ocr,
            "truncated": res.truncated, "note": res.note, "error": None, "page_starts": res.page_starts,
            "page_meta": {"kinds": res.page_kinds, "approx": res.pages_approx} if res.page_starts else None})
    except ExtractError as e:
        await _fail(store, user_id, doc_id, str(e))
    except Exception:
        log.exception("Belge işleme hatası (%s)", doc_id)
        await _fail(store, user_id, doc_id, "Belge işlenirken beklenmeyen bir hata oluştu.")


async def _fail(store, user_id: str, doc_id: str, msg: str) -> None:
    try:
        await store.update_document(doc_id, user_id, {"status": "failed", "error": msg})
    except Exception:
        log.exception("Hata durumu kaydedilemedi (%s)", doc_id)


@router.post("", status_code=status.HTTP_202_ACCEPTED)
async def upload(background: BackgroundTasks, file: UploadFile = File(...),
                 user: CurrentUser = Depends(get_current_user), store=Depends(get_store), lang: Lang = Depends(get_lang)):
    s = get_settings()
    title = clean_filename(file.filename)
    ext = title.rsplit(".", 1)[-1].lower() if "." in title else ""
    if ext not in ("pdf", "docx", "pptx"):
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                            "Desteklenen türler: PDF, Word (.docx) ve PowerPoint (.pptx).")

    limit = s.max_upload_mb * 1024 * 1024
    data = await file.read(limit + 1)  # en fazla limit+1 bayt okunur
    if not data:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Dosya boş.")
    if len(data) > limit:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, f"Dosya en fazla {s.max_upload_mb} MB olabilir.")
    try:
        kind = detect_kind(title, data)
    except UnsupportedFile as e:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, str(e))

    h = hashlib.sha256(data).hexdigest()

    existing = await store.find_by_hash(user.id, h)
    if existing:
        if existing["status"] != "failed":  # hazır/işleniyor: yeniden işleme yok (önbellek)
            return JSONResponse({**_public(existing, lang), "cached": True}, status_code=200)
        await store.delete_document(existing["id"], user.id)  # başarısız olan yeniden denensin

    since = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    if await store.count_uploads_since(user.id, since) >= s.daily_limit_per_user:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                            f"Günlük yükleme sınırına ({s.daily_limit_per_user}) ulaştınız. Yarın tekrar deneyin.")

    try:
        doc = await store.create_document({"user_id": user.id, "title": title, "kind": kind,
                                           "content_hash": h, "size_bytes": len(data), "status": "processing"})
    except DuplicateError:  # aynı anda iki yükleme yarışı
        again = await store.find_by_hash(user.id, h)
        if again:
            return JSONResponse({**_public(again, lang), "cached": True}, status_code=200)
        raise
    await store.log_usage(user.id, "upload", len(data))
    background.add_task(_process, store, user.id, doc["id"], kind, data)
    return {**_public(doc, lang), "cached": False}


@router.get("")
async def list_documents(user: CurrentUser = Depends(get_current_user), store=Depends(get_store),
                         lang: Lang = Depends(get_lang)):
    return [_public(d, lang) for d in await store.list_documents(user.id)]


@router.get("/{doc_id}")
async def get_document(doc_id: str, user: CurrentUser = Depends(get_current_user), store=Depends(get_store),
                       lang: Lang = Depends(get_lang)):
    doc = await store.get_document(_uuid(doc_id), user.id)
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Belge bulunamadı")
    out = _public(doc, lang)
    out["text_preview"] = (doc.get("raw_text") or "")[:PREVIEW_CHARS]
    raw = doc.get("raw_text") or ""
    starts = gecerli_baslangiclar(doc.get("page_starts"), len(raw))
    if starts and raw:   # sayfa/slayt gezintisi: her sayfadan önceki kelime sayısı (yer imi sıraları için)
        out["page_word_starts"] = sayfa_kelime_baslangiclari(raw, starts)
        out["page_kinds"], out["pages_approx"] = _page_meta(doc, len(starts))
    return out


@router.get("/{doc_id}/pages/{page}")
async def get_page(doc_id: str, page: int, user: CurrentUser = Depends(get_current_user), store=Depends(get_store)):
    """Çıkarılan metnin tek bir sayfası/slaytı (1 tabanlı). Sayfa bilgisi olmayan belgelerde (Word, YouTube, eski kayıtlar) 404."""
    doc = await store.get_document(_uuid(doc_id), user.id)
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Belge bulunamadı")
    raw = doc.get("raw_text") or ""
    starts = gecerli_baslangiclar(doc.get("page_starts"), len(raw))
    if not starts or not raw:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bu belgede sayfa bilgisi yok")
    if not 1 <= page <= len(starts):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sayfa bulunamadı")
    text = sayfa_metni(raw, starts, page - 1)
    return {"page": page, "page_count": len(starts), "text": text, "kind": _page_meta(doc, len(starts))[0][page - 1],
            "word_offset": sayfa_kelime_baslangiclari(raw, starts)[page - 1], "word_count": kelime_sayisi(text)}


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(doc_id: str, user: CurrentUser = Depends(get_current_user), store=Depends(get_store)):
    if not await store.delete_document(_uuid(doc_id), user.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Belge bulunamadı")
    await run_in_threadpool(audio_cache.purge_document, user.id, _uuid(doc_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
