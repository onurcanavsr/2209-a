import asyncio
import hashlib
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Literal
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Response, status
from starlette.concurrency import run_in_threadpool

from .. import audio_cache
from ..auth import CurrentUser, get_current_user
from ..config import get_settings
from ..speech import prepare, split_segments
from ..store import get_store
from ..tts import TTSError, get_tts

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/documents", tags=["ses"])

Voice = Literal["tr-TR-EmelNeural", "tr-TR-AhmetNeural"]
Source = Literal["summary", "text"]
Level = Literal["short", "medium", "detailed"]
VOICES = {"tr-TR-EmelNeural": "Emel (kadın)", "tr-TR-AhmetNeural": "Ahmet (erkek)"}
CHARS_PER_SECOND = 14  # yaklaşık konuşma hızı (süre tahmini için)

_sems: dict[int, asyncio.Semaphore] = {}
_locks: dict[str, asyncio.Lock] = {}


def tts_provider():
    """Testlerde değiştirilebilsin diye bağımlılık olarak sunulur."""
    return get_tts()


def _sem() -> asyncio.Semaphore:
    loop_id = id(asyncio.get_running_loop())
    if loop_id not in _sems:
        _sems.clear()  # eski döngülerin semaforlarını at
        _sems[loop_id] = asyncio.Semaphore(get_settings().tts_concurrency)
    return _sems[loop_id]


def _uuid(doc_id: str) -> str:
    try:
        return str(uuid.UUID(doc_id))
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Belge bulunamadı")


def _voice(v: str | None) -> str:
    v = v or get_settings().tts_voice
    return v if v in VOICES else "tr-TR-EmelNeural"


def _today() -> datetime:
    return datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)


async def _segments(store, user_id: str, doc_id: str, source: str, level: str):
    doc = await store.get_document(_uuid(doc_id), user_id)
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Belge bulunamadı")
    if source == "summary":
        sm = await store.get_summary(doc["id"], level)
        if not sm:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Bu seviye için özet yok. Önce özeti oluşturun.")
        text = sm["content"]
    else:
        if doc["status"] != "ready" or not doc.get("raw_text"):
            raise HTTPException(status.HTTP_409_CONFLICT, "Belge henüz hazır değil.")
        text = doc["raw_text"]
    segs = split_segments(prepare(text, source), get_settings().tts_segment_chars)
    if not segs:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Seslendirilecek metin bulunamadı.")
    return doc, segs


def _key(provider, voice: str, text: str) -> str:
    return hashlib.sha256(f"{provider.name}|{voice}|{text}".encode()).hexdigest()


async def _quota_ok(store, user_id: str, extra: int) -> bool:
    used = await store.sum_units_since(user_id, "tts", _today())
    return used + extra <= get_settings().daily_tts_chars


def _quota_error() -> HTTPException:
    return HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                         "Günlük sesli okuma kotanız doldu. Daha önce hazırlanan bölümleri dinlemeye devam edebilirsiniz; "
                         "yeni bölümler yarın hazırlanır.")


async def _ensure(store, provider, user_id: str, doc_id: str, voice: str, text: str) -> bytes:
    path = audio_cache.path_for(user_id, doc_id, _key(provider, voice, text))
    data = await asyncio.to_thread(audio_cache.read, path)
    if data is not None:
        return data
    key = str(path)
    lock = _locks.setdefault(key, asyncio.Lock())
    try:
        async with lock:  # aynı bölüm iki kez sentezlenmesin
            data = await asyncio.to_thread(audio_cache.read, path)
            if data is not None:
                return data
            if not await _quota_ok(store, user_id, len(text)):
                raise _quota_error()
            last: Exception | None = None
            for attempt in range(2):
                try:
                    async with _sem():
                        data = await provider.synthesize(text, voice)
                    break
                except Exception as e:  # TTSError veya ağ hatası
                    last = e
                    await asyncio.sleep(0.4)
            else:
                log.error("TTS başarısız: %s", type(last).__name__, exc_info=last)
                raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,
                                    "Seslendirme servisi şu anda kullanılamıyor. Lütfen biraz sonra tekrar deneyin.")
            await asyncio.to_thread(audio_cache.write, path, data)
            await store.log_usage(user_id, "tts", len(text))
            return data
    finally:
        if not lock.locked():
            _locks.pop(key, None)


@router.get("/{doc_id}/audio/manifest")
async def manifest(doc_id: str, source: Source = "summary", level: Level = "medium", voice: Voice | None = None,
                   user: CurrentUser = Depends(get_current_user), store=Depends(get_store), provider=Depends(tts_provider)):
    doc, segs = await _segments(store, user.id, doc_id, source, level)
    v = _voice(voice)
    total = sum(len(s) for s in segs)
    cached = sum(1 for s in segs if audio_cache.exists(audio_cache.path_for(user.id, doc["id"], _key(provider, v, s))))
    return {"segments": len(segs), "chars": total, "est_seconds": round(total / CHARS_PER_SECOND),
            "voice": v, "voices": VOICES, "cached_segments": cached}


@router.get("/{doc_id}/audio/segment/{n}")
async def segment(doc_id: str, n: int, source: Source = "summary", level: Level = "medium", voice: Voice | None = None,
                  user: CurrentUser = Depends(get_current_user), store=Depends(get_store), provider=Depends(tts_provider)):
    doc, segs = await _segments(store, user.id, doc_id, source, level)
    if n < 0 or n >= len(segs):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bölüm bulunamadı")
    data = await _ensure(store, provider, user.id, doc["id"], _voice(voice), segs[n])
    return Response(content=data, media_type="audio/mpeg", headers={"Cache-Control": "private, max-age=3600"})


@router.get("/{doc_id}/audio/segment/{n}/text")
async def segment_text(doc_id: str, n: int, source: Source = "summary", level: Level = "medium",
                       user: CurrentUser = Depends(get_current_user), store=Depends(get_store)):
    """Bölümün SESLENDİRİLEN metni (Markdown temizlenmiş hali). Okuma sırasında kelime vurgusu için kullanılır.
    Sentezleme yapmaz, kota harcamaz."""
    _, segs = await _segments(store, user.id, doc_id, source, level)
    if n < 0 or n >= len(segs):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bölüm bulunamadı")
    return Response(content=json.dumps({"index": n, "text": segs[n]}, ensure_ascii=False),
                    media_type="application/json", headers={"Cache-Control": "private, max-age=3600"})


@router.get("/{doc_id}/audio/download")
async def download(doc_id: str, source: Source = "summary", level: Level = "medium", voice: Voice | None = None,
                   user: CurrentUser = Depends(get_current_user), store=Depends(get_store), provider=Depends(tts_provider)):
    doc, segs = await _segments(store, user.id, doc_id, source, level)
    total = sum(len(s) for s in segs)
    if source == "text" and total > get_settings().tts_max_download_chars:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            "Belge tek MP3 olarak indirmek için çok uzun. Sesli okuma ile dinleyebilir veya özetin sesini indirebilirsiniz.")
    v = _voice(voice)
    uncached = sum(len(s) for s in segs
                   if not audio_cache.exists(audio_cache.path_for(user.id, doc["id"], _key(provider, v, s))))
    if uncached and not await _quota_ok(store, user.id, uncached):
        raise _quota_error()
    parts = await asyncio.gather(*(_ensure(store, provider, user.id, doc["id"], v, s) for s in segs))
    stem = "".join(c for c in doc["title"].rsplit(".", 1)[0] if c.isalnum() or c in " -_")[:80].strip() or "belge"
    name = f"{stem} - {'ozet' if source == 'summary' else 'metin'}.mp3"
    ascii_name = name.encode("ascii", "ignore").decode() or "ses.mp3"
    return Response(content=b"".join(parts), media_type="audio/mpeg", headers={
        "Content-Disposition": f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(name)}"})
