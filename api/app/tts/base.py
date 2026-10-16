from abc import ABC, abstractmethod


class TTSError(Exception):
    pass


class TTSProvider(ABC):
    name = "base"

    @abstractmethod
    async def synthesize(self, text: str, voice: str) -> bytes:
        """Metni MP3 baytlarına çevirir (24 kHz, 48 kbps, mono)."""


def check_mp3(data: bytes) -> bytes:
    ok = len(data) > 500 and (data[:3] == b"ID3" or (data[0] == 0xFF and data[1] & 0xE0 == 0xE0))
    if not ok:
        raise TTSError("Sağlayıcı geçerli bir MP3 döndürmedi")
    return data
