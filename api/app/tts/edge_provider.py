from .base import TTSError, TTSProvider, check_mp3


class EdgeTTS(TTSProvider):
    """Ücretsiz ama RESMÎ OLMAYAN yol (Microsoft Edge'in okuma servisi). Garanti yoktur;
    üretimde Azure Speech'e geçilmesi önerilir."""
    name = "edge"

    async def synthesize(self, text: str, voice: str) -> bytes:
        import edge_tts

        buf = bytearray()
        try:
            async for chunk in edge_tts.Communicate(text, voice).stream():
                if chunk["type"] == "audio":
                    buf += chunk["data"]
        except Exception as e:
            raise TTSError(f"edge-tts hatası: {type(e).__name__}") from e
        return check_mp3(bytes(buf))
