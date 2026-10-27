import logging

import httpx

from .base import STTError, STTProvider
from .vocab import KEYWORDS, PROMPT

log = logging.getLogger(__name__)


class OpenAISTT(STTProvider):
    """OpenAI /v1/audio/transcriptions. Tarayıcı kayıtları (webm/mp4) doğrudan kabul edilir, ffmpeg gerekmez."""
    name = "openai"

    def __init__(self, api_key: str, model: str = "gpt-transcribe", language: str = "tr", hints: bool = True,
                 timeout: float = 20.0, http_client: httpx.AsyncClient | None = None):
        from openai import AsyncOpenAI
        self.model, self.language, self.hints = model, language, hints
        self.client = AsyncOpenAI(api_key=api_key, timeout=timeout, max_retries=1, http_client=http_client)

    def _variants(self) -> list[dict]:
        """Sırayla denenir. Yeni modellerin ipucu alanlarını (keywords/languages) kabul etmemesi durumunda
        daha sade isteğe düşülür; böylece parametre uyumsuzluğu özelliği tümüyle bozmaz."""
        v: list[dict] = []
        if self.hints:
            v.append({"prompt": PROMPT, "extra_body": {"keywords": KEYWORDS, "languages": [self.language]}})
            v.append({"prompt": PROMPT, "language": self.language})
        v.append({"language": self.language})
        return v

    async def transcribe(self, audio: bytes, filename: str, mime: str) -> str:
        import openai
        last: Exception | None = None
        for extra in self._variants():
            try:
                r = await self.client.audio.transcriptions.create(
                    model=self.model, file=(filename, audio, mime), **extra)
                return (getattr(r, "text", "") or "").strip()
            except openai.BadRequestError as e:   # parametre reddedildi → daha sade istekle yeniden dene
                last = e
                log.warning("STT isteği reddedildi (%s), sade istek deneniyor", type(e).__name__)
                continue
            except Exception as e:
                raise STTError(type(e).__name__) from e
        raise STTError(type(last).__name__ if last else "STT")
