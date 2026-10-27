from ..config import get_settings
from .base import STTError, STTProvider  # noqa: F401


def get_stt() -> STTProvider:
    s = get_settings()
    if s.stt_provider == "openai":
        from .openai_provider import OpenAISTT
        if not s.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY ayarlanmamış")
        return OpenAISTT(s.openai_api_key, s.stt_model, s.stt_language, s.stt_hints, s.stt_timeout_s)
    raise ValueError(f"Desteklenmeyen STT sağlayıcı: {s.stt_provider}")
