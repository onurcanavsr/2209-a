"""YouTube bağlantısından transkript: adres doğrulama, metin biçimi, hata eşleme ve uçtan uca akış (ağ yok: sahte alıcılar)."""
import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app
from app.routers import youtube as yr
from app.store import get_store
from app.youtube import (YouTubeError, Transcript, _map_error, format_text, sure_yazi, video_id_from_url)
from tests.test_documents import FakeStore, tok

client = TestClient(app)
VID = "dQw4w9WgXcQ"


@pytest.mark.parametrize("url", [
    f"https://www.youtube.com/watch?v={VID}", f"https://youtu.be/{VID}?t=42", f"http://m.youtube.com/watch?v={VID}&list=x",
    f"https://www.youtube.com/shorts/{VID}", f"youtube.com/watch?v={VID}", f"https://music.youtube.com/watch?v={VID}",
    f"https://www.youtube.com/embed/{VID}", f"https://www.youtube.com/live/{VID}?feature=share", f"  https://youtu.be/{VID}  ",
])
def test_valid_urls(url):
    assert video_id_from_url(url) == VID


@pytest.mark.parametrize("url", [
    "", "   ", f"https://evil.com/watch?v={VID}", f"https://youtube.com.evil.com/watch?v={VID}",
    "https://www.youtube.com/playlist?list=PL123", "https://www.youtube.com/@kanal", "https://www.youtube.com/watch?v=kisa",
    "javascript:alert(1)", f"https://user:pw@www.youtube.com/watch?v={VID}", f"https://www.youtube.com:8080/watch?v={VID}",
    "file:///etc/passwd", "https://youtu.be/", f"https://www.youtube.com/watch?v={VID[:-1]}$", "x" * 400,
])
def test_invalid_urls(url):
    with pytest.raises(YouTubeError):
        video_id_from_url(url)


def test_format_text_paragraphs_and_cleanup():
    sn = [(0, 2, "Merhaba arkadaşlar &amp; hoş geldiniz."), (2, 3, "Bugün  şunu\nanlatacağım."), (5, 2, ""), (20, 2, "Yeni bölüm.")]
    text, seconds = format_text(sn)
    assert text == "Merhaba arkadaşlar & hoş geldiniz. Bugün şunu anlatacağım.\n\nYeni bölüm."   # 6 sn'den uzun boşlukta paragraf
    assert seconds == 22


def test_error_mapping_hides_internals():
    blocked = _map_error(type("IpBlocked", (Exception,), {})("secret-proxy-url"))
    assert "engelliyor" in str(blocked) and "secret" not in str(blocked)
    assert "altyazı" in str(_map_error(type("TranscriptsDisabled", (Exception,), {})()))
    assert "bulunamadı" in str(_map_error(type("VideoUnavailable", (Exception,), {})()))
    assert "alınamadı" in str(_map_error(RuntimeError("stack trace")))


def test_sure_yazi():
    assert (sure_yazi(40), sure_yazi(75), sure_yazi(3900)) == ("40 sn", "1 dk 15 sn", "1 sa 5 dk")


# ---------- uçtan uca (sahte alıcı + sahte depo) ----------
@pytest.fixture
def env(monkeypatch):
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "x" * 40)
    get_settings.cache_clear()
    st = FakeStore()
    box = {"calls": [], "result": None, "title": "Mitokondri Dersi", "gen": True}

    def fetch(video_id, proxy_url=""):
        box["calls"].append((video_id, proxy_url))
        r = box["result"]
        if isinstance(r, Exception):
            raise r
        return r or Transcript(text="Merhaba arkadaşlar, bugün mitokondriyi anlatacağım.\n\nHücrenin enerji santralidir.",
                               language="tr", generated=box["gen"], seconds=754)

    async def title(video_id):
        return box["title"]

    app.dependency_overrides[get_store] = lambda: st
    app.dependency_overrides[yr.transcript_fetcher] = lambda: fetch
    app.dependency_overrides[yr.title_fetcher] = lambda: title
    yield st, box
    app.dependency_overrides.clear()
    get_settings.cache_clear()


def post(url=f"https://www.youtube.com/watch?v={VID}", user="alice"):
    return client.post("/api/documents/youtube", json={"url": url}, headers=tok(user))


def test_login_required(env):
    assert client.post("/api/documents/youtube", json={"url": f"https://youtu.be/{VID}"}).status_code == 401


def test_success_creates_ready_youtube_document(env):
    st, box = env
    r = post()
    assert r.status_code == 202 and r.json()["kind"] == "youtube" and r.json()["cached"] is False
    d = st.docs[r.json()["id"]]            # arka plan görevi yanıttan sonra TestClient içinde tamamlanır
    assert d["status"] == "ready" and d["title"] == "Mitokondri Dersi"
    assert d["raw_text"].startswith("Merhaba arkadaşlar") and d["char_count"] == len(d["raw_text"])
    assert "12 dk 34 sn" in d["note"] and "Türkçe" in d["note"] and "otomatik altyazı" in d["note"] and "yazım hataları" in d["note"]
    assert box["calls"] == [(VID, "")]
    assert ("alice", "upload") in st.usage      # günlük yükleme sınırına sayılır


def test_manual_captions_have_no_error_warning(env):
    st, box = env
    box["gen"] = False
    d = st.docs[post().json()["id"]]
    assert "yazım hataları" not in d["note"]


def test_same_video_is_cached_not_refetched(env):
    st, box = env
    post()
    r = post(f"https://youtu.be/{VID}")
    assert r.status_code == 200 and r.json()["cached"] is True
    assert len(box["calls"]) == 1 and len(st.docs) == 1


def test_other_users_get_their_own_copy(env):
    st, _ = env
    a, b = post(user="alice").json()["id"], post(user="bob").json()["id"]
    assert a != b and len(st.docs) == 2
    assert client.get(f"/api/documents/{a}", headers=tok("bob")).status_code == 404


def test_bad_url_is_422_and_nothing_is_fetched(env):
    st, box = env
    r = post("https://evil.com/watch?v=" + VID)
    assert r.status_code == 422 and "YouTube" in r.json()["detail"]
    assert box["calls"] == [] and st.docs == {}


def test_failure_marks_document_failed_with_safe_message(env):
    st, box = env
    box["result"] = _map_error(type("IpBlocked", (Exception,), {})("10.0.0.1 proxy"))
    d = st.docs[post().json()["id"]]
    assert d["status"] == "failed" and "engelliyor" in d["error"] and "10.0.0.1" not in d["error"]


def test_unexpected_error_is_generic(env):
    st, box = env
    box["result"] = RuntimeError("Traceback: sk-ant-secret")
    d = st.docs[post().json()["id"]]
    assert d["status"] == "failed" and "sk-ant" not in d["error"]


def test_failed_document_can_be_retried(env):
    st, box = env
    box["result"] = YouTubeError("Bu videoda altyazı (transkript) yok ya da kapatılmış; metin çıkarılamadı.")
    first = post().json()["id"]
    assert st.docs[first]["status"] == "failed"
    box["result"] = None
    second = post()
    assert second.status_code == 202 and second.json()["id"] != first and first not in st.docs
    assert st.docs[second.json()["id"]]["status"] == "ready"


def test_too_short_transcript_fails(env):
    st, box = env
    box["result"] = Transcript(text="Müzik", language="tr", generated=True, seconds=5)
    assert st.docs[post().json()["id"]]["status"] == "failed"


def test_very_long_transcript_is_truncated_at_paragraph(env, monkeypatch):
    st, box = env
    monkeypatch.setenv("MAX_TEXT_CHARS", "200")
    get_settings.cache_clear()
    box["result"] = Transcript(text="\n\n".join(["a" * 90] * 5), language="tr", generated=False, seconds=300)
    d = st.docs[post().json()["id"]]
    assert d["status"] == "ready" and d["truncated"] is True and len(d["raw_text"]) <= 200
    assert not d["raw_text"].endswith("\n") and "ilk bölümü" in d["note"]


def test_daily_limit(env, monkeypatch):
    monkeypatch.setenv("DAILY_LIMIT_PER_USER", "1")
    get_settings.cache_clear()
    assert post(f"https://youtu.be/{VID}").status_code == 202
    assert post("https://youtu.be/aaaaaaaaaaa").status_code == 429


def test_proxy_setting_is_passed_to_fetcher(env, monkeypatch):
    st, box = env
    monkeypatch.setenv("YOUTUBE_PROXY_URL", "http://p.example:8080")
    get_settings.cache_clear()
    post()
    assert box["calls"][0][1] == "http://p.example:8080"
