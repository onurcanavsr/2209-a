"""Metni sesli okumaya hazırlar: Markdown işaretlerini temizler, cümlelere ve bölümlere ayırır."""
import re

FIRST_SEGMENT_MAX = 500  # ilk bölüm kısa: oynatma hızlı başlasın
_HEAD = re.compile(r"^#{1,6}\s+(.*)$")
_BULLET = re.compile(r"^[-*•]\s+(.*)$")
_SLIDE = re.compile(r"^\[Slayt (\d+)\]$")
_SENT_SPLIT = re.compile(r"(?<=[.!?…])\s+")


def _inline(line: str) -> str:
    line = re.sub(r"\*\*(.+?)\*\*", r"\1", line)
    return line.replace("*", "").replace("`", "").replace("_", " ").strip()


def _punct(line: str) -> str:
    return line if line and line[-1] in ".!?…:;" else line + "."


def prepare(text: str, source: str) -> list[str]:
    """Okunacak 'birimleri' (başlık, madde, paragraf) döndürür."""
    units: list[str] = []
    para: list[str] = []

    def flush():
        if para:
            units.append(_punct(" ".join(para)))
            para.clear()

    for raw in text.replace("\r", "").split("\n"):
        line = raw.strip()
        if not line:
            flush()
            continue
        if (m := _HEAD.match(line)):
            flush()
            t = _inline(m.group(1)).rstrip(":.")
            if t:
                units.append(t + ".")
        elif (m := _BULLET.match(line)):
            flush()
            t = _inline(m.group(1))
            if t:
                units.append(_punct(t))
        elif (m := _SLIDE.match(line)):
            flush()
            units.append(f"Slayt {m.group(1)}.")
        elif source == "summary" or " | " in line:  # özet satır satır; tablo satırı ayrı okunur
            flush()
            t = _inline(line.replace(" | ", ", "))
            if t:
                units.append(_punct(t))
        else:  # asıl metin: PDF'te cümle satır sonunda bölünür, paragrafı birleştir
            para.append(_inline(line))
    flush()
    return [u for u in units if len(u) > 1]


def _hard_split(sentence: str, size: int) -> list[str]:
    out = []
    while len(sentence) > size:
        cut = sentence.rfind(" ", 0, size)
        cut = cut if cut > size // 2 else size
        out.append(sentence[:cut].strip())
        sentence = sentence[cut:].strip()
    if sentence:
        out.append(sentence)
    return out


def split_segments(units: list[str], size: int) -> list[str]:
    """Birimleri cümle sınırlarında, en çok `size` karakterlik bölümlere paketler."""
    sentences: list[str] = []
    for u in units:
        for sent in _SENT_SPLIT.split(u):
            sent = sent.strip()
            if sent:
                sentences.extend(_hard_split(sent, size) if len(sent) > size else [sent])
    segments: list[str] = []
    cur = ""
    for sent in sentences:
        limit = min(size, FIRST_SEGMENT_MAX) if not segments else size
        if cur and len(cur) + 1 + len(sent) > limit:
            segments.append(cur)
            cur = sent
        else:
            cur = f"{cur} {sent}" if cur else sent
    if cur:
        segments.append(cur)
    return segments
