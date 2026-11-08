"""Sayfa gezintisi — API: belge ayrıntısında sayfa bilgisi, GET /pages/{n}, yalıtım, sayfa bilgisi olmayan belgeler."""
import pytest

from app import extract as ex
from tests.test_documents import client, make_docx, store, tok, up, text_of  # noqa: F401  (store bir fixture'dır)
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
