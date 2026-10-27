from abc import ABC, abstractmethod


class STTError(Exception):
    """Sağlayıcı hatası. İleti kullanıcıya GÖSTERİLMEZ (anahtar parçası içerebilir); yalnızca günlüğe türü yazılır."""


class STTProvider(ABC):
    name = "base"

    @abstractmethod
    async def transcribe(self, audio: bytes, filename: str, mime: str) -> str:
        """Kısa bir ses kaydını (komut) Türkçe metne çevirir. Konuşma yoksa boş metin döner."""
