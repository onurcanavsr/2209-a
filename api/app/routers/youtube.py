"""YouTube bağlantısı → transkript → belge. Oluşan belge, yüklenen PDF/Word gibi davranır (özet, soru-cevap, test, kartlar…)."""
import asyncio
import hashlib
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from ..auth import CurrentUser, get_current_user
from ..config import get_settings
from ..i18n import Lang, get_lang
from ..store import DuplicateError, get_store
from ..youtube import (LANG_ADI, YouTubeError, fetch_title, fetch_transcript, sure_yazi, video_id_from_url)
from .documents import _fail, _public

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/documents", tags=["youtube"])

FETCH_TIMEOUT = 60
MIN_CHARS = 40
_sem: asyncio.Semaphore | None = None


def _gate() -> asyncio.Semaphore:
    global _sem
    if _sem is None:
        _sem = asyncio.Semaphore(2)   # YouTube'a aynı anda en fazla 2 istek (engellenme riskini azaltır)
    return _sem


def transcript_fetcher():
    """Test için değiştirilebilir bağımlılık: (video_id, proxy_url) -> Transcript (eşzamanlı)."""
    return fetch_transcript


def title_fetcher():
    return fetch_title


class YouTubeIn(BaseModel):
    url: str = Field(min_length=1, max_length=300)


def _note(t, truncated: bool) -> str:
    kaynak = "otomatik altyazı" if t.generated else "altyazı"
    s = f"YouTube transkripti ({sure_yazi(t.seconds)}, {LANG_ADI.get(t.language, t.language)}, {kaynak})."
    if t.generated:
        s += " Otomatik altyazılarda yazım hataları ve noktalama eksikleri olabilir."
    if truncated:
        s += " Video çok uzun olduğu için metnin yalnızca ilk bölümü alındı."
    return s


async def _process(store, user_id: str, doc_id: str, video_id: str, fetch, get_title) -> None:
    try:
        async with _gate():
            t = await asyncio.wait_for(run_in_threadpool(fetch, video_id, get_settings().youtube_proxy_url), FETCH_TIMEOUT)
        text = t.text.strip()
        if len(text) < MIN_CHARS:
            raise YouTubeError("Videonun altyazısı çok kısa; anlamlı bir metin çıkarılamadı.")
        limit = get_settings().max_text_chars
        truncated = len(text) > limit
        if truncated:
            cut = text[:limit]
            text = cut[:cut.rfind("\n\n")] if "\n\n" in cut else cut
        title = await get_title(video_id)
        values = {"status": "ready", "raw_text": text, "page_count": None, "char_count": len(text),
                  "used_ocr": False, "truncated": truncated, "note": _note(t, truncated), "error": None,
                  "size_bytes": len(text.encode("utf-8"))}
        if title:
            values["title"] = title
        await store.update_document(doc_id, user_id, values)
    except YouTubeError as e:
        await _fail(store, user_id, doc_id, str(e))
    except asyncio.TimeoutError:
        await _fail(store, user_id, doc_id, "YouTube zamanında yanıt vermedi. Lütfen daha sonra tekrar deneyin.")
    except Exception:
        log.exception("YouTube belge işleme hatası (%s)", doc_id)
        await _fail(store, user_id, doc_id, "Videonun transkripti işlenirken beklenmeyen bir hata oluştu.")


@router.post("/youtube", status_code=status.HTTP_202_ACCEPTED)
async def add_youtube(body: YouTubeIn, background: BackgroundTasks, user: CurrentUser = Depends(get_current_user),
                      store=Depends(get_store), fetch=Depends(transcript_fetcher), get_title=Depends(title_fetcher),
                      lang: Lang = Depends(get_lang)):
    try:
        video_id = video_id_from_url(body.url)
    except YouTubeError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e))

    h = hashlib.sha256(f"youtube:{video_id}".encode()).hexdigest()
    existing = await store.find_by_hash(user.id, h)
    if existing:
        if existing["status"] != "failed":    # hazır/işleniyor: yeniden çekme yok
            return JSONResponse({**_public(existing, lang), "cached": True}, status_code=200)
        await store.delete_document(existing["id"], user.id)   # başarısız olan yeniden denensin

    s = get_settings()
    since = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    if await store.count_uploads_since(user.id, since) >= s.daily_limit_per_user:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                            f"Günlük yükleme sınırına ({s.daily_limit_per_user}) ulaştınız. Yarın tekrar deneyin.")
    try:
        doc = await store.create_document({"user_id": user.id, "title": f"YouTube videosu ({video_id})", "kind": "youtube",
                                           "content_hash": h, "size_bytes": 0, "status": "processing"})
    except DuplicateError:
        again = await store.find_by_hash(user.id, h)
        if again:
            return JSONResponse({**_public(again, lang), "cached": True}, status_code=200)
        raise
    await store.log_usage(user.id, "upload", 0)
    background.add_task(_process, store, user.id, doc["id"], video_id, fetch, get_title)
    return {**_public(doc, lang), "cached": False}
