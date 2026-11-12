"""Belgeden metin çıkarma. Dosyalar diske yazılmaz, bellekte işlenir.
Tüm ExtractError mesajları kullanıcıya gösterilebilir (Türkçe) metinlerdir."""
import hashlib
import io
import re
import shutil
import time
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
    images: list[dict] | None = None       # görsellerden OCR ile okunan metin: [{"page": 0 tabanlı sayfa, "text": ..., "st": "ok"|"empty"|"skip"}]


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


# ---------------- görsellerden (resim/fotoğraf/ekran görüntüsü) metin okuma ----------------
MAX_IMAGE_ENTRIES = 200      # bir belgede kaydedilecek en çok görsel
MAX_IMAGE_PIXELS = 40_000_000
RENDER_SCALE = 200 / 72


def _prep_for_ocr(img):
    """OCR için hazırlık: saydamlığı beyaza oturt, gri tona çevir, koyu zemini ters çevir (koyu temalı ekran görüntüleri),
    küçük görselleri büyüt, çok büyükleri küçült."""
    from PIL import Image, ImageOps, ImageStat

    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        rgba = img.convert("RGBA")
        bg = Image.new("RGBA", rgba.size, "white")
        bg.alpha_composite(rgba)
        img = bg
    g = img.convert("L")
    if ImageStat.Stat(g).mean[0] < 100:
        g = ImageOps.invert(g)
    w, h = g.size
    if w < 900:
        f = min(3.0, 1200 / w)
        g = g.resize((max(1, int(w * f)), max(1, int(h * f))), Image.LANCZOS)
    elif max(w, h) > 4000:
        f = 4000 / max(w, h)
        g = g.resize((max(1, int(w * f)), max(1, int(h * f))), Image.LANCZOS)
    return g


def _clean_ocr(text: str) -> str:
    """Fotoğraf/çizimlerden gelen gürültüyü (çizgi, simge, anlamsız karakterler) süzer; geriye anlamlı bir şey kalmazsa boş döner."""
    lines: list[str] = []
    for ln in (text or "").replace("\r", "\n").split("\n"):
        s = ln.strip()
        if not s:
            if lines and lines[-1] != "":
                lines.append("")
            continue
        alnum = sum(c.isalnum() for c in s)
        if alnum >= 2 and alnum / len(s) >= 0.45:
            lines.append(s)
    out = "\n".join(lines).strip()
    words = re.findall(r"\w+", out)
    return out if (sum(1 for w in words if len(w) >= 3) >= 2 or any(len(w) >= 5 for w in words)) else ""


def _open_image(blob: bytes):
    """Görsel baytlarını açar; desteklenmeyen biçim (EMF/WMF/SVG) veya aşırı büyük görselde None."""
    try:
        from PIL import Image

        im = Image.open(io.BytesIO(blob))
        if im.width * im.height > MAX_IMAGE_PIXELS:
            return None
        im.load()
        return im
    except Exception:
        return None


class _ImageReader:
    """Belgedeki görsellerden OCR ile metin okur. Bütçe (en çok N görsel + toplam süre), aynı görselin tekrarı için önbellek
    ve gürültü süzme burada. Her görsel için bir kayıt tutulur: okunamayan da kaydedilir (kullanıcı görselin var olduğunu görsün)."""

    def __init__(self, ocr):
        s = get_settings()
        self.ocr = ocr
        self.budget = s.ocr_max_images
        self.min_px = s.ocr_min_image_px
        self.max_chars = s.image_text_max_chars
        self.deadline = time.monotonic() + s.ocr_images_seconds
        self.cache: dict[str, tuple[str, str]] = {}
        self.items: list[dict] = []

    def exhausted(self) -> bool:
        return self.budget <= 0 or time.monotonic() > self.deadline

    def add_skipped(self, page: int) -> None:
        """Okunmayacak görsel (bütçe/süre bitti): sayfa çizilmeden yalnızca 'okunmadı' olarak kaydedilir."""
        if len(self.items) < MAX_IMAGE_ENTRIES:
            self.items.append({"page": page, "text": "", "st": "skip"})

    def add(self, page: int, img, key: str | None = None) -> None:
        if len(self.items) >= MAX_IMAGE_ENTRIES or min(img.size) < self.min_px:
            return                                           # simge / madde işareti
        if key is None:
            key = hashlib.sha1(img.convert("L").tobytes()).hexdigest()
        if key in self.cache:
            st, text = self.cache[key]
        elif self.budget <= 0 or time.monotonic() > self.deadline:
            st, text = "skip", ""
        else:
            self.budget -= 1
            try:
                text = _clean_ocr(self.ocr(_prep_for_ocr(img)) or "")[: self.max_chars]
            except Exception:
                text = ""
            st = "ok" if text else "empty"
            self.cache[key] = (st, text)
        self.items.append({"page": page, "text": text, "st": st})


def _pdf_page_images(page, i: int, reader: _ImageReader) -> None:
    """Metinli bir PDF sayfasındaki resimleri bulur (üstten alta, soldan sağa) ve sayfadan kırparak OCR'a verir.
    Sayfayı kaplayan tarama zeminleri (zaten metin katmanı var) ve simgeler atlanır."""
    import pypdfium2.raw as pr

    try:
        if page.get_rotation() != 0:
            return
        W, H = page.get_size()
        cand = []
        for o in page.get_objects(filter=[pr.FPDF_PAGEOBJ_IMAGE], max_depth=4):
            l, b, r, t = (getattr(o, "get_bounds", None) or o.get_pos)()      # pypdfium2 5.x: get_bounds, 4.x: get_pos
            w, h = r - l, t - b
            if w < 36 or h < 36 or w * h > 0.85 * W * H:
                continue
            cand.append((t, l, b, r))
        if not cand:
            return
        cand.sort(key=lambda c: (-c[0], c[1]))
        if reader.exhausted():                       # bütçe/süre bitti: sayfayı çizmeye gerek yok
            for _ in cand[:8]:
                reader.add_skipped(i)
            return
        bitmap = page.render(scale=RENDER_SCALE).to_pil().convert("RGB")
        for t, l, b, r in cand[:8]:
            box = (max(0, int(l * RENDER_SCALE)), max(0, int((H - t) * RENDER_SCALE)),
                   min(bitmap.width, int(r * RENDER_SCALE)), min(bitmap.height, int((H - b) * RENDER_SCALE)))
            if box[2] - box[0] > 0 and box[3] - box[1] > 0:
                reader.add(i, bitmap.crop(box))
    except Exception:
        return


_A_BLIP = "{http://schemas.openxmlformats.org/drawingml/2006/main}blip"
_R_EMBED = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed"
_R_ID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
_V_IMAGEDATA = "{urn:schemas-microsoft-com:vml}imagedata"


def _image_rids(el) -> list[str]:
    """Bir Word öğesindeki (paragraf/tablo satırı) resim ilişki kimlikleri, belge sırasıyla (tekrarsız)."""
    out: list[str] = []
    for x in el.iter():
        rid = x.get(_R_EMBED) if x.tag == _A_BLIP else x.get(_R_ID) if x.tag == _V_IMAGEDATA else None
        if rid:
            out.append(rid)
    return list(dict.fromkeys(out))


def _pptx_pictures(shapes):
    """Slayttaki resimlerin baytları (gruplar dahil), üstten alta sırasıyla."""
    from pptx.enum.shapes import MSO_SHAPE_TYPE

    found = []

    def walk(shs):
        for sh in shs:
            if sh.shape_type == MSO_SHAPE_TYPE.GROUP:
                walk(sh.shapes)
            elif sh.shape_type == MSO_SHAPE_TYPE.PICTURE or type(sh).__name__ == "PlaceholderPicture":
                try:
                    found.append(((sh.top or 0, sh.left or 0), sh.image.blob))
                except Exception:
                    pass

    walk(shapes)
    return [b for _, b in sorted(found, key=lambda x: x[0])]


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


# ---------------- eski Türkçe yazı tipi kodlaması ----------------
# Eski (Mac tabanlı) yayıncılık programlarıyla hazırlanmış PDF'lerde (ör. birçok üniversite e-kitabı) Türkçe harfler,
# MacTurkish baytlarının MacRoman gibi okunmasıyla bozuk gelir: ı→›  İ→‹  ğ→¤  Ğ→⁄  ş→ﬂ  Ş→ﬁ  (kitab›n, ço¤alt›lamaz, baflka).
# Bozukluk PDF'in kendi metin katmanındadır (başka programlarda kopyalayınca da böyledir); eşleme birebir olduğu için geri çevrilebilir.
LEGACY_FIX_NOTE = "Bu PDF'in yazı tipi kodlaması hatalıydı; bozuk Türkçe harfler otomatik düzeltildi."
_L = "A-Za-zÇĞİÖŞÜçğıöşü"
_LEGACY_ANGLE_IN_WORD = re.compile(rf"(?<=[{_L}])\u203a(?=[{_L}])")
_LEGACY_SIMPLE = str.maketrans({"\u203a": "ı", "\u2039": "İ", "\u00a4": "ğ", "\ufb01": "Ş", "\ufb02": "ş"})
_LEGACY_EURO = re.compile(rf"(?<=[{_L}])\u20ac|\u20ac(?=[{_L}])")      # € yalnızca harfin yanındaysa ğ (fiyatlardaki € korunur)
_LEGACY_FRAC = re.compile(rf"(?<=[{_L}])\u2044|\u2044(?=[{_L}])")      # ⁄ yalnızca harfin yanındaysa Ğ (1⁄2 gibi kesirler korunur)


def _legacy_turkish(text: str) -> bool:
    """Belgede bu bozukluk var mı? Kelime İÇİNDE (iki yanı harf) en az 5 adet › ve çoğunluk — normal metinde › boşlukla çevrili tırnak/ok olarak geçer."""
    n = text.count("\u203a")
    if n < 5:
        return False
    inside = len(_LEGACY_ANGLE_IN_WORD.findall(text))
    return inside >= 5 and inside / n >= 0.6


def _ligature_fix_page(pdf, i: int, t: str) -> str:
    """ş/Ş harfleri PDF motorunda ligatür olarak ("ﬂ"/"ﬁ") gelir ve iki harfe ("fl"/"fi") açılır. Açılan iki harf TEK glifin kutusunu
    paylaşır (sol ve sağ sınırları aynıdır); gerçek 'fl'/'fi' harflerinin kutuları ayrıdır. Yalnızca aynı kutuyu paylaşan çiftler ş/Ş olur
    (sözlük tahmini yok: "enflasyon", "fizik", "fikir" gibi gerçek sözcükler korunur). Eşleşme doğrulanamazsa metin olduğu gibi döner."""
    import ctypes
    import pypdfium2.raw as pr

    page = pdf[i]
    try:
        tp = page.get_textpage()
        try:
            h = tp.raw
            n = pr.FPDFText_CountChars(h)
            if n != len(t):
                return t
            chars = [pr.FPDFText_GetUnicode(h, k) for k in range(n)]
            if any(c != ord(ch) for c, ch in zip(chars, t)):
                return t
            box1 = [ctypes.c_double() for _ in range(4)]
            box2 = [ctypes.c_double() for _ in range(4)]
            out: list[str] = []
            k = 0
            while k < n:
                if chars[k] == 0x66 and k + 1 < n and chars[k + 1] in (0x6C, 0x69):
                    pr.FPDFText_GetCharBox(h, k, *box1)
                    pr.FPDFText_GetCharBox(h, k + 1, *box2)
                    w1 = box1[1].value - box1[0].value
                    tol = 0.02 * w1
                    if w1 > 0 and abs(box1[0].value - box2[0].value) <= tol and abs(box1[1].value - box2[1].value) <= tol:
                        out.append("ş" if chars[k + 1] == 0x6C else "Ş")
                        k += 2
                        continue
                out.append(t[k])
                k += 1
            return "".join(out)
        finally:
            tp.close()
    except Exception:
        return t
    finally:
        page.close()


def _fix_legacy_turkish(parts: list[str], kinds: list[str], pdf=None) -> tuple[list[str], bool]:
    """Bozuk kodlama saptanırsa metin katmanından gelen sayfalardaki harfleri düzeltir (OCR sayfalarına dokunulmaz).
    `pdf` verilirse ş/Ş (ligatür olarak gelen "fl"/"fi") de düzeltilir."""
    if not _legacy_turkish("\n".join(p for p, k in zip(parts, kinds) if k == "text")):
        return parts, False
    fixed: list[str] = []
    for i, (p, k) in enumerate(zip(parts, kinds)):
        if k == "text":
            if pdf is not None and ("fl" in p or "fi" in p):
                p = _ligature_fix_page(pdf, i, p)       # indeksler özgün metne göre olduğundan önce bu
            p = _LEGACY_FRAC.sub("Ğ", _LEGACY_EURO.sub("ğ", p.translate(_LEGACY_SIMPLE)))
        fixed.append(p)
    return fixed, True


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
        reader = _ImageReader(ocr) if ocr is not None else None
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
                if reader is not None and kind == "text":
                    _pdf_page_images(page, i, reader)       # metinli sayfadaki fotoğraf/resimler
            finally:
                page.close()
        parts, legacy_fixed = _fix_legacy_turkish(parts, kinds, pdf)
        note = None
        if ocr_pages:
            note = f"{ocr_pages} görsel sayfa OCR ile okundu; okuma hataları olabilir."
            if image_pages > ocr_pages:
                note += f" OCR en fazla {s.ocr_max_pages} sayfa için uygulanır, kalan görsel sayfalar atlandı."
        if legacy_fixed:
            note = f"{note} {LEGACY_FIX_NOTE}" if note else LEGACY_FIX_NOTE
        return Extracted("\n\n".join(parts), page_count=n, used_ocr=ocr_pages > 0, note=note, pages=parts, page_kinds=kinds,
                         images=(reader.items or None) if reader is not None else None)
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


def _chunk_pages(pages: list[list]) -> tuple[list[list], bool]:
    """Yerleşim bilgisi olmayan Word dosyası: uzun sayfaları paragraf sınırlarında ~APPROX_PAGE_CHARS karakterlik parçalara böler.
    Sayfa öğeleri metin satırı (str) veya görsel işareti (("img", k)) olabilir; görseller bulundukları satırla birlikte taşınır."""
    out: list[list] = []
    split = False
    for entries in pages:
        cur: list = []
        n = 0
        for e in entries:
            if isinstance(e, str):
                if cur and n + len(e) > APPROX_PAGE_CHARS:
                    out.append(cur)
                    cur, n, split = [], 0, True
                n += len(e) + 1
            cur.append(e)
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
    pages: list[list] = [[]]            # sayfa gezintisi için öğeler: metin satırı (str) veya görsel işareti ("img", k)
    raw_imgs: list[tuple[str, bytes]] = []
    rendered = False

    def add_images(rids) -> None:
        for rid in rids:
            blob = getattr(doc.part.related_parts.get(rid), "blob", None)
            if blob:
                raw_imgs.append((hashlib.sha1(blob).hexdigest(), blob))
                pages[-1].append(("img", len(raw_imgs) - 1))

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
            rids = _image_rids(child)
            if not base:
                for _, kind in marks:       # yalnızca sayfa sonu içeren paragraf
                    brk(kind)
                add_images(rids)            # yalnızca resim içeren paragraf
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
            add_images(rids)
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
                rids = _image_rids(row._tr)
                if any(cells) or rids:
                    if row._tr.find(".//" + _W + "lastRenderedPageBreak") is not None:
                        brk("rendered")
                    add_images(rids)
                    if any(cells):
                        line = " | ".join(cells)
                        out.append(line)
                        pages[-1].append(line)
    page_entries = [p for p in pages if p]
    approx = False
    if not rendered:                    # Word yerleşimi kayıtlı değil (Word dışı program): uzun sayfalar yaklaşık bölünür
        page_entries, approx = _chunk_pages(page_entries)
    images = None
    ocr = get_ocr_fn()
    if raw_imgs and ocr is not None:    # görsellerden OCR: sayfa numarası, sayfa yapısı kesinleştikten sonra bilinir
        img_page = {e[1]: pi for pi, p in enumerate(page_entries) for e in p if not isinstance(e, str)}
        reader = _ImageReader(ocr)
        for k, (key, blob) in enumerate(raw_imgs):
            im = _open_image(blob) if k in img_page else None
            if im is not None:
                reader.add(img_page[k], im, key)
        images = reader.items or None
    texts = ["\n".join(e for e in p if isinstance(e, str)) for p in page_entries]    # yalnızca görselli sayfa: boş metin
    return Extracted("\n".join(out), pages=texts, pages_approx=approx, images=images)


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
    ocr = get_ocr_fn()
    reader = _ImageReader(ocr) if ocr is not None else None
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
        if reader is not None:
            for blob in _pptx_pictures(slide.shapes):          # slayttaki resimler
                im = _open_image(blob)
                if im is not None:
                    reader.add(i - 1, im, hashlib.sha1(blob).hexdigest())
        slides.append("\n".join(out[basla:]))
    return Extracted("\n".join(out), page_count=len(prs.slides), pages=slides,
                     images=(reader.items or None) if reader is not None else None)


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
    if res.images is not None:                      # görseller yalnızca sayfa bilgisi olan (metne alınan) sayfalar için tutulur
        n_pages = len(res.page_starts) if res.page_starts else 0
        res.images = [im for im in res.images if im["page"] < n_pages] or None
    if res.images:
        ok = sum(1 for im in res.images if im["st"] == "ok")
        notes = []
        if ok:
            res.used_ocr = True
            notes.append(f"{ok} görselde metin OCR ile okundu; okuma hataları olabilir.")
        if any(im["st"] == "skip" for im in res.images):
            notes.append(f"OCR en fazla {s.ocr_max_images} görsel için uygulanır, kalan görseller atlandı.")
        if notes:
            res.note = " ".join(([res.note] if res.note else []) + notes)
    return res
