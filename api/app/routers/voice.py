"""Sesli komut: tarayıcıda kaydedilen kısa ses, sunucuda metne çevrilir (tüm tarayıcılarda aynı yol).
Ses diske YAZILMAZ, günlüğe metin yazılmaz; yalnızca kullanım sayacı tutulur."""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from ..auth import CurrentUser, get_current_user
from ..config import get_settings
from ..store import get_store
from ..stt import STTError, get_stt

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/voice", tags=["sesli-komut"])

MIN_BYTES = 800  # bundan küçük kayıt gerçek konuşma içermez


def stt_provider():
    """Testlerde değiştirilebilsin diye bağımlılık olarak sunulur."""
    try:
        return get_stt()
    except (RuntimeError, ValueError):
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Sesli komut şu anda kullanılamıyor.")


def sniff(data: bytes) -> tuple[str, str] | None:
    """İstemcinin bildirdiği türe güvenmeden dosya imzasından biçimi bulur → (uzantı, mime)."""
    if data[:4] == b"\x1a\x45\xdf\xa3":
        return "webm", "audio/webm"
    if data[4:8] == b"ftyp":
        return "mp4", "audio/mp4"
    if data[:4] == b"OggS":
        return "ogg", "audio/ogg"
    if data[:4] == b"RIFF" and data[8:12] == b"WAVE":
        return "wav", "audio/wav"
    if data[:3] == b"ID3" or (len(data) > 1 and data[0] == 0xFF and data[1] & 0xE0 == 0xE0):
        return "mp3", "audio/mpeg"
    return None


def _today() -> datetime:
    return datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)


@router.get("/status")
async def voice_status(user: CurrentUser = Depends(get_current_user), store=Depends(get_store)):
    """Arayüz, düğmeyi göstermek ve kalan hakkı bildirmek için kullanır."""
    s = get_settings()
    enabled = s.stt_provider == "openai" and bool(s.openai_api_key)
    used = await store.sum_units_since(user.id, "stt", _today()) if enabled else 0
    return {"enabled": enabled, "remaining": max(s.daily_stt_requests - used, 0), "limit": s.daily_stt_requests}


@router.post("/transcribe")
async def transcribe(audio: UploadFile = File(...), user: CurrentUser = Depends(get_current_user),
                     store=Depends(get_store), provider=Depends(stt_provider)):
    s = get_settings()
    data = await audio.read(s.stt_max_bytes + 1)
    if len(data) > s.stt_max_bytes:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Ses kaydı çok uzun. Komutu kısa tutun.")
    if len(data) < MIN_BYTES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ses kaydı boş veya çok kısa.")
    kind = sniff(data)
    if kind is None:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Desteklenmeyen ses biçimi.")
    if await store.sum_units_since(user.id, "stt", _today()) >= s.daily_stt_requests:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                            "Günlük sesli komut hakkınız doldu. Düğme ve klavyeyle kullanmaya devam edebilirsiniz; hakkınız yarın yenilenir.")
    ext, mime = kind
    try:
        text = await provider.transcribe(data, f"komut.{ext}", mime)
    except Exception as e:  # STTError veya ağ hatası: ayrıntı (anahtar parçası olabilir) kullanıcıya gitmez
        log.error("STT başarısız: %s", type(e).__name__)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,
                            "Sesiniz şu anda anlaşılamadı. Lütfen biraz sonra tekrar deneyin.")
    await store.log_usage(user.id, "stt", 1)
    return {"text": text}
