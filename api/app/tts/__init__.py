from ..config import get_settings
from .base import TTSError, TTSProvider  # noqa: F401


def get_tts() -> TTSProvider:
    s = get_settings()
    if s.tts_provider == "azure":
        from .azure_provider import AzureTTS
        if not s.azure_speech_key:
            raise RuntimeError("AZURE_SPEECH_KEY ayarlanmamış")
        return AzureTTS(s.azure_speech_key, s.azure_speech_region)
    if s.tts_provider == "edge":
        from .edge_provider import EdgeTTS
        return EdgeTTS()
    raise ValueError(f"Desteklenmeyen TTS sağlayıcı: {s.tts_provider}")
