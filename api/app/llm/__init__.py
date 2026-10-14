from ..config import get_settings
from .base import LLMProvider


def get_llm() -> LLMProvider:
    s = get_settings()
    if s.llm_provider == "anthropic":
        from .anthropic_provider import AnthropicProvider
        return AnthropicProvider(s.anthropic_api_key, s.llm_model)
    raise ValueError(f"Desteklenmeyen LLM sağlayıcı: {s.llm_provider}")
