"""Sayfa gezintisi — API: belge ayrıntısında sayfa bilgisi, GET /pages/{n}, yalıtım, sayfa bilgisi olmayan belgeler."""
import pytest

from app import extract as ex
from tests.test_documents import client, make_docx, store, tok, up, text_of  # noqa: F401  (store bir fixture'dır)
from tests.test_images_extract import FakeOcr, docx_with, png
from tests.test_pages_extract import PAGES, make_pdf_pages, make_pptx_slides


@pytest.fixture(autouse=True)
def _ocrsuz(monkeypatch):
    monkeypatch.setattr(ex, "get_ocr_fn", lambda: None)


def pdf_doc(headers=None):
    r = up("ders.pdf", make_pdf_pages(PAGES), headers)
    assert r.status_code == 202
    return r.json()["id"]


def page(doc_id, n, headers=None):
    return client.get(f"/api/documents/{doc_id}/pages/{n}", headers=headers or tok())


def test_detail_has_page_word_starts_and_hides_internal_columns(store):
    d = text_of(pdf_doc())
    assert d["status"] == "ready" and d["page_count"] == 4
    assert d["page_word_starts"] == [0, 6, 6, 14]
    assert "page_starts" not in d and "raw_text" not in d
    assert d["text_preview"].startswith("Birinci sayfa")                 # mevcut davranış aynı: ilk bölüm önizlemesi


def test_pages_return_each_page_with_global_word_offset(store):
    doc = pdf_doc()
    r = page(doc, 1)
    assert r.status_code == 200
    assert r.json() == {"page": 1, "page_count": 4, "text": PAGES[0], "kind": "text", "word_offset": 0, "word_count": 6}
    r = page(doc, 3).json()
    assert r["text"] == PAGES[2] and r["word_offset"] == 6 and r["word_count"] == 8
    assert page(doc, 4).json()["word_offset"] == 14


def test_empty_page_is_empty_not_an_error(store):
    r = page(pdf_doc(), 2)
    assert r.status_code == 200 and r.json()["text"] == "" and r.json()["word_count"] == 0


@pytest.mark.parametrize("n", [0, 5, -1, 999])
def test_page_out_of_range_is_404(store, n):
    r = page(pdf_doc(), n)
    assert r.status_code == 404 and r.json()["detail"] == "Sayfa bulunamadı"


def test_page_number_must_be_integer(store):
    assert client.get(f"/api/documents/{pdf_doc()}/pages/abc", headers=tok()).status_code == 422


def test_pptx_slides_are_pages(store):
    doc = up("sunum.pptx", make_pptx_slides([("Fotosentez", "Isik enerjisi"), ("Solunum", "ATP uretimi")])).json()["id"]
    d = text_of(doc)
    assert len(d["page_word_starts"]) == 2
    assert page(doc, 2).json()["text"].startswith("[Slayt 2]")


def test_word_document_has_pages_too(store):
    doc = up("notlar.docx", make_docx()).json()["id"]
    d = text_of(doc)
    assert d["page_word_starts"] == [0] and d["pages_approx"] is False and d["page_count"] is None
    assert "Biyoloji Notlari" in page(doc, 1).json()["text"]


def test_youtube_style_document_without_pages_gives_404(store):
    doc = pdf_doc()
    store.docs[doc]["page_starts"] = None
    r = page(doc, 1)
    assert r.status_code == 404 and r.json()["detail"] == "Bu belgede sayfa bilgisi yok"
    assert page(doc, 1, {**tok(), "X-Lang": "en"}).json()["detail"] == "This document has no page information"


def test_ocr_pages_are_reported_per_page(store, monkeypatch):
    monkeypatch.setattr(ex, "get_ocr_fn", lambda: (lambda img: "OCR ile okunan uzun bir metin parcasi"))
    doc = pdf_doc()
    d = text_of(doc)
    assert d["page_kinds"] == ["text", "ocr", "text", "text"] and d["used_ocr"] is True
    assert [page(doc, n).json()["kind"] for n in (1, 2, 3, 4)] == ["text", "ocr", "text", "text"]
    assert page(doc, 2).json()["text"] == "OCR ile okunan uzun bir metin parcasi"
    assert "page_meta" not in d


def test_unreadable_image_page_is_reported_as_image(store):
    doc = pdf_doc()                                                      # OCR kapalı (autouse)
    assert text_of(doc)["page_kinds"] == ["text", "image", "text", "text"]
    assert page(doc, 2).json() == {"page": 2, "page_count": 4, "text": "", "kind": "image", "word_offset": 6, "word_count": 0}


def test_corrupt_page_meta_falls_back_to_text(store):
    doc = pdf_doc()
    store.docs[doc]["page_meta"] = "bozuk"
    d = text_of(doc)
    assert d["page_kinds"] == ["text"] * 4 and d["pages_approx"] is False
    store.docs[doc]["page_meta"] = {"kinds": ["ocr", "x"], "approx": True}   # uzunluk/değer geçersiz
    assert text_of(doc)["page_kinds"] == ["text"] * 4


def test_document_uploaded_before_this_feature_has_no_pages(store):
    doc = pdf_doc()
    store.docs[doc]["page_starts"] = None                                # eski kayıt
    assert "page_word_starts" not in text_of(doc) and page(doc, 1).status_code == 404


def test_corrupt_page_starts_are_ignored_not_500(store):
    doc = pdf_doc()
    store.docs[doc]["page_starts"] = [0, "x", 99999]
    assert "page_word_starts" not in text_of(doc) and page(doc, 1).status_code == 404


def test_other_users_document_is_not_visible(store):
    doc = pdf_doc()
    assert page(doc, 1, tok("u2")).status_code == 404


def test_login_required(store):
    assert client.get(f"/api/documents/{pdf_doc()}/pages/1").status_code == 401


# ---------------- görsellerden okunan metin ----------------
@pytest.fixture
def ocr_acik(monkeypatch):
    f = FakeOcr()
    monkeypatch.setattr(ex, "get_ocr_fn", lambda: f)
    return f


def img_doc():
    r = up("gorselli.docx", docx_with("Birinci sayfa metni burada.", ("img", png((10, 20, 30))), "---",
                                      "Ikinci sayfa metni burada.", ("img", png((200, 10, 10))), ("img", png((10, 200, 10)))))
    assert r.status_code == 202
    return r.json()["id"]


def image(doc_id, n, headers=None):
    return client.get(f"/api/documents/{doc_id}/images/{n}", headers=headers or tok())


def test_detail_lists_images_without_their_text(store, ocr_acik):
    d = text_of(img_doc())
    assert d["images"] == [{"page": 0, "st": "ok"}, {"page": 1, "st": "ok"}, {"page": 1, "st": "ok"}]
    assert d["used_ocr"] is True and "3 görselde metin OCR ile okundu" in d["note"]
    assert "page_meta" not in d and "numara" not in str(d["images"])        # metinler ayrı uç noktadan gelir


def test_detail_note_is_translated(store, ocr_acik):
    doc = img_doc()
    r = client.get(f"/api/documents/{doc}", headers={**tok(), "X-Lang": "en"})
    assert "Text was read from 3 images with OCR" in r.json()["note"]


def test_image_endpoint_returns_text_page_and_status(store, ocr_acik):
    doc = img_doc()
    r = image(doc, 2)
    assert r.status_code == 200
    assert r.json() == {"n": 2, "count": 3, "page": 2, "text": "Gorselden okunan metin numara 2 yeterince uzun", "st": "ok"}
    assert image(doc, 1).json()["page"] == 1 and image(doc, 3).json()["page"] == 2


@pytest.mark.parametrize("n", [0, 4, -1])
def test_image_out_of_range_is_404(store, ocr_acik, n):
    doc = img_doc()
    r = image(doc, n)
    assert r.status_code == 404 and r.json()["detail"] == "Görsel bulunamadı"
    assert image(doc, n, {**tok(), "X-Lang": "en"}).json()["detail"] == "Image not found"


def test_document_without_images_gives_404(store):
    doc = pdf_doc()
    r = image(doc, 1)
    assert r.status_code == 404 and r.json()["detail"] == "Bu belgede görsel yok"
    assert text_of(doc)["images"] == []
    assert image(doc, 1, {**tok(), "X-Lang": "en"}).json()["detail"] == "This document has no images"


def test_image_number_must_be_integer(store, ocr_acik):
    doc = img_doc()
    assert client.get(f"/api/documents/{doc}/images/abc", headers=tok()).status_code == 422


def test_other_users_images_are_not_visible(store, ocr_acik):
    doc = img_doc()
    assert image(doc, 1, tok("u2")).status_code == 404


def test_images_login_required(store, ocr_acik):
    doc = img_doc()
    assert client.get(f"/api/documents/{doc}/images/1").status_code == 401


def test_corrupt_images_meta_is_ignored_not_500(store, ocr_acik):
    doc = img_doc()
    store.docs[doc]["page_meta"]["images"] = [{"page": 99, "text": "x", "st": "ok"}, "bozuk", {"page": 0, "text": 5, "st": "ok"},
                                              {"page": 0, "text": "gecerli kayit", "st": "tamam"}]
    assert text_of(doc)["images"] == [] and image(doc, 1).status_code == 404
    store.docs[doc]["page_meta"] = "bozuk"
    assert text_of(doc)["images"] == [] and image(doc, 1).status_code == 404
