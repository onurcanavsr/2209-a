"""Özet PDF'i: Markdown ayrıştırma, güvenli işaretleme, dosya adı ve gerçek PDF çıktısı (yazı tipi yoksa atlanır)."""
import shutil
import subprocess

import pytest

from app import pdfexport as px

MD = """## Ana Fikir
Hücre zarı **seçici geçirgendir** ve madde alışverişini düzenler.
İkinci satır aynı paragraf.

## Temel Kavramlar
- **Difüzyon:** yoğundan seyreğe geçiş.
* Ozmoz: suyun geçişi.
• Üçüncü madde

### Alt başlık
Son paragraf.
"""


@pytest.fixture(scope="module")
def fontlu():
    try:
        px.ensure_fonts()
    except px.PdfFontError:
        pytest.skip("DejaVu Sans yazı tipi bu makinede yok (Docker imajında/CI'da kurulu)")


def test_ayristir_baslik_liste_paragraf_sirasi():
    b = px.ayristir(MD)
    assert [x.tur for x in b] == ["baslik", "paragraf", "baslik", "liste", "baslik", "paragraf"]
    assert b[0].metin == "Ana Fikir" and b[0].seviye == 2 and b[4].seviye == 3
    assert b[1].metin == "Hücre zarı **seçici geçirgendir** ve madde alışverişini düzenler. İkinci satır aynı paragraf."
    assert b[3].maddeler == ("**Difüzyon:** yoğundan seyreğe geçiş.", "Ozmoz: suyun geçişi.", "Üçüncü madde")


def test_ayristir_bos_ve_crlf():
    assert px.ayristir("") == [] and px.ayristir("\n\n  \n") == []
    assert [x.tur for x in px.ayristir("## A\r\n- b\r\nc\r\n")] == ["baslik", "liste", "paragraf"]


def test_satir_ici_kacis_ve_kalin():
    assert px.satir_ici("a **b** c") == "a <b>b</b> c"
    assert px.satir_ici("1 < 2 & <b>x</b>") == "1 &lt; 2 &amp; &lt;b&gt;x&lt;/b&gt;"      # model çıktısı işaretleme enjekte edemez
    assert px.satir_ici("eşleşmeyen ** yıldız") == "eşleşmeyen  yıldız"
    assert px.satir_ici("a\x00b\u200bc") == "abc"                                      # kontrol / sıfır genişlik karakterleri


def test_baslik_ve_dosya_adi():
    assert px.baslik_adi("Hücre Notları.pdf") == "Hücre Notları"
    assert px.baslik_adi("Intro to Python 3.9") == "Intro to Python 3.9"               # bilinmeyen 'uzantı' kesilmez
    assert px.dosya_adi("Hücre Notları.pdf", "tr") == "Hücre Notları - özet.pdf"
    assert px.dosya_adi("Intro to Python 3.9", "en") == "Intro to Python 3.9 - summary.pdf"
    assert px.dosya_adi("../../etc/passwd", "tr") == "etcpasswd - özet.pdf"            # yol karakterleri atılır
    assert px.dosya_adi("", "tr") == "belge - özet.pdf" and px.dosya_adi("///", "en") == "document - summary.pdf"


def test_akis_turkce_metni_ve_ozel_karakterleri_korur(fontlu):
    akis = px.akis("## Başlık\nİşte ığüşöç & <tag> **kalın**.", title="Ders.docx", level="detailed", lang="tr",
                   created_at="2026-11-03T22:30:00Z")
    duz = [p.getPlainText() for p in akis if hasattr(p, "getPlainText")]
    assert duz[0] == "Ders"
    assert "Ayrıntılı" in duz[1] and "4 Kasım 2026" in duz[1]          # 22:30 UTC = ertesi gün 01:30 (UTC+3)
    assert any("İşte ığüşöç & <tag> kalın." in d for d in duz)
    assert duz[-1].startswith("Bu özet yapay zekâ tarafından üretilmiştir")


def test_ozet_pdf_gecerli_pdf(fontlu):
    data = px.ozet_pdf(MD * 30, title="Hücre.pdf", level="medium", lang="tr")
    assert data.startswith(b"%PDF-") and data.rstrip().endswith(b"%%EOF")
    assert b"/Lang" in data


@pytest.mark.skipif(not shutil.which("pdftotext"), reason="pdftotext (poppler-utils) yok")
def test_pdf_metni_duzenli_ve_siralidir(fontlu, tmp_path):
    f = tmp_path / "o.pdf"
    f.write_bytes(px.ozet_pdf(MD, title="Hücre Notları.pdf", level="short", lang="tr"))
    text = subprocess.run(["pdftotext", str(f), "-"], capture_output=True, text=True, check=True).stdout
    ilk = [text.index(s) for s in ("Hücre Notları", "Ana Fikir", "Temel Kavramlar", "Alt başlık", "Son paragraf")]
    assert ilk == sorted(ilk)                                           # okuma sırası = özet sırası
    assert "• Difüzyon: yoğundan seyreğe geçiş." in text and "• Üçüncü madde" in text
    assert "Hücre zarı seçici geçirgendir ve madde alışverişini düzenler." in " ".join(text.split())
    assert "**" not in text and "Sayfa 1 / 1" in text


def test_yazi_tipi_yoksa_acik_hata(monkeypatch):
    monkeypatch.setattr(px, "_fonts_ready", False)
    monkeypatch.setattr(px, "FONT_DIRS", ())
    with pytest.raises(px.PdfFontError):
        px.ozet_pdf("## A", title="x")
