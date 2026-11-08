"""Sayfa gezintisi — çıkarma: sayfa başlangıçları, metnin DEĞİŞMEMESİ, boş sayfa, OCR, kısaltma, kelime sayımı."""
import io

import pytest
from docx import Document
from docx.enum.section import WD_SECTION
from docx.oxml import OxmlElement
from pptx import Presentation

from app import extract as ex
from app.config import get_settings


def make_pdf_pages(texts):
    """Her öğe bir sayfa (None/'' = boş sayfa). Elle yazılmış, yalnızca ASCII metinli küçük PDF."""
    n = len(texts)
    kids = " ".join(f"{3 + 2 * i} 0 R" for i in range(n))
    font = 3 + 2 * n
    objs = ["<< /Type /Catalog /Pages 2 0 R >>", f"<< /Type /Pages /Kids [{kids}] /Count {n} >>"]
    for i, t in enumerate(texts):
        content = f"BT /F1 18 Tf 72 700 Td ({t}) Tj ET" if t else ""
        objs.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents {4 + 2 * i} 0 R "
                    f"/Resources << /Font << /F1 {font} 0 R >> >> >>")
        objs.append(f"<< /Length {len(content)} >>\nstream\n{content}\nendstream")
    objs.append("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    out, offs = b"%PDF-1.4\n", []
    for i, o in enumerate(objs, 1):
        offs.append(len(out))
        out += f"{i} 0 obj\n{o}\nendobj\n".encode()
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    for off in offs:
        out += f"{off:010d} 00000 n \n".encode()
    return out + f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode()


def make_pptx_slides(slides):
    """slides: [(baslik, govde)]; (None, None) = boş slayt."""
    p = Presentation()
    for baslik, govde in slides:
        s = p.slides.add_slide(p.slide_layouts[1])
        if baslik is None:
            for ph in list(s.placeholders):
                ph._element.getparent().remove(ph._element)
        else:
            s.shapes.title.text, s.placeholders[1].text = baslik, govde
    b = io.BytesIO()
    p.save(b)
    return b.getvalue()


PAGES = ["Birinci sayfa hucre zari secici gecirgendir", "", "Ucuncu sayfa mitokondri enerji uretir ve ATP verir",
         "Dorduncu sayfa kloroplast fotosentez yapar"]


@pytest.fixture(autouse=True)
def _ocrsuz(monkeypatch):
    monkeypatch.setattr(ex, "get_ocr_fn", lambda: None)


def sayfalar(res):
    return [ex.sayfa_metni(res.text, res.page_starts, i) for i in range(len(res.page_starts))]


def test_pdf_sayfa_baslangiclari_ve_bos_sayfa():
    r = ex.extract("pdf", make_pdf_pages(PAGES))
    assert r.page_count == 4 and len(r.page_starts) == 4
    assert sayfalar(r) == [PAGES[0], "", PAGES[2], PAGES[3]]          # boş sayfa korunur, sıra bozulmaz
    assert r.page_starts[1] == r.page_starts[2]                        # boş sayfa bir sonrakiyle aynı konumu paylaşır
    assert r.pages is None                                             # ham sayfa metinleri bellekte tutulmaz


def test_metin_degismez_yalnizca_sayfa_konumlari_eklenir():
    r = ex.extract("pdf", make_pdf_pages(PAGES))
    assert r.text == "\n\n".join(p for p in PAGES if p)                # özet/soru-cevap/sesli okuma aynı metni görmeye devam eder
    assert r.page_starts[0] == 0


def test_kelime_baslangiclari_belge_genelindeki_sirayi_verir():
    r = ex.extract("pdf", make_pdf_pages(PAGES))
    ws = ex.sayfa_kelime_baslangiclari(r.text, r.page_starts)
    words = r.text.split()
    assert ws == [0, 6, 6, 14] and len(words) == 19
    assert words[ws[2]] == "Ucuncu" and words[ws[3]] == "Dorduncu"
    # sayfa sayfa kelimelerin birleşimi = tüm metnin kelimeleri
    assert [w for i in range(4) for w in sayfalar(r)[i].split()] == words


def test_sondaki_ve_bastaki_bos_sayfalar():
    r = ex.extract("pdf", make_pdf_pages(["", PAGES[0], "", ""]))
    assert sayfalar(r) == ["", PAGES[0], "", ""] and r.page_starts[0] == 0
    assert r.page_starts[2] == r.page_starts[3] == len(r.text)


def test_ocr_ile_okunan_gorsel_sayfa_kendi_sayfasinda_gorunur(monkeypatch):
    monkeypatch.setattr(ex, "get_ocr_fn", lambda: (lambda img: "OCR ile okunan uzun bir metin parcasi"))
    r = ex.extract("pdf", make_pdf_pages(PAGES))
    assert r.used_ocr is True
    assert sayfalar(r)[1] == "OCR ile okunan uzun bir metin parcasi"
    assert sayfalar(r)[0] == PAGES[0] and sayfalar(r)[2] == PAGES[2]


@pytest.fixture
def kisa_metin(monkeypatch):
    monkeypatch.setenv("MAX_TEXT_CHARS", "70")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_kisaltilan_belgede_yalnizca_metinde_kalan_sayfalar_gezilir(kisa_metin):
    r = ex.extract("pdf", make_pdf_pages(PAGES))
    assert r.truncated and len(r.text) == 70
    assert all(s < len(r.text) for s in r.page_starts) and len(r.page_starts) < 4


def test_pptx_slayt_gezintisi():
    r = ex.extract("pptx", make_pptx_slides([("Fotosentez", "Isik enerjisi"), (None, None), ("Solunum", "ATP uretimi")]))
    assert r.page_count == 3 and len(r.page_starts) == 3
    s = sayfalar(r)
    assert s[0].startswith("[Slayt 1]") and "Fotosentez" in s[0]
    assert s[1] == "[Slayt 2]"                                         # boş slayt da bir sayfadır
    assert s[2].startswith("[Slayt 3]") and "ATP uretimi" in s[2]


def test_ocr_sayfa_turleri(monkeypatch):
    monkeypatch.setattr(ex, "get_ocr_fn", lambda: (lambda img: "OCR ile okunan uzun bir metin parcasi"))
    r = ex.extract("pdf", make_pdf_pages(PAGES))
    assert r.page_kinds == ["text", "ocr", "text", "text"]             # hangi sayfanın OCR olduğu bilinir


def test_ocr_yoksa_gorsel_sayfa_goruntu_olarak_isaretlenir():
    r = ex.extract("pdf", make_pdf_pages(PAGES))                       # OCR kapalı (autouse)
    assert r.page_kinds == ["text", "image", "text", "text"] and r.used_ocr is False


def test_ocr_bos_doner_veya_hata_verirse_goruntu_kalir(monkeypatch):
    monkeypatch.setattr(ex, "get_ocr_fn", lambda: (lambda img: "   "))
    assert ex.extract("pdf", make_pdf_pages(PAGES)).page_kinds[1] == "image"

    def patlar(img):
        raise RuntimeError("tesseract")
    monkeypatch.setattr(ex, "get_ocr_fn", lambda: patlar)
    assert ex.extract("pdf", make_pdf_pages(PAGES)).page_kinds[1] == "image"


def test_kisa_gercek_metin_goruntu_sayilmaz():
    r = ex.extract("pdf", make_pdf_pages([PAGES[0], "12", PAGES[2]]))   # sayfa numarası gibi kısa metin, OCR yok
    assert r.page_kinds == ["text", "text", "text"] and sayfalar(r)[1] == "12"


def test_kisaltmada_sayfa_turleri_de_kirpilir(kisa_metin):
    r = ex.extract("pdf", make_pdf_pages(PAGES))
    assert len(r.page_kinds) == len(r.page_starts)


def test_pptx_ve_word_sayfa_turu_metindir():
    r = ex.extract("pptx", make_pptx_slides([("Fotosentez", "Isik"), ("Solunum", "ATP")]))
    assert r.page_kinds == ["text", "text"]


# ---------------- Word: sayfa sınırları
def save_docx(d):
    b = io.BytesIO()
    d.save(b)
    return b.getvalue()


def rendered(run):
    run._r.insert(0, OxmlElement("w:lastRenderedPageBreak"))    # Word'ün kaydettiği son yerleşimdeki sayfa başı


def test_word_acik_sayfa_sonlari_sayfa_olur():
    d = Document()
    d.add_heading("Baslik Bir", 1)
    d.add_paragraph("Birinci sayfa icerigi burada yer alir.")
    d.add_page_break()
    d.add_paragraph("Ikinci sayfa icerigi.")
    d.add_page_break()
    d.add_paragraph("Ucuncu sayfa icerigi.")
    r = ex.extract("docx", save_docx(d))
    assert sayfalar(r) == ["## Baslik Bir\nBirinci sayfa icerigi burada yer alir.", "Ikinci sayfa icerigi.", "Ucuncu sayfa icerigi."]
    assert r.pages_approx is False and r.page_count is None            # "N sayfa" etiketi Word için değişmez
    assert r.text == "## Baslik Bir\nBirinci sayfa icerigi burada yer alir.\nIkinci sayfa icerigi.\nUcuncu sayfa icerigi."


def test_word_yerlesim_isareti_paragraf_ortasinda_boler_ve_metin_ayni_kalir():
    d = Document()
    p = d.add_paragraph()
    p.add_run("Bu paragraf birinci sayfada baslar ve ")
    rendered(p.add_run("ikinci sayfada devam eder."))
    d.add_paragraph("Sonraki paragraf.")
    r = ex.extract("docx", save_docx(d))
    assert r.text == "Bu paragraf birinci sayfada baslar ve ikinci sayfada devam eder.\nSonraki paragraf."   # tek satır olarak kalır
    assert sayfalar(r) == ["Bu paragraf birinci sayfada baslar ve", "ikinci sayfada devam eder.\nSonraki paragraf."]
    assert r.pages_approx is False                                      # Word yerleşimi kayıtlı: sayfalar birebir


def test_word_kelime_ortasindaki_isaret_kelimenin_basina_cekilir():
    d = Document()
    p = d.add_paragraph()
    p.add_run("bir kelime-orta")
    rendered(p.add_run("sinda bolunur"))
    r = ex.extract("docx", save_docx(d))
    assert sayfalar(r) == ["bir", "kelime-ortasinda bolunur"]
    words = r.text.split()
    assert [w for s in sayfalar(r) for w in s.split()] == words         # kelime sıraları (yer imleri) kaymaz
    assert ex.sayfa_kelime_baslangiclari(r.text, r.page_starts) == [0, 1]


def test_word_tabloda_yerlesim_isareti_satirdan_once_boler():
    d = Document()
    d.add_paragraph("Tablodan once.")
    t = d.add_table(rows=2, cols=2)
    for i, (x, y) in enumerate([("Ad", "Deger"), ("Kar", "Su")]):
        t.cell(i, 0).text, t.cell(i, 1).text = x, y
    rendered(t.rows[1].cells[0].paragraphs[0].runs[0])
    r = ex.extract("docx", save_docx(d))
    assert sayfalar(r) == ["Tablodan once.\nAd | Deger", "Kar | Su"]


def test_word_acik_sayfa_sonu_ve_yerlesim_isareti_bos_sayfa_acmaz():
    d = Document()
    d.add_paragraph("Bir.")
    d.add_page_break()
    rendered(d.add_paragraph().add_run("Iki."))
    assert sayfalar(ex.extract("docx", save_docx(d))) == ["Bir.", "Iki."]


def test_word_bolum_sonu_ve_sayfa_basi_ozelligi():
    d = Document()
    d.add_paragraph("Bolum bir.")
    d.add_section(WD_SECTION.NEW_PAGE)
    d.add_paragraph("Bolum iki.")
    d.add_paragraph("Sayfa basi isaretli.").paragraph_format.page_break_before = True
    assert sayfalar(ex.extract("docx", save_docx(d))) == ["Bolum bir.", "Bolum iki.", "Sayfa basi isaretli."]


def test_word_yerlesim_bilgisi_yoksa_uzun_belge_yaklasik_bolunur():
    d = Document()
    for i in range(40):
        d.add_paragraph(f"Paragraf {i}: " + "uzun metin " * 25)
    r = ex.extract("docx", save_docx(d))
    assert r.pages_approx is True and len(r.page_starts) > 1
    assert all(len(s) <= ex.APPROX_PAGE_CHARS + 400 for s in sayfalar(r))
    assert [w for s in sayfalar(r) for w in s.split()] == r.text.split()


def test_word_kisa_belge_tek_sayfa_ve_yaklasik_degil():
    d = Document()
    d.add_paragraph("Kisa bir belge.")
    r = ex.extract("docx", save_docx(d))
    assert sayfalar(r) == ["Kisa bir belge."] and r.pages_approx is False


def test_hizalanamazsa_gezinti_kapanir_metin_etkilenmez():
    assert ex._page_starts("abc def", ["abc", "xyz"]) is None
    assert ex._page_starts("abc def", []) is None


def test_bosluk_ve_ozel_bosluk_karakterleri_tarayici_ile_ayni_sayilir():
    assert ex.kelime_sayisi("a b\u00a0c\ufeffd\n\ne\u3000f") == 6        # NBSP, BOM, ideografik boşluk ayırıcıdır (JS \s)
    assert ex.kelime_sayisi("a\x1cb") == 1                              # JS \s kümesinde olmayan karakter ayırıcı değildir
    assert ex.kelime_sayisi("   ") == 0


def test_gecerli_baslangiclar_dogrulama():
    assert ex.gecerli_baslangiclar([0, 5, 5, 9], 10) == [0, 5, 5, 9]
    for kotu in (None, [], "0,5", [0, "5"], [3, 1], [0, 99], [True], [0, 1.5]):
        assert ex.gecerli_baslangiclar(kotu, 10) is None


def test_sayfa_metni_sondaki_bosluklari_atar():
    t = "bir iki\n\nuc dort\n\n"
    assert ex.sayfa_metni(t, [0, 9], 0) == "bir iki" and ex.sayfa_metni(t, [0, 9], 1) == "uc dort"
