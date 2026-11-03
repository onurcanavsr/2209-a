"""Özet PDF'i uç noktası: giriş, yalıtım, kayıtlı özet şartı, dil, kota harcamama, yazı tipi hatası."""
import pytest

from app import pdfexport as px
from tests.test_documents import tok
from tests.test_summary import client, env, new_doc, summarize  # noqa: F401  (env bir fixture'dır)


@pytest.fixture(autouse=True)
def _fontlu():
    try:
        px.ensure_fonts()
    except px.PdfFontError:
        pytest.skip("DejaVu Sans yazı tipi yok")


def pdf(d, user="u1", level="medium", **headers):
    return client.get(f"/api/documents/{d}/summary/pdf", params={"level": level}, headers={**tok(user), **headers})


def test_login_required(env):
    d = new_doc()
    assert client.get(f"/api/documents/{d}/summary/pdf").status_code == 401


def test_downloads_saved_summary_as_pdf_without_spending_quota(env):
    st, box = env
    d = new_doc()
    summarize(d)
    calls, usage = len(box["calls"]), len(st.usage)
    r = pdf(d)
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF-")
    cd = r.headers["content-disposition"]
    assert cd.startswith("attachment;") and "filename*=UTF-8''notlar%20-%20%C3%B6zet.pdf" in cd
    assert r.headers["cache-control"] == "private, no-store"
    assert len(box["calls"]) == calls and len(st.usage) == usage        # yapay zekâ çağrısı ve kota yok


def test_404_when_no_summary_at_that_level(env):
    d = new_doc()
    summarize(d, level="short")
    r = pdf(d, level="detailed")
    assert r.status_code == 404 and r.json()["detail"] == "Bu seviyede kayıtlı özet yok. Önce özeti oluşturun."
    r = pdf(d, level="detailed", **{"X-Lang": "en"})
    assert r.json()["detail"] == "There is no saved summary at this level. Create the summary first."


def test_other_users_document_is_not_found(env):
    d = new_doc("u1")
    summarize(d, "u1")
    assert pdf(d, user="u2").status_code == 404


def test_invalid_level_is_rejected(env):
    d = new_doc()
    assert pdf(d, level="huge").status_code == 422


def test_summaries_are_stored_per_language(env):
    d = new_doc()
    summarize(d)                                                          # yalnızca Türkçe özet kayıtlı
    assert pdf(d, **{"X-Lang": "en"}).status_code == 404                  # diller ayrı saklanır


def test_missing_font_gives_503_not_500(env, monkeypatch):
    d = new_doc()
    summarize(d)
    monkeypatch.setattr(px, "_fonts_ready", False)
    monkeypatch.setattr(px, "FONT_DIRS", ())
    r = pdf(d)
    assert r.status_code == 503 and "PDF şu anda hazırlanamıyor" in r.json()["detail"]
