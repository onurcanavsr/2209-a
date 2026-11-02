"""Tanıyıcıya ipucu olarak verilen komut sözcükleri (Türkçe ve İngilizce).
DİKKAT: web/lib/ses/komutlar.ts içindeki komut ifadeleriyle uyumlu tutun (ikisi birbirinden bağımsız çalışır;
uyumsuzluk yalnızca tanıma doğruluğunu düşürür, işlevi bozmaz)."""

KEYWORDS_TR = [
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

KEYWORDS = KEYWORDS_TR   # geriye dönük uyumluluk

KEYWORDS_EN = [
    "summarize", "summary", "short summary", "medium summary", "detailed summary",
    "read", "stop", "pause", "resume", "fast forward", "rewind", "forward 10 seconds", "back 10 seconds",
    "next section", "previous section", "faster", "slower",
    "workspace", "home", "my account", "admin", "go back",
    "increase text size", "decrease text size", "dark theme", "light theme", "automatic theme",
    "help", "what can I say", "sign out",
    "practice quiz", "create quiz", "finish quiz", "read result", "ask a question", "read answer",
    "option a", "option b", "option c", "option d", "first option", "second option", "third option", "fourth option",
    "next question", "previous question", "read question", "list documents", "yes", "no",
    "my notes", "flashcards", "bookmarks", "extracted text", "listen to text", "go to summary",
]
KEYWORDS_BY_LANG = {"tr": KEYWORDS_TR, "en": KEYWORDS_EN}

MAX_KEYWORDS = 50   # sağlayıcıya gönderilen toplam ipucu sınırı (belge adları önce gelir)


def birlestir(hints: list[str] | None, lang: str = "tr") -> list[str]:
    """Belge adları + sabit komut sözcükleri (dile göre); tekrarsız, sınırlı."""
    out: list[str] = []
    for k in list(hints or []) + KEYWORDS_BY_LANG.get(lang, KEYWORDS_TR):
        if k not in out:
            out.append(k)
    return out[:MAX_KEYWORDS]

PROMPT = (
    "Kullanıcı bir web sitesini sesle yönetiyor. Konuşma çok kısa bir Türkçe komuttur, örneğin: "
    + ", ".join(KEYWORDS_TR[:12]) + "."
)
PROMPT_EN = (
    "The user is controlling a website by voice. The speech is a very short English command, for example: "
    + ", ".join(KEYWORDS_EN[:12]) + "."
)


def prompt_for(hints: list[str] | None, lang: str = "tr") -> str:
    if lang == "en":
        return PROMPT_EN + (f" Document names: {', '.join((hints or [])[:8])}." if hints else "")
    return PROMPT + (f" Belge adları: {', '.join((hints or [])[:8])}." if hints else "")
