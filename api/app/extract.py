"""Belgeden metin çıkarma. Dosyalar diske yazılmaz, bellekte işlenir.
Tüm ExtractError mesajları kullanıcıya gösterilebilir (Türkçe) metinlerdir."""
import io
import re
import shutil
import zipfile
from dataclasses import dataclass
from functools import lru_cache

from .config import get_settings

MAGIC_PDF = b"%PDF-"
MAGIC_ZIP = b"PK\x03\x04"
KINDS = {"pdf", "docx", "pptx"}
MAX_ZIP_ENTRIES = 3000
MIN_PAGE_CHARS = 25  # bundan az metin içeren PDF sayfası görsel/taranmış sayılır


class ExtractError(Exception):
    pass


class UnsupportedFile(ExtractError):
    pass


@dataclass
class Extracted:
    text: str
    page_count: int | None = None
    used_ocr: bool = False
    truncated: bool = False
    note: str | None = None
    pages: list[str] | None = None         # sayfa/slayt başına HAM metin; yalnızca çıkarma sırasında kullanılır, kaydedilmez
    page_starts: list[int] | None = None   # her sayfanın `text` içindeki başlangıç karakteri (sayfa gezintisi için)
    page_kinds: list[str] | None = None    # sayfa başına: "text" | "ocr" (görüntüden OCR ile okundu) | "image" (görüntü, metin okunamadı)
    pages_approx: bool = False             # Word: sayfa sınırları yaklaşık (dosyada yerleşim bilgisi yok)


def clean_filename(name: str | None) -> str:
    name = (name or "belge").replace("\\", "/").split("/")[-1]
    name = re.sub(r"[\x00-\x1f]", "", name).strip() or "belge"
    return name[:200]


def detect_kind(filename: str, data: bytes) -> str:
    """Uzantıya VE dosyanın gerçek başlığına bakar (uzantı sahteciliğine karşı)."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in KINDS:
        raise UnsupportedFile("Desteklenen türler: PDF, Word (.docx) ve PowerPoint (.pptx).")
    ok = data[:1024].lstrip().startswith(MAGIC_PDF) if ext == "pdf" else data.startswith(MAGIC_ZIP)
    if not ok:
        raise UnsupportedFile("Dosyanın içeriği uzantısıyla uyuşmuyor veya dosya geçerli değil.")
    return ext


# ---------------- OCR ----------------
def ocr_available() -> bool:
    return shutil.which("tesseract") is not None


@lru_cache
def _ocr_lang() -> str:
    try:
        import pytesseract
        langs = set(pytesseract.get_languages())
    except Exception:
        return "eng"
    want = [l for l in ("tur", "eng") if l in langs]
    return "+".join(want) or "eng"


def tesseract_ocr(img) -> str:
    import pytesseract
    return pytesseract.image_to_string(img, lang=_ocr_lang(), timeout=90)


def get_ocr_fn():
    """Testlerde değiştirilebilsin diye çağrı anında çözülür."""
    return tesseract_ocr if ocr_available() else None


# ---------------- güvenlik ----------------
def _check_zip(data: bytes, required: str, what: str) -> None:
    s = get_settings()
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            infos = z.infolist()
            total = sum(i.file_size for i in infos)
            if len(infos) > MAX_ZIP_ENTRIES or total > s.max_uncompressed_mb * 1024 * 1024:
                raise ExtractError("Dosya güvenlik sınırlarını aşıyor (açıldığında aşırı büyük).")
            names = set(z.namelist())
    except zipfile.BadZipFile:
        raise ExtractError(f"Dosya bozuk veya geçerli bir {what} belgesi değil.")
    if "[Content_Types].xml" not in names or required not in names:
        raise ExtractError(f"Bu dosya geçerli bir {what} belgesi değil.")


# ---------------- biçimlere göre çıkarma ----------------
def _pdf(data: bytes) -> Extracted:
    import pypdfium2 as pdfium

    s = get_settings()
    try:
        pdf = pdfium.PdfDocument(data)
    except Exception as e:
        if "password" in str(e).lower():
            raise ExtractError("Parola korumalı PDF'ler desteklenmiyor.")
        raise ExtractError("PDF dosyası açılamadı (bozuk olabilir).")
    try:
        n = len(pdf)
        if n > s.max_pages:
            raise ExtractError(f"PDF en fazla {s.max_pages} sayfa olabilir (bu dosya {n} sayfa).")
        ocr = get_ocr_fn()
        parts: list[str] = []
        kinds: list[str] = []
        ocr_pages = image_pages = 0
        for i in range(n):
            page = pdf[i]
            try:
                tp = page.get_textpage()
                try:
                    t = tp.get_text_range() or ""
                finally:
                    tp.close()
                kind = "text"
                if len(t.strip()) < MIN_PAGE_CHARS:
                    image_pages += 1
                    kind = "image"
                    if ocr is not None and ocr_pages < s.ocr_max_pages:
                        try:
                            t = ocr(page.render(scale=200 / 72).to_pil().convert("RGB")) or ""
                            ocr_pages += 1
                            kind = "ocr" if t.strip() else "image"
                        except Exception:
                            t = ""
                    if kind == "image" and t.strip():
                        kind = "text"       # OCR uygulanmadı ama sayfada kısa gerçek metin var (ör. sayfa numarası)
                parts.append(t)
                kinds.append(kind)
            finally:
                page.close()
        note = None
        if ocr_pages:
            note = f"{ocr_pages} görsel sayfa OCR ile okundu; okuma hataları olabilir."
            if image_pages > ocr_pages:
                note += f" OCR en fazla {s.ocr_max_pages} sayfa için uygulanır, kalan görsel sayfalar atlandı."
        return Extracted("\n\n".join(parts), page_count=n, used_ocr=ocr_pages > 0, note=note, pages=parts, page_kinds=kinds)
    finally:
        pdf.close()


def _dedupe_cells(cells: list[str]) -> list[str]:
    out: list[str] = []
    for c in cells:
        if not out or c != out[-1]:  # birleştirilmiş hücreler tekrar etmesin
            out.append(c)
    return out


_W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
APPROX_PAGE_CHARS = 3000   # Word yerleşim bilgisi yoksa yaklaşık sayfa boyu (karakter)


def _para_scan(p_el):
    """Paragrafın metnini ve içindeki sayfa işaretlerini (metindeki konumuyla) çıkarır.
    "rendered": Word'ün son kaydettiği yerleşimdeki sayfa başı (lastRenderedPageBreak); "explicit": yazarın koyduğu sayfa sonu."""
    mine: list[str] = []
    n = 0
    marks: list[tuple[int, str]] = []
    for el in p_el.iter():
        tag = el.tag
        if tag == _W + "t":
            x = el.text or ""
            mine.append(x)
            n += len(x)
        elif tag in (_W + "tab", _W + "cr", _W + "noBreakHyphen") or (tag == _W + "br" and el.get(_W + "type") in (None, "textWrapping")):
            mine.append({"tab": "\t", "noBreakHyphen": "-"}.get(tag.rsplit("}", 1)[-1], "\n"))
            n += 1
        elif tag == _W + "br" and el.get(_W + "type") == "page":
            marks.append((n, "explicit"))
        elif tag == _W + "lastRenderedPageBreak":
            marks.append((n, "rendered"))
    return "".join(mine), marks


def _flag_on(el) -> bool:
    return el is not None and el.get(_W + "val") not in ("0", "false", "off")


def _split_marks(base: str, mine: str, marks):
    """Sayfa işaretlerini, paragrafın (strip edilmiş) metnindeki konumlara çevirir → (öncesi, [(işaret, parça)], sonrası)."""
    if not marks:
        return [], [(None, base)], []
    if mine.strip() != base:                      # metin birebir yeniden kurulamadı (metin kutusu vb.): paragrafın başında böl
        return [marks[0][1]], [(None, base)], []
    lead = len(mine) - len(mine.lstrip())
    pre: list[str] = []
    post: list[str] = []
    cuts: list[tuple[int, str]] = []
    for off, kind in marks:
        o = off - lead
        while 0 < o < len(base) and not base[o - 1].isspace() and not base[o].isspace():
            o -= 1                                # kelimenin ortasında bölme: kelimenin başına çek (kelime sıraları kaymasın)
        if o <= 0:
            pre.append(kind)
        elif o >= len(base):
            post.append(kind)
        else:
            cuts.append((o, kind))
    cuts.sort()
    pieces: list[tuple[str | None, str]] = []
    prev, pk = 0, None
    for o, kind in cuts:
        if o == prev:
            pk = kind
            continue
        pieces.append((pk, base[prev:o]))
        prev, pk = o, kind
    pieces.append((pk, base[prev:]))
    return pre, pieces, post


def _chunk_pages(pages: list[list[str]]) -> tuple[list[list[str]], bool]:
    """Yerleşim bilgisi olmayan Word dosyası: uzun sayfaları paragraf sınırlarında ~APPROX_PAGE_CHARS karakterlik parçalara böler."""
    out: list[list[str]] = []
    split = False
    for lines in pages:
        cur: list[str] = []
        n = 0
        for ln in lines:
            if cur and n + len(ln) > APPROX_PAGE_CHARS:
                out.append(cur)
                cur, n, split = [], 0, True
            cur.append(ln)
            n += len(ln) + 1
        if cur:
            out.append(cur)
    return out, split


def _docx(data: bytes) -> Extracted:
    from docx import Document
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    _check_zip(data, "word/document.xml", "Word")
    try:
        doc = Document(io.BytesIO(data))
    except Exception:
        raise ExtractError("Word dosyası açılamadı (bozuk olabilir).")
    out: list[str] = []                 # tüm metin (sayfa gezintisinden bağımsız, eskisiyle aynı)
    pages: list[list[str]] = [[]]       # sayfa gezintisi için satırlar
    rendered = False

    def brk(kind: str) -> None:
        nonlocal rendered
        rendered = rendered or kind == "rendered"
        if pages[-1]:                   # boş sayfa açılmaz (açık sayfa sonu + Word'ün yazdığı işaret çift sayılmaz)
            pages.append([])

    for child in doc.element.body.iterchildren():
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "p":
            p = Paragraph(child, doc)
            base = p.text.strip()
            ppr = child.find(_W + "pPr")
            if ppr is not None and _flag_on(ppr.find(_W + "pageBreakBefore")):
                brk("explicit")
            sect_after = False
            if ppr is not None and ppr.find(_W + "sectPr") is not None:
                ty = ppr.find(_W + "sectPr").find(_W + "type")
                sect_after = ty is None or ty.get(_W + "val") != "continuous"
            mine, marks = _para_scan(child)
            if not base:
                for _, kind in marks:       # yalnızca sayfa sonu içeren paragraf
                    brk(kind)
                if sect_after:
                    brk("explicit")
                continue
            t = base
            style = ((p.style.name if p.style is not None else "") or "").lower()
            m = re.match(r"(heading|başlık)\s*(\d)", style)
            if style == "title":
                t = "# " + base
            elif m:
                t = "#" * min(int(m.group(2)) + 1, 6) + " " + base
            prefix = t[: len(t) - len(base)]
            out.append(t)
            pre, pieces, post = _split_marks(base, mine, marks)
            for kind in pre:
                brk(kind)
            for i, (kind, piece) in enumerate(pieces):
                if kind:
                    brk(kind)
                pages[-1].append(prefix + piece if i == 0 else piece)
            for kind in post:
                brk(kind)
            if sect_after:
                brk("explicit")
        elif tag == "tbl":
            for row in Table(child, doc).rows:
                cells = _dedupe_cells([c.text.strip().replace("\n", " ") for c in row.cells])
                if any(cells):
                    line = " | ".join(cells)
                    if row._tr.find(".//" + _W + "lastRenderedPageBreak") is not None:
                        brk("rendered")
                    out.append(line)
                    pages[-1].append(line)
    page_lines = [p for p in pages if p]
    approx = False
    if not rendered:                    # Word yerleşimi kayıtlı değil (Word dışı program): uzun sayfalar yaklaşık bölünür
        page_lines, approx = _chunk_pages(page_lines)
    return Extracted("\n".join(out), pages=["\n".join(p) for p in page_lines], pages_approx=approx)


def _walk_shapes(shapes):
    for sh in shapes:
        if getattr(sh, "shape_type", None) == 6:  # grup
            yield from _walk_shapes(sh.shapes)
        else:
            yield sh


def _pptx(data: bytes) -> Extracted:
    from pptx import Presentation

    _check_zip(data, "ppt/presentation.xml", "PowerPoint")
    try:
        prs = Presentation(io.BytesIO(data))
    except Exception:
        raise ExtractError("PowerPoint dosyası açılamadı (bozuk olabilir).")
    out: list[str] = []
    slides: list[str] = []   # slayt başına metin (sayfa gezintisi için)
    for i, slide in enumerate(prs.slides, 1):
        basla = len(out)
        out.append(f"[Slayt {i}]")
        for sh in _walk_shapes(slide.shapes):
            if sh.has_text_frame:
                t = sh.text_frame.text.strip()
                if t:
                    out.append(t)
            if getattr(sh, "has_table", False) and sh.has_table:
                for row in sh.table.rows:
                    cells = _dedupe_cells([c.text.strip().replace("\n", " ") for c in row.cells])
                    if any(cells):
                        out.append(" | ".join(cells))
        if slide.has_notes_slide:
            n = slide.notes_slide.notes_text_frame.text.strip()
            if n:
                out.append("Konuşmacı notu: " + n)
        slides.append("\n".join(out[basla:]))
    return Extracted("\n".join(out), page_count=len(prs.slides), pages=slides)


def _normalize(text: str) -> str:
    text = text.replace("\x00", "").replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t\f\v]+\n", "\n", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _page_starts(text: str, pages: list[str]) -> list[int] | None:
    """Her sayfanın, normalize edilmiş `text` içindeki başlangıç konumu.
    `text` DEĞİŞTİRİLMEZ (özet, soru-cevap, sesli okuma vb. aynı metni kullanır); yalnızca sayfaların nereden başladığı bulunur.
    Boş sayfa, bir sonraki sayfayla aynı konumu alır (metni boş gösterilir). Hizalanamazsa None döner:
    bu durumda sayfa gezintisi kapanır, başka hiçbir şey etkilenmez."""
    starts: list[int] = []
    cursor = 0
    for part in pages:
        c = _normalize(part)
        pos = cursor
        while pos < len(text) and text[pos].isspace():
            pos += 1
        if c and not text.startswith(c, pos):
            return None
        starts.append(pos)
        if c:
            cursor = pos + len(c)
    return starts or None


# İstemcinin (tarayıcı) text.split(/\s+/) ile saydığı boşluk kümesi: kelime sıraları (yer imleri) iki tarafta aynı çıksın
_WS = re.compile(r"[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+")
_WS_SON = re.compile(r"[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+$")


def kelime_sayisi(s: str) -> int:
    return sum(1 for p in _WS.split(s) if p)


def gecerli_baslangiclar(starts, text_len: int) -> list[int] | None:
    """Veritabanından gelen sayfa başlangıçlarını doğrular (tamsayı, artan, metnin içinde)."""
    if not isinstance(starts, list) or not starts:
        return None
    prev = 0
    for s in starts:
        if type(s) is not int or s < prev or s > text_len:
            return None
        prev = s
    return starts


def sayfa_metni(text: str, starts: list[int], i: int) -> str:
    a = starts[i]
    b = starts[i + 1] if i + 1 < len(starts) else len(text)
    return _WS_SON.sub("", text[a:b])


def sayfa_kelime_baslangiclari(text: str, starts: list[int]) -> list[int]:
    """Her sayfadan ÖNCE kaç kelime olduğu (belge genelindeki kelime sırası = bu değer + sayfa içi sıra)."""
    out: list[int] = []
    n = 0
    for i, a in enumerate(starts):
        out.append(n)
        b = starts[i + 1] if i + 1 < len(starts) else len(text)
        n += kelime_sayisi(text[a:b])
    return out


def extract(kind: str, data: bytes) -> Extracted:
    """Senkron ve CPU yoğun: çağıran thread pool içinde çalıştırmalıdır."""
    s = get_settings()
    res = {"pdf": _pdf, "docx": _docx, "pptx": _pptx}[kind](data)
    res.text = _normalize(res.text)
    pages, res.pages = res.pages, None
    if len(res.text) < 5:
        if kind == "pdf":
            if get_ocr_fn() is None:
                raise ExtractError("Bu PDF taranmış (görüntü) bir belge gibi görünüyor ve OCR kullanılamadığı için metin okunamadı.")
            raise ExtractError("Taranmış belgeden okunaklı bir metin çıkarılamadı.")
        raise ExtractError("Bu belgeden metin çıkarılamadı (içerik boş olabilir).")
    if pages is not None:
        res.page_starts = _page_starts(res.text, pages)
        if res.page_starts and (res.page_kinds is None or len(res.page_kinds) != len(res.page_starts)):
            res.page_kinds = ["text"] * len(res.page_starts)
        if not res.page_starts:
            res.page_kinds = None
    if len(res.text) > s.max_text_chars:
        res.text = res.text[: s.max_text_chars]
        if res.page_starts:
            keep = [i for i, p in enumerate(res.page_starts) if p < len(res.text)]
            res.page_starts = [res.page_starts[i] for i in keep] or None
            res.page_kinds = [res.page_kinds[i] for i in keep] if res.page_starts and res.page_kinds else None
        res.truncated = True
        extra = f"Belge çok uzun olduğu için ilk {s.max_text_chars:,} karakter alındı.".replace(",", ".")
        res.note = f"{res.note} {extra}" if res.note else extra
    return res
