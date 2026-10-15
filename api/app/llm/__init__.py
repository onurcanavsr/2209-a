from functools import lru_cache

from ..config import get_settings
from .base import LLMProvider


@lru_cache
def _anthropic(model: str, api_key: str) -> LLMProvider:
    from .anthropic_provider import AnthropicProvider
    return AnthropicProvider(api_key, model)


def get_llm(tier: str = "main") -> LLMProvider:
    """tier='main': kaliteli model (nihai özet); tier='fast': ucuz/hızlı model (bölüm notları)."""
    s = get_settings()
    if s.llm_provider != "anthropic":
        raise ValueError(f"Desteklenmeyen LLM sağlayıcı: {s.llm_provider}")
    if not s.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY ayarlanmamış")
    return _anthropic(s.llm_model_fast if tier == "fast" else s.llm_model, s.anthropic_api_key)


def model_name(tier: str = "main") -> str:
    s = get_settings()
    return s.llm_model_fast if tier == "fast" else s.llm_model
