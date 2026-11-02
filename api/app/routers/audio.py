import asyncio
import hashlib
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
from ..i18n import Lang, get_lang, translate
from ..speech import prepare, split_segments
from ..store import get_store
from ..tts import TTSError, get_tts

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/documents", tags=["ses"])

Voice = Literal["tr-TR-EmelNeural", "tr-TR-AhmetNeural", "en-US-AriaNeural", "en-US-GuyNeural",
                "en-GB-SoniaNeural", "en-GB-RyanNeural"]
Source = Literal["summary", "text"]
Level = Literal["short", "medium", "detailed"]
# Dile göre sesler: {dil: {ses_kodu: ad}}. Ad, istemcide dil seçimine göre yerelleştirilir (kadın/erkek).
VOICES_BY_LANG = {
    "tr": {"tr-TR-EmelNeural": "Emel (kadın)", "tr-TR-AhmetNeural": "Ahmet (erkek)"},
    "en": {"en-US-AriaNeural": "Aria (female, US)", "en-US-GuyNeural": "Guy (male, US)",
           "en-GB-SoniaNeural": "Sonia (female, UK)", "en-GB-RyanNeural": "Ryan (male, UK)"},
}
VOICES = {v: n for d in VOICES_BY_LANG.values() for v, n in d.items()}   # tüm geçerli sesler
DEFAULT_VOICE = {"tr": "tr-TR-EmelNeural", "en": "en-US-AriaNeural"}
CHARS_PER_SECOND = 14  # yaklaşık konuşma hızı (süre tahmini için)
WORDS_MAX_CHARS = 60_000  # kelime vurgusu için tek seferde döndürülen en çok metin

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


def _voice(v: str | None, lang: str = "tr") -> str:
    """İstenen ses o dile aitse kullanılır; değilse (ör. İngilizce belgede Türkçe ses kalmışsa) dilin varsayılanı."""
    s = get_settings()
    default = (s.tts_voice_en if lang == "en" else s.tts_voice)
    if default not in VOICES_BY_LANG[lang]:
        default = DEFAULT_VOICE[lang]
    return v if v in VOICES_BY_LANG[lang] else default


def _today() -> datetime:
    return datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)


async def _segments(store, user_id: str, doc_id: str, source: str, level: str, lang: str = "tr"):
    doc = await store.get_document(_uuid(doc_id), user_id)
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Belge bulunamadı")
    if source == "summary":
        sm = await store.get_summary(doc["id"], level, lang)
        if not sm:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Bu seviye için özet yok. Önce özeti oluşturun.")
        text = sm["content"]
    else:
        if doc["status"] != "ready" or not doc.get("raw_text"):
            raise HTTPException(status.HTTP_409_CONFLICT, "Belge henüz hazır değil.")
        text = doc["raw_text"]
    segs = split_segments(prepare(text, source, lang), get_settings().tts_segment_chars)
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
                   user: CurrentUser = Depends(get_current_user), store=Depends(get_store), provider=Depends(tts_provider),
                   lang: Lang = Depends(get_lang)):
    doc, segs = await _segments(store, user.id, doc_id, source, level, lang)
    v = _voice(voice, lang)
    total = sum(len(s) for s in segs)
    cached = sum(1 for s in segs if audio_cache.exists(audio_cache.path_for(user.id, doc["id"], _key(provider, v, s))))
    return {"segments": len(segs), "chars": total, "est_seconds": round(total / CHARS_PER_SECOND),
            "voice": v, "voices": VOICES_BY_LANG[lang], "cached_segments": cached, "lang": lang}


@router.get("/{doc_id}/audio/segment/{n}")
async def segment(doc_id: str, n: int, source: Source = "summary", level: Level = "medium", voice: Voice | None = None,
                  user: CurrentUser = Depends(get_current_user), store=Depends(get_store), provider=Depends(tts_provider),
                  lang: Lang = Depends(get_lang)):
    doc, segs = await _segments(store, user.id, doc_id, source, level, lang)
    if n < 0 or n >= len(segs):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bölüm bulunamadı")
    data = await _ensure(store, provider, user.id, doc["id"], _voice(voice, lang), segs[n])
    return Response(content=data, media_type="audio/mpeg", headers={"Cache-Control": "private, max-age=3600"})


@router.get("/{doc_id}/audio/text")
async def audio_text(doc_id: str, source: Source = "summary", level: Level = "medium",
                     user: CurrentUser = Depends(get_current_user), store=Depends(get_store),
                     lang: Lang = Depends(get_lang)):
    """Bölümlerin SESLENDİRİLEN metni (Markdown temizlenmiş hali). İstemci, okunan kelimeyi ekrandaki metinde
    vurgulamak için bunu ekrandaki metinle eşleştirir. Sentezleme yapmaz, kota harcamaz.
    Çok uzun belgelerde yalnızca ilk WORDS_MAX_CHARS karakterlik bölümler döner (ekranda da yalnızca ön izleme gösterilir)."""
    _, segs = await _segments(store, user.id, doc_id, source, level, lang)
    out, used = [], 0
    for sg in segs:
        if used >= WORDS_MAX_CHARS:
            break
        out.append(sg)
        used += len(sg)
    return {"segments": out, "total_segments": len(segs), "truncated": len(out) < len(segs)}


@router.get("/{doc_id}/audio/download")
async def download(doc_id: str, source: Source = "summary", level: Level = "medium", voice: Voice | None = None,
                   user: CurrentUser = Depends(get_current_user), store=Depends(get_store), provider=Depends(tts_provider),
                   lang: Lang = Depends(get_lang)):
    doc, segs = await _segments(store, user.id, doc_id, source, level, lang)
    total = sum(len(s) for s in segs)
    if source == "text" and total > get_settings().tts_max_download_chars:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            "Belge tek MP3 olarak indirmek için çok uzun. Sesli okuma ile dinleyebilir veya özetin sesini indirebilirsiniz.")
    v = _voice(voice, lang)
    uncached = sum(len(s) for s in segs
                   if not audio_cache.exists(audio_cache.path_for(user.id, doc["id"], _key(provider, v, s))))
    if uncached and not await _quota_ok(store, user.id, uncached):
        raise _quota_error()
    parts = await asyncio.gather(*(_ensure(store, provider, user.id, doc["id"], v, s) for s in segs))
    stem = "".join(c for c in doc["title"].rsplit(".", 1)[0] if c.isalnum() or c in " -_")[:80].strip() or ("document" if lang == "en" else "belge")
    kind_word = ("summary" if source == "summary" else "text") if lang == "en" else ("ozet" if source == "summary" else "metin")
    name = f"{stem} - {kind_word}.mp3"
    ascii_name = name.encode("ascii", "ignore").decode() or "ses.mp3"
    return Response(content=b"".join(parts), media_type="audio/mpeg", headers={
        "Content-Disposition": f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(name)}"})
