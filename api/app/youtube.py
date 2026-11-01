"""YouTube bağlantısından transkript (altyazı) çıkarma. Resmî bir API değildir: `youtube-transcript-api` kütüphanesi
videonun herkese açık altyazısını okur. YouTube bulut sunucu IP'lerini sıkça engeller (bkz. docs ve README); bu durumda
`YOUTUBE_PROXY_URL` ile bir proxy verilebilir ya da özellik kapalı bırakılabilir."""
import html
import logging
import re
from dataclasses import dataclass
from urllib.parse import parse_qs, urlparse

import httpx

log = logging.getLogger(__name__)

_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtu.be"}
PREFERRED_LANGS = ["tr", "en"]
LANG_ADI = {"tr": "Türkçe", "en": "İngilizce", "de": "Almanca", "fr": "Fransızca", "es": "İspanyolca", "ar": "Arapça", "ru": "Rusça"}

BAD_URL = ("Geçerli bir YouTube video bağlantısı girin (ör. https://www.youtube.com/watch?v=…). "
           "Oynatma listesi ve kanal bağlantıları desteklenmez.")
NO_CAPTIONS = "Bu videoda altyazı (transkript) yok ya da kapatılmış; metin çıkarılamadı."
UNAVAILABLE = "Video bulunamadı ya da özel, yaş/bölge kısıtlı olduğu için altyazısına erişilemedi."
BLOCKED = ("YouTube, bu sunucudan gelen istekleri şu anda engelliyor. Lütfen birkaç dakika sonra tekrar deneyin; "
           "sorun sürerse yönetici ile iletişime geçin.")
GENERIC = "Videonun transkripti alınamadı. Lütfen daha sonra tekrar deneyin."


class YouTubeError(Exception):
    """Mesajı kullanıcıya gösterilebilir (teknik ayrıntı içermez)."""


@dataclass
class Transcript:
    text: str
    language: str        # dil kodu (ör. "tr")
    generated: bool      # otomatik üretilmiş altyazı mı
    seconds: int         # videonun (altyazıya göre) süresi


def video_id_from_url(url: str) -> str:
    """Yalnızca YouTube adreslerinden 11 karakterlik video kimliğini çıkarır; başka her şeyi reddeder.
    Sunucu bu adrese istek ATMAZ (yalnızca kimlik kullanılır), bu yüzden SSRF riski yoktur."""
    raw = (url or "").strip()
    if not raw or len(raw) > 300 or re.search(r"\s", raw):
        raise YouTubeError(BAD_URL)
    if "://" not in raw:
        raw = "https://" + raw
    try:
        p = urlparse(raw)
        port = p.port
    except ValueError:
        raise YouTubeError(BAD_URL)
    host = (p.hostname or "").lower()
    if p.scheme not in ("http", "https") or host not in _HOSTS or p.username or p.password or port not in (None, 80, 443):
        raise YouTubeError(BAD_URL)
    parts = [x for x in p.path.split("/") if x]
    cand = None
    if host.endswith("youtu.be"):
        cand = parts[0] if parts else None
    elif parts and parts[0] == "watch":
        cand = (parse_qs(p.query).get("v") or [None])[0]
    elif len(parts) > 1 and parts[0] in ("shorts", "embed", "live", "v"):
        cand = parts[1]
    if not cand or not _ID.match(cand):
        raise YouTubeError(BAD_URL)
    return cand


def format_text(snippets: list[tuple[float, float, str]]) -> tuple[str, int]:
    """Altyazı parçalarını okunur paragraflara böler (zaman damgası eklenmez: özet ve sesli okumayı bozar).
    Metin olduğu gibi korunur; yalnızca HTML kaçışları çözülür ve boşluklar sadeleştirilir."""
    paras: list[str] = []
    cur: list[str] = []
    cur_len = 0
    last_end = 0.0
    prev_end = None
    for start, dur, raw in snippets:
        t = re.sub(r"\s+", " ", html.unescape(raw or "")).strip()
        end = float(start) + float(dur or 0)
        last_end = max(last_end, end)
        if not t:
            continue
        gap = (float(start) - prev_end) if prev_end is not None else 0.0
        sentence_end = bool(cur) and cur[-1].rstrip()[-1:] in ".?!…"
        if cur and (gap > 6 or cur_len >= 900 or (cur_len >= 500 and sentence_end)):
            paras.append(" ".join(cur))
            cur, cur_len = [], 0
        cur.append(t)
        cur_len += len(t) + 1
        prev_end = end
    if cur:
        paras.append(" ".join(cur))
    return "\n\n".join(paras), int(last_end)


def _map_error(e: Exception) -> YouTubeError:
    n = type(e).__name__
    if n in ("RequestBlocked", "IpBlocked"):
        log.warning("YouTube isteği engelledi (%s). Proxy gerekebilir.", n)
        return YouTubeError(BLOCKED)
    if n in ("TranscriptsDisabled", "NoTranscriptFound", "NotTranslatable"):
        return YouTubeError(NO_CAPTIONS)
    if n in ("VideoUnavailable", "VideoUnplayable", "AgeRestricted", "InvalidVideoId", "PoTokenRequired"):
        return YouTubeError(UNAVAILABLE)
    log.exception("Transkript alınamadı (%s)", n)
    return YouTubeError(GENERIC)


def fetch_transcript(video_id: str, proxy_url: str = "") -> Transcript:
    """Eşzamanlı (thread içinde çalıştırılır). Sıra: elle girilmiş tr/en → otomatik tr/en → mevcut herhangi bir dil."""
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
    except ImportError:
        log.error("youtube-transcript-api kurulu değil")
        raise YouTubeError("Bu özellik sunucuda kurulu değil.")
    kwargs = {}
    if proxy_url:
        from youtube_transcript_api.proxies import GenericProxyConfig
        kwargs["proxy_config"] = GenericProxyConfig(http_url=proxy_url, https_url=proxy_url)
    try:
        tlist = YouTubeTranscriptApi(**kwargs).list(video_id)
        chosen = None
        for finder in (tlist.find_manually_created_transcript, tlist.find_generated_transcript):
            try:
                chosen = finder(PREFERRED_LANGS)
                break
            except Exception as e:
                if type(e).__name__ != "NoTranscriptFound":
                    raise
        if chosen is None:
            chosen = next(iter(tlist), None)   # tr/en yoksa videonun sahip olduğu ilk altyazı
        if chosen is None:
            raise YouTubeError(NO_CAPTIONS)
        fetched = chosen.fetch()
        snippets = [(s.start, s.duration, s.text) for s in fetched]
        lang, generated = chosen.language_code, bool(chosen.is_generated)
    except YouTubeError:
        raise
    except Exception as e:
        raise _map_error(e) from e
    text, seconds = format_text(snippets)
    return Transcript(text=text, language=lang, generated=generated, seconds=seconds)


async def fetch_title(video_id: str) -> str | None:
    """Başlık için YouTube'un herkese açık oEmbed uç noktası. İstek adresi yalnızca doğrulanmış kimlikten kurulur."""
    try:
        async with httpx.AsyncClient(timeout=6) as c:
            r = await c.get("https://www.youtube.com/oembed",
                            params={"url": f"https://www.youtube.com/watch?v={video_id}", "format": "json"})
        if r.status_code != 200:
            return None
        t = re.sub(r"[\x00-\x1f]", "", str(r.json().get("title", ""))).strip()
        return t[:200] or None
    except Exception:
        return None


def sure_yazi(seconds: int) -> str:
    if seconds >= 3600:
        return f"{seconds // 3600} sa {seconds % 3600 // 60} dk"
    if seconds >= 60:
        return f"{seconds // 60} dk {seconds % 60} sn"
    return f"{seconds} sn"
