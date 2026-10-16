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
from ..extract import ExtractError, UnsupportedFile, clean_filename, detect_kind, extract
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


def _public(d: dict) -> dict:
    return {k: v for k, v in d.items() if k not in ("raw_text", "user_id", "content_hash")}


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
            "truncated": res.truncated, "note": res.note, "error": None})
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
                 user: CurrentUser = Depends(get_current_user), store=Depends(get_store)):
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
            return JSONResponse({**_public(existing), "cached": True}, status_code=200)
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
            return JSONResponse({**_public(again), "cached": True}, status_code=200)
        raise
    await store.log_usage(user.id, "upload", len(data))
    background.add_task(_process, store, user.id, doc["id"], kind, data)
    return {**_public(doc), "cached": False}


@router.get("")
async def list_documents(user: CurrentUser = Depends(get_current_user), store=Depends(get_store)):
    return [_public(d) for d in await store.list_documents(user.id)]


@router.get("/{doc_id}")
async def get_document(doc_id: str, user: CurrentUser = Depends(get_current_user), store=Depends(get_store)):
    doc = await store.get_document(_uuid(doc_id), user.id)
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Belge bulunamadı")
    out = _public(doc)
    out["text_preview"] = (doc.get("raw_text") or "")[:PREVIEW_CHARS]
    return out


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(doc_id: str, user: CurrentUser = Depends(get_current_user), store=Depends(get_store)):
    if not await store.delete_document(_uuid(doc_id), user.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Belge bulunamadı")
    await run_in_threadpool(audio_cache.purge_document, user.id, _uuid(doc_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
