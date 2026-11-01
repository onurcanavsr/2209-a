"""Tanıyıcıya ipucu olarak verilen komut sözcükleri.
DİKKAT: web/lib/ses/komutlar.ts içindeki komut ifadeleriyle uyumlu tutun (ikisi birbirinden bağımsız çalışır;
uyumsuzluk yalnızca tanıma doğruluğunu düşürür, işlevi bozmaz)."""

KEYWORDS = [
    "özetle", "özet", "kısa özet", "orta özet", "ayrıntılı özet",
    "oku", "durdur", "duraklat", "devam et", "ileri sar", "geri sar", "10 saniye ileri", "10 saniye geri",
    "sonraki bölüm", "önceki bölüm", "daha hızlı", "daha yavaş",
    "çalışma alanı", "ana sayfa", "hesabım", "yönetim", "geri git",
    "yazıyı büyüt", "yazıyı küçült", "koyu tema", "açık tema", "otomatik tema",
    "yardım", "ne diyebilirim", "çıkış yap",
    "pekiştirme testi", "test oluştur", "testi bitir", "sonucu oku", "soru sor", "cevabı oku",
    "a şıkkı", "b şıkkı", "c şıkkı", "d şıkkı", "birinci şık", "ikinci şık", "üçüncü şık", "dördüncü şık",
    "sonraki soru", "önceki soru", "soruyu oku", "belgeleri listele", "evet", "hayır",
    "notlarım", "öğrenme kartları", "yer imleri", "çıkarılan metin", "metni dinle", "özete git",
]

MAX_KEYWORDS = 50   # sağlayıcıya gönderilen toplam ipucu sınırı (belge adları önce gelir)


def birlestir(hints: list[str] | None) -> list[str]:
    """Belge adları + sabit komut sözcükleri; tekrarsız, sınırlı."""
    out: list[str] = []
    for k in list(hints or []) + KEYWORDS:
        if k not in out:
            out.append(k)
    return out[:MAX_KEYWORDS]

PROMPT = (
    "Kullanıcı bir web sitesini sesle yönetiyor. Konuşma çok kısa bir Türkçe komuttur, örneğin: "
    + ", ".join(KEYWORDS[:12]) + "."
)


def prompt_for(hints: list[str] | None) -> str:
    return PROMPT + (f" Belge adları: {', '.join((hints or [])[:8])}." if hints else "")
