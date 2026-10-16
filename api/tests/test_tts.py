"""Faz 4: seslendirme (metin hazırlama, sağlayıcılar, önbellek, kota, yalıtım, indirme)."""
import os
import time

import httpx
import pytest
from fastapi.testclient import TestClient

from app import audio_cache
from app.config import get_settings
from app.main import app
from app.routers import audio as au
from app.speech import prepare, split_segments
from app.store import get_store
from app.tts.azure_provider import AzureTTS
from app.tts.base import TTSError, check_mp3
from tests.test_documents import make_docx, tok, up
from tests.test_summary import FakeStore2

client = TestClient(app)
U1 = "11111111-1111-1111-1111-111111111111"
ALICE = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
BOB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
SUMMARY = ("## Hücre Zarı\nHücre zarı **seçici** geçirgendir. Maddelerin geçişini düzenler.\n\n"
           "- Pasif taşıma enerji gerektirmez\n- Aktif taşıma ATP kullanır\n\n## Sonuç\nZar hayati önemdedir.")


class FakeStore3(FakeStore2):
    def __init__(self):
        super().__init__()
        self.units: list[tuple[str, str, int]] = []

    async def log_usage(self, user_id, action, units=0):
        await super().log_usage(user_id, action, units)
        self.units.append((user_id, action, units))

    async def sum_units_since(self, user_id, action, since):
        return sum(n for u, a, n in self.units if u == user_id and a == action)


class FakeTTS:
    name = "fake"

    def __init__(self):
        self.calls: list[tuple[str, str]] = []
        self.fail = False

    async def synthesize(self, text, voice):
        self.calls.append((voice, text))
        if self.fail:
            raise TTSError("gizli-anahtar-abc123 kota aşıldı")
        return b"ID3" + b"\x00" * 600 + f"[{voice}]{text}".encode()


@pytest.fixture
def env(monkeypatch, tmp_path):
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "x" * 40)
    monkeypatch.setenv("AUDIO_DIR", str(tmp_path / "audio"))
    get_settings.cache_clear()
    st, tts = FakeStore3(), FakeTTS()
    app.dependency_overrides[get_store] = lambda: st
    app.dependency_overrides[au.tts_provider] = lambda: tts
    yield st, tts, tmp_path / "audio"
    app.dependency_overrides.clear()
    get_settings.cache_clear()


def doc_with_summary(st, user=U1, level="medium"):
    r = up("notlar.docx", make_docx(), tok(user))
    d = r.json()["id"]
    st.sums[(d, level)] = {"level": level, "content": SUMMARY, "model": "m", "created_at": "now"}
    return d


def get(path, user=U1, **params):
    return client.get(path, params=params, headers=tok(user))


# ---------- metin hazırlama ----------
def test_prepare_strips_markdown_and_adds_pauses():
    u = prepare(SUMMARY, "summary")
    assert u[0] == "Hücre Zarı."
    assert "**" not in " ".join(u) and "##" not in " ".join(u)
    assert "Pasif taşıma enerji gerektirmez." in u            # madde sonuna nokta
    assert "Sonuç." in u


def test_prepare_joins_wrapped_pdf_lines_for_text_source():
    u = prepare("Hücre zarı seçici\ngeçirgendir ve madde\nalışverişini düzenler\n\nİkinci paragraf.", "text")
    assert u[0] == "Hücre zarı seçici geçirgendir ve madde alışverişini düzenler."
    assert u[1] == "İkinci paragraf."


def test_prepare_slides_and_tables():
    u = prepare("[Slayt 2]\nFotosentez\nAd | Değer\nKonuşmacı notu: ışık", "text")
    assert u[0] == "Slayt 2." and "Ad, Değer." in u


def test_split_segments_limits_and_keeps_content():
    sent = "Bu bir deneme cümlesidir ve biraz uzundur. "
    units = [sent * 8 for _ in range(40)]
    segs = split_segments(units, 1200)
    assert all(len(s) <= 1200 for s in segs) and len(segs) > 5
    assert len(segs[0]) <= 500                                  # ilk bölüm kısa: hızlı başlangıç
    assert sum(s.count("deneme") for s in segs) == 320
    long = split_segments(["kelime " * 500], 1000)              # noktasız dev cümle sert bölünür
    assert all(len(s) <= 1000 for s in long) and len(long) >= 4


# ---------- sağlayıcılar ----------
def test_check_mp3():
    assert check_mp3(b"ID3" + b"\x00" * 600)
    assert check_mp3(b"\xff\xfb" + b"\x00" * 600)
    for bad in (b"", b"<html>hata</html>" * 100, b"ID3"):
        with pytest.raises(TTSError):
            check_mp3(bad)


@pytest.mark.anyio
async def test_azure_request_shape_and_escaping():
    seen = {}

    def handler(req: httpx.Request):
        seen["url"], seen["h"], seen["body"] = str(req.url), req.headers, req.content.decode()
        return httpx.Response(200, content=b"ID3" + b"\x00" * 600)

    p = AzureTTS("anahtar", "westeurope", transport=httpx.MockTransport(handler))
    out = await p.synthesize("A & B < C", "tr-TR-EmelNeural")
    assert out.startswith(b"ID3")
    assert seen["url"] == "https://westeurope.tts.speech.microsoft.com/cognitiveservices/v1"
    assert seen["h"]["ocp-apim-subscription-key"] == "anahtar"
    assert seen["h"]["x-microsoft-outputformat"] == "audio-24khz-48kbitrate-mono-mp3"
    assert "A &amp; B &lt; C" in seen["body"] and "tr-TR-EmelNeural" in seen["body"]


@pytest.mark.anyio
async def test_azure_errors():
    p = AzureTTS("k", "westeurope", transport=httpx.MockTransport(lambda r: httpx.Response(401, text="Access denied")))
    with pytest.raises(TTSError):
        await p.synthesize("x", "tr-TR-EmelNeural")
    with pytest.raises(ValueError):
        AzureTTS("k", "evil.com/../")


@pytest.fixture
def anyio_backend():
    return "asyncio"


# ---------- uç noktalar ----------
def test_login_required(env):
    st, _, _ = env
    d = doc_with_summary(st)
    for p in (f"/api/documents/{d}/audio/manifest", f"/api/documents/{d}/audio/segment/0",
              f"/api/documents/{d}/audio/download"):
        assert client.get(p).status_code == 401


def test_manifest_and_segment_flow(env):
    st, tts, audio_dir = env
    d = doc_with_summary(st)
    m = get(f"/api/documents/{d}/audio/manifest", level="medium").json()
    assert m["segments"] >= 1 and m["voice"] == "tr-TR-EmelNeural" and m["cached_segments"] == 0
    r = get(f"/api/documents/{d}/audio/segment/0")
    assert r.status_code == 200 and r.headers["content-type"] == "audio/mpeg" and r.content.startswith(b"ID3")
    assert len(tts.calls) == 1 and tts.calls[0][1].startswith("Hücre Zarı.")
    assert any(audio_dir.rglob("*.mp3"))
    assert get(f"/api/documents/{d}/audio/manifest").json()["cached_segments"] == 1
    assert (U1, "tts", len(tts.calls[0][1])) in st.units


def test_second_request_uses_cache(env):
    st, tts, _ = env
    d = doc_with_summary(st)
    a = get(f"/api/documents/{d}/audio/segment/0").content
    b = get(f"/api/documents/{d}/audio/segment/0").content
    assert a == b and len(tts.calls) == 1 and len([u for u in st.units if u[1] == "tts"]) == 1


def test_voice_changes_audio_and_cache_key(env):
    st, tts, _ = env
    d = doc_with_summary(st)
    get(f"/api/documents/{d}/audio/segment/0")
    r = get(f"/api/documents/{d}/audio/segment/0", voice="tr-TR-AhmetNeural")
    assert b"[tr-TR-AhmetNeural]" in r.content and len(tts.calls) == 2


def test_invalid_voice_level_segment(env):
    st, _, _ = env
    d = doc_with_summary(st)
    assert get(f"/api/documents/{d}/audio/segment/0", voice="evil-voice").status_code == 422
    assert get(f"/api/documents/{d}/audio/manifest", level="x").status_code == 422
    assert get(f"/api/documents/{d}/audio/segment/999").status_code == 404
    assert get(f"/api/documents/{d}/audio/segment/-1").status_code == 404


def test_other_user_cannot_hear_my_document(env):
    st, tts, _ = env
    d = doc_with_summary(st, ALICE)
    for p in ("manifest", "segment/0", "download"):
        assert get(f"/api/documents/{d}/audio/{p}", user=BOB).status_code == 404
    assert tts.calls == []


def test_missing_summary_and_unready_text(env):
    st, _, _ = env
    d = doc_with_summary(st)
    assert get(f"/api/documents/{d}/audio/manifest", level="short").status_code == 404
    st.docs[d]["status"] = "processing"
    assert get(f"/api/documents/{d}/audio/manifest", source="text").status_code == 409


def test_text_source(env):
    st, tts, _ = env
    d = doc_with_summary(st)
    st.docs[d]["raw_text"] = "Mitokondri enerji üretir.\nATP oluşur.\n\nİkinci paragraf burada."
    m = get(f"/api/documents/{d}/audio/manifest", source="text").json()
    assert m["segments"] == 1
    r = get(f"/api/documents/{d}/audio/segment/0", source="text")
    assert r.status_code == 200 and "Mitokondri enerji üretir. ATP oluşur." in tts.calls[0][1]


def test_daily_quota_blocks_new_but_not_cached(env, monkeypatch):
    st, tts, _ = env
    monkeypatch.setenv("TTS_SEGMENT_CHARS", "60")
    monkeypatch.setenv("DAILY_TTS_CHARS", "100")
    get_settings.cache_clear()
    d = doc_with_summary(st)
    n = get(f"/api/documents/{d}/audio/manifest").json()["segments"]
    assert n >= 3
    codes = [get(f"/api/documents/{d}/audio/segment/{i}").status_code for i in range(n)]
    assert 200 in codes and 429 in codes
    assert get(f"/api/documents/{d}/audio/segment/0").status_code == 200   # önbellektekiler yine çalışır
    assert sum(u for _, a, u in st.units if a == "tts") <= 100


def test_provider_failure_is_clean_and_not_cached(env):
    st, tts, audio_dir = env
    tts.fail = True
    d = doc_with_summary(st)
    r = get(f"/api/documents/{d}/audio/segment/0")
    assert r.status_code == 503 and "gizli" not in r.text and "abc123" not in r.text
    assert not list(audio_dir.rglob("*.mp3")) if audio_dir.exists() else True
    assert [u for u in st.units if u[1] == "tts"] == []   # başarısız üretim kotadan düşmez
    tts.fail = False
    assert get(f"/api/documents/{d}/audio/segment/0").status_code == 200


def test_download_concatenates_in_order(env):
    st, tts, _ = env
    d = doc_with_summary(st)
    m = get(f"/api/documents/{d}/audio/manifest").json()
    parts = [get(f"/api/documents/{d}/audio/segment/{i}").content for i in range(m["segments"])]
    r = get(f"/api/documents/{d}/audio/download")
    assert r.status_code == 200 and r.content == b"".join(parts)
    cd = r.headers["content-disposition"]
    assert cd.startswith("attachment;") and "notlar - ozet.mp3" in cd and "filename*=UTF-8''" in cd


def test_download_text_too_long_413(env, monkeypatch):
    st, _, _ = env
    monkeypatch.setenv("TTS_MAX_DOWNLOAD_CHARS", "50")
    get_settings.cache_clear()
    d = doc_with_summary(st)
    st.docs[d]["raw_text"] = "Bu cümle yeterince uzundur ve sınırı aşar. " * 10
    assert get(f"/api/documents/{d}/audio/download", source="text").status_code == 413


def test_deleting_document_removes_its_audio(env):
    st, _, audio_dir = env
    d = doc_with_summary(st)
    get(f"/api/documents/{d}/audio/segment/0")
    assert any(audio_dir.rglob("*.mp3"))
    assert client.delete(f"/api/documents/{d}", headers=tok(U1)).status_code == 204
    assert not list(audio_dir.rglob("*.mp3"))


# ---------- önbellek ----------
def test_cache_cleanup_removes_only_expired(env):
    _, _, audio_dir = env
    old = audio_cache.path_for("11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222", "a1")
    new = audio_cache.path_for("11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222", "b2")
    audio_cache.write(old, b"x")
    audio_cache.write(new, b"y")
    past = time.time() - 20 * 86400
    os.utime(old, (past, past))
    assert audio_cache.cleanup(14) == 1
    assert not old.exists() and new.exists()


def test_cache_paths_reject_traversal(env):
    with pytest.raises(ValueError):
        audio_cache.path_for("../../etc", "22222222-2222-2222-2222-222222222222", "a1")
    with pytest.raises(ValueError):
        audio_cache.path_for("11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222", "../x")
    audio_cache.purge_user("../../")        # geçersiz kimlik: hiçbir şey silinmez, hata vermez


# ---------- Faz 5b: kelime vurgusu için bölüm metni ----------
def test_segment_text_matches_what_is_spoken_and_costs_nothing(env):
    st, tts, _ = env
    d = doc_with_summary(st)
    r = get(f"/api/documents/{d}/audio/segment/0/text")
    assert r.status_code == 200 and r.json()["index"] == 0
    get(f"/api/documents/{d}/audio/segment/0")                       # aynı bölüm gerçekten seslendirilir
    assert r.json()["text"] == tts.calls[0][1]                       # vurgulanan metin = okunan metin
    assert "**" not in r.json()["text"] and "##" not in r.json()["text"]
    n_tts = len(tts.calls)
    get(f"/api/documents/{d}/audio/segment/0/text")
    assert len(tts.calls) == n_tts and len([u for u in st.units if u[1] == "tts"]) == 1  # metin isteği kota harcamaz


def test_segment_text_text_source_and_bounds(env):
    st, _, _ = env
    d = doc_with_summary(st)
    st.docs[d]["raw_text"] = "Mitokondri enerji üretir.\nATP oluşur."
    r = get(f"/api/documents/{d}/audio/segment/0/text", source="text")
    assert r.status_code == 200 and "Mitokondri enerji üretir. ATP oluşur." in r.json()["text"]
    assert get(f"/api/documents/{d}/audio/segment/999/text").status_code == 404
    assert get(f"/api/documents/{d}/audio/segment/-1/text").status_code == 404
    assert get(f"/api/documents/{d}/audio/segment/0/text", level="short").status_code == 404  # özet yok


def test_segment_text_login_and_isolation(env):
    st, tts, _ = env
    d = doc_with_summary(st, ALICE)
    assert client.get(f"/api/documents/{d}/audio/segment/0/text").status_code == 401
    assert get(f"/api/documents/{d}/audio/segment/0/text", user=BOB).status_code == 404
    assert tts.calls == []

