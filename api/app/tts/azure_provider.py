import re
from xml.sax.saxutils import escape

import httpx

from .base import TTSError, TTSProvider, check_mp3


class AzureTTS(TTSProvider):
    name = "azure"

    def __init__(self, key: str, region: str, transport: httpx.AsyncBaseTransport | None = None):
        if not re.fullmatch(r"[a-z0-9]+", region):
            raise ValueError("Geçersiz Azure bölgesi")
        self.key, self.region, self.transport = key, region, transport

    async def synthesize(self, text: str, voice: str) -> bytes:
        ssml = (f"<speak version='1.0' xml:lang='tr-TR'><voice name='{escape(voice)}'>"
                f"{escape(text)}</voice></speak>")
        url = f"https://{self.region}.tts.speech.microsoft.com/cognitiveservices/v1"
        headers = {"Ocp-Apim-Subscription-Key": self.key, "Content-Type": "application/ssml+xml",
                   "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3", "User-Agent": "akademik-asistan"}
        async with httpx.AsyncClient(timeout=30, transport=self.transport) as c:
            r = await c.post(url, headers=headers, content=ssml.encode("utf-8"))
        if r.status_code != 200:
            raise TTSError(f"Azure Speech yanıtı: {r.status_code}")
        return check_mp3(r.content)
