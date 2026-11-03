"""Çok dillilik (Türkçe / İngilizce).

İki ayrı kavram vardır:
- İstek dili (`lang`): istemci her istekte `X-Lang` başlığıyla (yoksa `?lang=`, yoksa Accept-Language) bildirir.
  Hata iletileri, özet/cevap/test dili ve seslendirme sesi buna göre seçilir. Varsayılan: Türkçe.
- Kaynak ileti sözlüğü: kod tabanındaki kullanıcıya görünen iletiler Türkçe yazılmıştır (kaynak dil).
  `translate()` bunları isteğin diline çevirir; böylece her `HTTPException` satırı değişmeden kalır.
  Veritabanında saklanan iletiler (belge `note`/`error` alanları) da yanıt anında aynı yolla çevrilir.

Yeni bir kullanıcı iletisi eklerken: Türkçe metni yazın, ardından aşağıdaki `EN` (sabit) ya da `PATTERNS`
(sayı/ad içeren) tablosuna İngilizcesini ekleyin. `tests/test_i18n.py` çevirisi eksik iletileri yakalar.
"""
import re
from typing import Callable, Literal

from fastapi import Request

Lang = Literal["tr", "en"]
LANGS: tuple[str, ...] = ("tr", "en")
DEFAULT_LANG: Lang = "tr"


def norm_lang(value: str | None) -> Lang:
    """'en', 'en-US', 'EN' → 'en'; tanınmayan değer → varsayılan (tr)."""
    v = (value or "").strip().lower().replace("_", "-")
    primary = v.split("-")[0]
    return primary if primary in LANGS else DEFAULT_LANG  # type: ignore[return-value]


def _from_accept_language(header: str | None) -> Lang:
    """Accept-Language: 'en-US,en;q=0.9,tr;q=0.8' → en (kalite sırasına göre ilk desteklenen dil)."""
    best: tuple[float, Lang] | None = None
    for part in (header or "").split(","):
        tag, _, q = part.strip().partition(";q=")
        code = tag.strip().lower().split("-")[0]
        if code not in LANGS:
            continue
        try:
            weight = float(q) if q else 1.0
        except ValueError:
            weight = 0.0
        if best is None or weight > best[0]:
            best = (weight, code)  # type: ignore[assignment]
    return best[1] if best else DEFAULT_LANG


def lang_from_request(request: Request) -> Lang:
    explicit = request.headers.get("x-lang") or request.query_params.get("lang")
    if explicit:
        return norm_lang(explicit)
    return _from_accept_language(request.headers.get("accept-language"))


def get_lang(request: Request) -> Lang:
    """FastAPI bağımlılığı: `lang: Lang = Depends(get_lang)`."""
    return lang_from_request(request)


# ---------------------------------------------------------------------------------------------
# Sabit iletiler (Türkçe cümle → İngilizce). Sondaki noktalama çeviride korunur; anahtarlar noktasızdır.
EN: dict[str, str] = {
    # kimlik / yetki
    "Giriş yapmanız gerekiyor": "You need to sign in",
    "Oturum geçersiz veya süresi dolmuş": "Your session is invalid or has expired",
    "Bu işlem için yetkiniz yok": "You are not authorized to perform this action",
    "Hesabınız devre dışı bırakıldı": "Your account has been deactivated",
    "Bilgi için yönetici ile iletişime geçin": "Please contact an administrator for more information",
    "Veritabanına şu anda ulaşılamıyor, lütfen tekrar deneyin": "The database is currently unreachable. Please try again",
    # bulunamadı
    "Belge bulunamadı": "Document not found",
    "Test bulunamadı": "Quiz not found",
    "Kullanıcı bulunamadı": "User not found",
    "Bölüm bulunamadı": "Section not found",
    "Not bulunamadı": "Note not found",
    "Yer imi bulunamadı": "Bookmark not found",
    "Kart bulunamadı": "Card not found",
    "Bu seviye için özet yok": "There is no summary for this level",
    "Önce özeti oluşturun": "Create the summary first",
    "Bu seviyede kayıtlı özet yok": "There is no saved summary at this level",
    "PDF şu anda hazırlanamıyor": "The PDF cannot be prepared right now",
    "Seslendirilecek metin bulunamadı": "No text found to read aloud",
    # durum
    "Belge henüz hazır değil veya metni çıkarılamadı": "The document is not ready yet or its text could not be extracted",
    "Belge henüz hazır değil": "The document is not ready yet",
    "Bu özet zaten hazırlanıyor, lütfen bekleyin": "This summary is already being prepared. Please wait",
    "Önceki sorunuz hâlâ yanıtlanıyor, lütfen bekleyin": "Your previous question is still being answered. Please wait",
    "Bu belge için test zaten hazırlanıyor, lütfen bekleyin": "A quiz for this document is already being prepared. Please wait",
    "Bu belge için kartlar zaten hazırlanıyor, lütfen bekleyin": "Cards for this document are already being prepared. Please wait",
    # üretim hataları
    "Özet şu anda hazırlanamadı": "The summary could not be prepared right now",
    "Cevap şu anda hazırlanamadı": "The answer could not be prepared right now",
    "Test şu anda hazırlanamadı": "The quiz could not be prepared right now",
    "Kartlar şu anda hazırlanamadı": "The cards could not be prepared right now",
    "Lütfen biraz sonra tekrar deneyin": "Please try again in a little while",
    "Lütfen daha sonra tekrar deneyin": "Please try again later",
    "Lütfen sorunuzu biraz daha ayrıntılı yazın": "Please write your question in a bit more detail",
    "Yarın tekrar deneyin": "Try again tomorrow",
    "Daha önce hazırlanan özetleri yine görüntüleyebilirsiniz": "You can still view summaries prepared earlier",
    "Önceki sorularınızı ve cevaplarını yine görüntüleyebilirsiniz": "You can still view your previous questions and answers",
    "Daha önce hazırlanan testleri yine çözebilirsiniz": "You can still take quizzes prepared earlier",
    "Mevcut kartlarınızı çalışmaya devam edebilirsiniz": "You can keep studying your existing cards",
    "Yenisi için eskilerden bazılarını silin": "Delete some of the old ones to add new ones",
    "Yeni test için eskilerden birini silin": "Delete an old quiz to create a new one",
    "Geçersiz şık numarası": "Invalid option number",
    # sesli okuma
    "Günlük sesli okuma kotanız doldu": "You have used up your daily read-aloud quota",
    "Daha önce hazırlanan bölümleri dinlemeye devam edebilirsiniz": "You can keep listening to sections prepared earlier",
    "yeni bölümler yarın hazırlanır": "new sections can be prepared tomorrow",
    "Seslendirme servisi şu anda kullanılamıyor": "The read-aloud service is currently unavailable",
    "Belge tek MP3 olarak indirmek için çok uzun": "The document is too long to download as a single MP3",
    "Sesli okuma ile dinleyebilir veya özetin sesini indirebilirsiniz": "You can listen with read-aloud or download the audio of the summary",
    # sesli komut
    "Sesli komut şu anda kullanılamıyor": "Voice commands are currently unavailable",
    "Ses kaydı çok uzun": "The recording is too long",
    "Komutu kısa tutun": "Keep the command short",
    "Ses kaydı boş veya çok kısa": "The recording is empty or too short",
    "Desteklenmeyen ses biçimi": "Unsupported audio format",
    "Günlük sesli komut hakkınız doldu": "You have used up your daily voice command allowance",
    "Düğme ve klavyeyle kullanmaya devam edebilirsiniz": "You can keep using the buttons and the keyboard",
    "hakkınız yarın yenilenir": "your allowance renews tomorrow",
    "Sesiniz şu anda anlaşılamadı": "Your speech could not be understood right now",
    # belgeler / yükleme
    "Dosya boş": "The file is empty",
    "Desteklenen türler: PDF, Word (.docx) ve PowerPoint (.pptx)": "Supported types: PDF, Word (.docx) and PowerPoint (.pptx)",
    "Dosya güvenlik sınırlarını aşıyor (açıldığında aşırı büyük)": "The file exceeds safety limits (it is excessively large when unpacked)",
    "Parola korumalı PDF'ler desteklenmiyor": "Password-protected PDFs are not supported",
    "PDF dosyası açılamadı (bozuk olabilir)": "The PDF file could not be opened (it may be corrupted)",
    "Word dosyası açılamadı (bozuk olabilir)": "The Word file could not be opened (it may be corrupted)",
    "PowerPoint dosyası açılamadı (bozuk olabilir)": "The PowerPoint file could not be opened (it may be corrupted)",
    "Bu PDF taranmış (görüntü) bir belge gibi görünüyor ve OCR kullanılamadığı için metin okunamadı":
        "This PDF looks like a scanned (image) document and its text could not be read because OCR is unavailable",
    "Taranmış belgeden okunaklı bir metin çıkarılamadı": "No legible text could be extracted from the scanned document",
    "Bu belgeden metin çıkarılamadı (içerik boş olabilir)": "No text could be extracted from this document (it may be empty)",
    "Belge işlenirken beklenmeyen bir hata oluştu": "An unexpected error occurred while processing the document",
    "İşlem yarıda kesildi": "Processing was interrupted",
    "Lütfen dosyayı yeniden yükleyin": "Please upload the file again",
    # youtube
    "Geçerli bir YouTube video bağlantısı girin (ör. https://www.youtube.com/watch?v=…)":
        "Enter a valid YouTube video link (e.g. https://www.youtube.com/watch?v=…)",
    "Oynatma listesi ve kanal bağlantıları desteklenmez": "Playlist and channel links are not supported",
    "Bu videoda altyazı (transkript) yok ya da kapatılmış; metin çıkarılamadı":
        "This video has no captions (transcript) or they are turned off, so no text could be extracted",
    "Video bulunamadı ya da özel, yaş/bölge kısıtlı olduğu için altyazısına erişilemedi":
        "The video was not found, or its captions could not be accessed because it is private or age/region restricted",
    "YouTube, bu sunucudan gelen istekleri şu anda engelliyor": "YouTube is currently blocking requests from this server",
    "Lütfen birkaç dakika sonra tekrar deneyin": "Please try again in a few minutes",
    "sorun sürerse yönetici ile iletişime geçin": "if the problem persists, contact an administrator",
    "Videonun transkripti alınamadı": "The video's transcript could not be retrieved",
    "Videonun altyazısı çok kısa; anlamlı bir metin çıkarılamadı": "The video's captions are too short to extract meaningful text",
    "YouTube zamanında yanıt vermedi": "YouTube did not respond in time",
    "Videonun transkripti işlenirken beklenmeyen bir hata oluştu": "An unexpected error occurred while processing the video's transcript",
    "Bu özellik sunucuda kurulu değil": "This feature is not installed on the server",
    "Otomatik altyazılarda yazım hataları ve noktalama eksikleri olabilir":
        "Auto-generated captions may contain spelling mistakes and missing punctuation",
    "Video çok uzun olduğu için metnin yalnızca ilk bölümü alındı": "The video is very long, so only the first part of the text was kept",
    # çalışma araçları
    "Not boş olamaz": "The note cannot be empty",
    "Yer imi adı boş olamaz": "The bookmark name cannot be empty",
    "Kartın ön yüzü boş olamaz": "The front of the card cannot be empty",
    "Kartın arka yüzü boş olamaz": "The back of the card cannot be empty",
    # yönetim
    "Kendi hesabınız üzerinde bu işlemi yapamazsınız": "You cannot perform this action on your own account",
    "Yönetici hesabı devre dışı bırakılamaz": "An administrator account cannot be deactivated",
    "Önce yönetici rolünü kaldırın": "Remove the administrator role first",
    "Devre dışı hesap yönetici yapılamaz": "A deactivated account cannot be made an administrator",
    "Önce hesabı etkinleştirin": "Activate the account first",
    "Son yöneticinin rolü kaldırılamaz": "The last administrator's role cannot be removed",
    "Rol şu anda değiştirilemedi, lütfen tekrar deneyin": "The role could not be changed right now. Please try again",
    "Yönetici hesabı silinemez": "An administrator account cannot be deleted",
    "Yönetici hesabı buradan silinemez": "An administrator account cannot be deleted from here",
    "Hesap şu anda silinemedi, lütfen tekrar deneyin": "The account could not be deleted right now. Please try again",
}

# Sayı/ad içeren iletiler: (Türkçe kalıp, İngilizce şablon). Şablonda {1}, {2}… yakalanan gruplardır.
_NOUN = {"not": "notes", "yer imi": "bookmarks", "kart": "cards", "test": "quizzes"}
_LANG_NAMES = {"Türkçe": "Turkish", "İngilizce": "English", "Almanca": "German", "Fransızca": "French",
               "İspanyolca": "Spanish", "Arapça": "Arabic", "Rusça": "Russian"}
_SOURCE_NAMES = {"otomatik altyazı": "auto-generated captions", "altyazı": "captions"}


def _en_number(s: str) -> str:
    """Türkçe binlik ayırıcı (400.000) → İngilizce (400,000)."""
    return s.replace(".", ",")


def _en_duration(s: str) -> str:
    return re.sub(r"\b(\d+) sa\b", r"\1 h", re.sub(r"\b(\d+) dk\b", r"\1 min", re.sub(r"\b(\d+) sn\b", r"\1 sec", s)))


def _plural(n: str, one: str, many: str) -> str:
    return one if n == "1" else many


PATTERNS: list[tuple[re.Pattern, Callable[[re.Match], str]]] = [
    (re.compile(r"^Günlük özet sınırına \((\d+)\) ulaştınız$"),
     lambda m: f"You have reached the daily summary limit ({m[1]})"),
    (re.compile(r"^Günlük soru sınırına \((\d+)\) ulaştınız$"),
     lambda m: f"You have reached the daily question limit ({m[1]})"),
    (re.compile(r"^Günlük test sınırına \((\d+)\) ulaştınız$"),
     lambda m: f"You have reached the daily quiz limit ({m[1]})"),
    (re.compile(r"^Günlük kart üretme sınırına \((\d+)\) ulaştınız$"),
     lambda m: f"You have reached the daily card generation limit ({m[1]})"),
    (re.compile(r"^Günlük yükleme sınırına \((\d+)\) ulaştınız$"),
     lambda m: f"You have reached the daily upload limit ({m[1]})"),
    (re.compile(r"^Dosya en fazla (\d+) MB olabilir$"),
     lambda m: f"The file can be at most {m[1]} MB"),
    (re.compile(r"^Bu belge için en fazla (\d+) (not|yer imi|kart|test) saklanır$"),
     lambda m: f"At most {m[1]} {_NOUN[m[2]]} can be stored for this document"),
    (re.compile(r"^(\d+) sorunun hepsi için bir yanıt gönderilmeli \(boş için null\)$"),
     lambda m: f"An answer must be sent for all {m[1]} questions (use null for blank)"),
    (re.compile(r"^Dosya bozuk veya geçerli bir (.+) belgesi değil$"),
     lambda m: f"The file is corrupted or is not a valid {m[1]} document"),
    (re.compile(r"^Bu dosya geçerli bir (.+) belgesi değil$"),
     lambda m: f"This file is not a valid {m[1]} document"),
    (re.compile(r"^(\d+) görsel sayfa OCR ile okundu; okuma hataları olabilir$"),
     lambda m: f"{m[1]} image {_plural(m[1], 'page was', 'pages were')} read with OCR; there may be reading errors"),
    (re.compile(r"^OCR en fazla (\d+) sayfa için uygulanır, kalan görsel sayfalar atlandı$"),
     lambda m: f"OCR is applied to at most {m[1]} pages; the remaining image pages were skipped"),
    (re.compile(r"^Belge çok uzun olduğu için ilk ([\d.,]+) karakter alındı$"),
     lambda m: f"The document is very long, so only the first {_en_number(m[1])} characters were kept"),
    (re.compile(r"^YouTube transkripti \((.+?), (Türkçe|İngilizce|Almanca|Fransızca|İspanyolca|Arapça|Rusça|[^,]+), "
                r"(otomatik altyazı|altyazı)\)$"),
     lambda m: f"YouTube transcript ({_en_duration(m[1])}, {_LANG_NAMES.get(m[2], m[2])}, {_SOURCE_NAMES[m[3]]})"),
]

_SENT_SPLIT = re.compile(r"(?<=[.!?…])\s+")
_CLAUSE_SPLIT = re.compile(r"(?<=;)\s+")   # tüm cümle eşleşmezse noktalı virgülle ayrılan yan cümleler tek tek çevrilir
_TITLE_YT = re.compile(r"^YouTube videosu \(([A-Za-z0-9_-]{11})\)$")


def _lookup(core: str) -> str | None:
    if core in EN:
        return EN[core]
    for rx, fn in PATTERNS:
        m = rx.match(core)
        if m:
            return fn(m)
    return None


def _translate_sentence(s: str) -> str:
    core = s.rstrip(".!?…").rstrip()
    tail = s[len(core):]
    out = _lookup(core)
    if out is not None:
        return out + tail
    if ";" in core:   # "…devam edebilirsiniz; yeni bölümler yarın hazırlanır" gibi birleşik cümleler
        pieces = _CLAUSE_SPLIT.split(core)
        done = [_lookup(c.rstrip(";").rstrip()) for c in pieces]
        if all(d is not None for d in done):
            return "; ".join(d[:1].lower() + d[1:] if i else d for i, d in enumerate(done)) + tail
    return s   # bilinmeyen cümle olduğu gibi kalır


def translate(msg: str | None, lang: str) -> str | None:
    """Türkçe kaynak iletiyi `lang` diline çevirir. Türkçe isteğe ya da bilinmeyen iletiye dokunmaz."""
    if not msg or norm_lang(lang) != "en":
        return msg
    parts = _SENT_SPLIT.split(msg.strip())
    return " ".join(_translate_sentence(p) for p in parts)


def translate_title(title: str | None, lang: str) -> str | None:
    """Sistemin kendi koyduğu başlıkları çevirir (kullanıcının dosya adına dokunmaz)."""
    if title and norm_lang(lang) == "en":
        m = _TITLE_YT.match(title)
        if m:
            return f"YouTube video ({m[1]})"
    return title


# ---------------------------------------------------------------------------------------------
# Modele giden isteklerde ve kaynak etiketlerinde kullanılan dil bilgisi
LANG_NAME = {"tr": "Türkçe", "en": "English"}
SECTION_WORD = {"tr": "Bölüm", "en": "Section"}   # cevaplardaki [Bölüm 3] / [Section 3] kaynak etiketi
SLIDE_WORD = {"tr": "Slayt", "en": "Slide"}
