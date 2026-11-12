"""Görsellerden (resim/fotoğraf/ekran görüntüsü) OCR ile metin okuma: Word, PowerPoint, PDF; sayfa eşleme, tekrar, bütçe, gürültü."""
import io
import os
import shutil

import pytest
from docx import Document
from docx.shared import Inches
from PIL import Image, ImageDraw, ImageFont
from pptx import Presentation
from pptx.util import Inches as PInches

from app import extract as ex
from app.config import get_settings
from tests.test_pages_extract import make_pdf_pages  # noqa: F401  (yardımcı)


def png(color=(120, 160, 200), size=(240, 140)):
    b = io.BytesIO()
    Image.new("RGB", size, color).save(b, "PNG")
    return b.getvalue()


class FakeOcr:
    """Her çağrıda farklı, anlamlı bir metin döndürür; kaç kez çağrıldığı sayılır."""

    def __init__(self, text=None):
        self.calls, self.text = 0, text

    def __call__(self, img):
        self.calls += 1
        return self.text if self.text is not None else f"Gorselden okunan metin numara {self.calls} yeterince uzun"


@pytest.fixture
def ocr(monkeypatch):
    f = FakeOcr()
    monkeypatch.setattr(ex, "get_ocr_fn", lambda: f)
    return f


@pytest.fixture
def az_gorsel(monkeypatch):
    monkeypatch.setenv("OCR_MAX_IMAGES", "2")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def save(d):
    b = io.BytesIO()
    d.save(b)
    return b.getvalue()


def sayfalar(r):
    return [ex.sayfa_metni(r.text, r.page_starts, i) for i in range(len(r.page_starts))]


def docx_with(*items):
    """items: "metin" | ("img", png_bytes) | "---" (sayfa sonu)"""
    d = Document()
    for it in items:
        if it == "---":
            d.add_page_break()
        elif isinstance(it, tuple):
            d.add_picture(io.BytesIO(it[1]), width=Inches(2))
        else:
            d.add_paragraph(it)
    return save(d)


# ---------------- Word ----------------
def test_word_gorseller_bulunduklari_sayfaya_atanir(ocr):
    r = ex.extract("docx", docx_with("Birinci sayfa metni burada.", ("img", png((10, 20, 30))), "---",
                                     "Ikinci sayfa metni burada.", ("img", png((200, 10, 10))), ("img", png((10, 200, 10)))))
    assert [(im["page"], im["st"]) for im in r.images] == [(0, "ok"), (1, "ok"), (1, "ok")]
    assert r.images[0]["text"] == "Gorselden okunan metin numara 1 yeterince uzun"
    assert sayfalar(r) == ["Birinci sayfa metni burada.", "Ikinci sayfa metni burada."]
    assert r.used_ocr is False or r.used_ocr is True                    # alan var; asıl denetim aşağıda
    assert "3 görselde metin OCR ile okundu" in r.note


def test_word_metin_gorsel_olsa_da_degismez(ocr):
    r = ex.extract("docx", docx_with("Birinci.", ("img", png()), "---", "Ikinci."))
    assert r.text == "Birinci.\nIkinci."                                  # özet/soru-cevap/sesli okuma aynı metni görür


def test_word_yalnizca_gorselli_sayfa_bos_metinli_sayfa_olur(ocr):
    r = ex.extract("docx", docx_with("Ilk sayfa metni.", "---", ("img", png((1, 2, 3))), "---", "Son sayfa metni."))
    assert sayfalar(r) == ["Ilk sayfa metni.", "", "Son sayfa metni."]
    assert [im["page"] for im in r.images] == [1]                       # görsel, kendi (metinsiz) sayfasında
    assert r.text == "Ilk sayfa metni.\nSon sayfa metni."


def test_ayni_gorsel_bir_kez_okunur_iki_kez_listelenir(ocr):
    same = png((50, 60, 70))
    r = ex.extract("docx", docx_with("Metin bir.", ("img", same), "---", "Metin iki.", ("img", same)))
    assert ocr.calls == 1
    assert [im["page"] for im in r.images] == [0, 1] and r.images[0]["text"] == r.images[1]["text"]


def test_okunamayan_gorsel_bos_kaydedilir(monkeypatch):
    monkeypatch.setattr(ex, "get_ocr_fn", lambda: FakeOcr("   "))
    r = ex.extract("docx", docx_with("Metin satiri burada.", ("img", png())))
    assert r.images == [{"page": 0, "text": "", "st": "empty"}]
    assert r.note is None or "görselde metin" not in r.note


def test_gurultu_ocr_ciktisi_bos_sayilir(monkeypatch):
    monkeypatch.setattr(ex, "get_ocr_fn", lambda: FakeOcr("|| -- ~~ // .. ,, ::\n__ -- ==\n| |"))
    assert ex.extract("docx", docx_with("Metin satiri burada.", ("img", png()))).images[0]["st"] == "empty"


def test_kucuk_simgeler_atlanir(ocr):
    r = ex.extract("docx", docx_with("Metin satiri burada.", ("img", png(size=(20, 20)))))
    assert r.images is None and ocr.calls == 0


def test_gorsel_sayisi_siniri_asilinca_kalanlar_atlanir(ocr, az_gorsel):
    imgs = [("img", png((i * 40, 10, 10))) for i in range(4)]
    r = ex.extract("docx", docx_with("Metin satiri burada.", *imgs))
    assert [im["st"] for im in r.images] == ["ok", "ok", "skip", "skip"] and ocr.calls == 2
    assert "OCR en fazla 2 görsel için uygulanır, kalan görseller atlandı" in r.note


def test_ocr_yoksa_gorsel_yok_metin_ayni(monkeypatch):
    monkeypatch.setattr(ex, "get_ocr_fn", lambda: None)
    r = ex.extract("docx", docx_with("Metin satiri burada.", ("img", png())))
    assert r.images is None and r.text == "Metin satiri burada."


def test_word_tablodaki_gorsel(ocr):
    d = Document()
    d.add_paragraph("Tablodan once.")
    t = d.add_table(rows=1, cols=2)
    t.cell(0, 0).text = "Hucre metni"
    t.cell(0, 1).paragraphs[0].add_run().add_picture(io.BytesIO(png((9, 9, 9))), width=Inches(1.5))
    r = ex.extract("docx", save(d))
    assert len(r.images) == 1 and r.images[0]["page"] == 0 and r.text.startswith("Tablodan once.\nHucre metni")


def test_kisaltilan_belgede_sayfa_disi_gorseller_atilir(ocr, monkeypatch):
    monkeypatch.setenv("MAX_TEXT_CHARS", "40")
    get_settings.cache_clear()
    try:
        r = ex.extract("docx", docx_with("Birinci sayfanin metni buradadir.", ("img", png((1, 1, 1))), "---",
                                         "Ikinci sayfanin metni buradadir.", ("img", png((2, 2, 2))), "---",
                                         "Ucuncu sayfanin metni buradadir.", ("img", png((3, 3, 3)))))
    finally:
        get_settings.cache_clear()
    assert r.truncated and all(im["page"] < len(r.page_starts) for im in r.images)
    assert len(r.images) < 3


# ---------------- PowerPoint ----------------
def test_pptx_slayttaki_resimler(ocr):
    p = Presentation()
    s1 = p.slides.add_slide(p.slide_layouts[5])
    s1.shapes.title.text = "Birinci slayt basligi"
    s1.shapes.add_picture(io.BytesIO(png((5, 5, 5))), PInches(1), PInches(2), PInches(3), PInches(2))
    s2 = p.slides.add_slide(p.slide_layouts[5])
    s2.shapes.title.text = "Ikinci slayt"
    s2.shapes.add_picture(io.BytesIO(png((50, 5, 5))), PInches(1), PInches(3), PInches(3), PInches(2))
    s2.shapes.add_picture(io.BytesIO(png((5, 50, 5))), PInches(1), PInches(1), PInches(3), PInches(1.5))
    b = io.BytesIO()
    p.save(b)
    r = ex.extract("pptx", b.getvalue())
    assert [im["page"] for im in r.images] == [0, 1, 1]
    assert "[Slayt 1]" in sayfalar(r)[0]


# ---------------- PDF ----------------
def pdf_with_image(img_w_pt, img_h_pt, page_text="Bu sayfada yeterince uzun bir metin bulunuyor ve bir resim var."):
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas
    b = io.BytesIO()
    c = canvas.Canvas(b, pagesize=(595, 842))
    c.drawString(50, 800, page_text)
    c.drawImage(ImageReader(Image.open(io.BytesIO(png((30, 60, 90), (400, 300))))), 60, 400, img_w_pt, img_h_pt)
    c.showPage()
    c.save()
    return b.getvalue()


def pdf_pages_with_images(n):
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas
    b = io.BytesIO()
    c = canvas.Canvas(b, pagesize=(595, 842))
    for i in range(n):
        c.drawString(50, 800, f"Sayfa {i + 1}: bu sayfada yeterince uzun bir metin ve bir resim var.")
        c.drawImage(ImageReader(Image.open(io.BytesIO(png((20 + i * 60, 60, 90), (400, 300))))), 60, 400, 240, 180)
        c.showPage()
    c.save()
    return b.getvalue()


def test_pdf_butce_bitince_kalan_sayfalar_cizilmeden_atlanir(ocr, az_gorsel):
    r = ex.extract("pdf", pdf_pages_with_images(4))
    assert [(im["page"], im["st"]) for im in r.images] == [(0, "ok"), (1, "ok"), (2, "skip"), (3, "skip")]
    assert ocr.calls == 2 and "OCR en fazla 2 görsel için uygulanır" in r.note


def test_pdf_metinli_sayfadaki_resim_okunur(ocr):
    r = ex.extract("pdf", pdf_with_image(240, 180))
    assert [(im["page"], im["st"]) for im in r.images] == [(0, "ok")]
    assert r.page_kinds == ["text"]                                     # sayfa metinli sayfa olarak kalır


def test_pdf_simge_ve_sayfayi_kaplayan_zemin_okunmaz(ocr):
    assert ex.extract("pdf", pdf_with_image(20, 20)).images is None      # simge
    assert ex.extract("pdf", pdf_with_image(590, 830)).images is None    # taranmış sayfa zemini (metin katmanı zaten var)


def test_pdf_goruntu_sayfasi_sayfa_duzeyinde_okunur_gorsel_olarak_degil(ocr):
    r = ex.extract("pdf", make_pdf_pages(["Birinci sayfa metni yeterince uzun bir metin.", ""]))
    assert r.images is None and r.page_kinds[1] in ("ocr", "image")


# ---------------- hazırlık / gürültü süzme ----------------
def test_koyu_zemin_ters_cevrilir_kucuk_gorsel_buyutulur():
    dark = Image.new("RGB", (300, 100), (15, 15, 15))
    ImageDraw.Draw(dark).rectangle((20, 20, 280, 40), fill=(240, 240, 240))
    from PIL import ImageStat
    g = ex._prep_for_ocr(dark)
    assert ImageStat.Stat(g).mean[0] > 128 and g.width >= 900 and g.mode == "L"


def test_saydam_png_beyaza_oturtulur():
    from PIL import ImageStat
    im = Image.new("RGBA", (300, 100), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((10, 10), "ABC", fill=(0, 0, 0, 255))
    assert ImageStat.Stat(ex._prep_for_ocr(im)).mean[0] > 200


def test_clean_ocr():
    assert ex._clean_ocr("Merhaba dunya\n\n\nIkinci satir burada") == "Merhaba dunya\n\nIkinci satir burada"
    assert ex._clean_ocr("|| -- ~~\n..") == ""
    assert ex._clean_ocr("x") == "" and ex._clean_ocr("OK") == ""
    assert ex._clean_ocr("Anadolu Universitesi") == "Anadolu Universitesi"
    assert ex._clean_ocr("--- ===\nGercek bir satir\n@#$%^&") == "Gercek bir satir"


# ---------------- gerçek Tesseract (varsa) ----------------
@pytest.mark.skipif(not shutil.which("tesseract"), reason="tesseract yok")
@pytest.mark.parametrize("zemin,yazi", [((255, 255, 255), (0, 0, 0)), ((24, 24, 24), (235, 235, 235))])
def test_gercek_ocr_acik_ve_koyu_zeminli_ekran_goruntusu(zemin, yazi):
    path = next((p for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/dejavu/DejaVuSans.ttf") if os.path.exists(p)), None)
    if not path:
        pytest.skip("DejaVu Sans yok")
    im = Image.new("RGB", (900, 220), zemin)
    d = ImageDraw.Draw(im)
    f = ImageFont.truetype(path, 34)
    d.text((20, 20), "Kubernetes cluster configuration", font=f, fill=yazi)
    d.text((20, 100), "Install the control plane first", font=f, fill=yazi)
    b = io.BytesIO()
    im.save(b, "PNG")
    r = ex.extract("docx", docx_with("Metin satiri burada ve yeterince uzun.", ("img", b.getvalue())))
    assert r.images[0]["st"] == "ok"
    assert "cluster" in r.images[0]["text"].lower() and "control plane" in r.images[0]["text"].lower()
