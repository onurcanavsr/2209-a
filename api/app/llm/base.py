from abc import ABC, abstractmethod
from typing import AsyncIterator


class LLMProvider(ABC):
    """Sağlayıcıdan bağımsız arayüz: Claude, Gemini, OpenAI buradan değiştirilir."""

    @abstractmethod
    async def complete(self, system: str, prompt: str, max_tokens: int = 1500) -> str: ...

    @abstractmethod
    def stream(self, system: str, prompt: str, max_tokens: int = 1500) -> AsyncIterator[str]: ...
