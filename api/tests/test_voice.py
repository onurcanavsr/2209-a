"""Sesli komut: uç nokta (biçim, boyut, kota, yalıtım, gizlilik) ve OpenAI sağlayıcısı (istek biçimi, geri düşme)."""
import asyncio

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.costs import estimate_cost
from app.main import app
from app.routers import voice as vo
from app.store import get_store
from app.stt.base import STTError
from app.stt.openai_provider import OpenAISTT
from tests.test_documents import tok
from tests.test_tts import FakeStore3

client = TestClient(app)
ALICE = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
BOB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
WEBM = b"\x1a\x45\xdf\xa3" + b"\x00" * 1500
MP4 = b"\x00\x00\x00\x18ftypiso6" + b"\x00" * 1500


class FakeSTT:
    name = "fake"

    def __init__(self):
        self.calls: list[tuple[str, str, int]] = []
        self.text = "özetle"
        self.fail = False

    async def transcribe(self, audio, filename, mime):
        self.calls.append((filename, mime, len(audio)))
        if self.fail:
            raise STTError("gizli-anahtar-sk-123 hesap bakiyesi yetersiz")
        return self.text


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "x" * 40)
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    get_settings.cache_clear()
    st, stt = FakeStore3(), FakeSTT()
    app.dependency_overrides[get_store] = lambda: st
    app.dependency_overrides[vo.stt_provider] = lambda: stt
    yield st, stt
    app.dependency_overrides.clear()
    get_settings.cache_clear()


def post(data, user=ALICE, name="k.webm", ctype="audio/webm"):
    return client.post("/api/voice/transcribe", files={"audio": (name, data, ctype)}, headers=tok(user))


def test_requires_login(env):
    r = client.post("/api/voice/transcribe", files={"audio": ("k.webm", WEBM, "audio/webm")})
    assert r.status_code == 401
    assert client.get("/api/voice/status").status_code == 401


def test_happy_path_webm(env):
    st, stt = env
    r = post(WEBM)
    assert r.status_code == 200 and r.json() == {"text": "özetle"}
    assert stt.calls == [("komut.webm", "audio/webm", len(WEBM))]
    assert st.units == [(ALICE, "stt", 1)]


def test_safari_mp4_detected_by_content_not_header(env):
    _, stt = env
    r = post(MP4, name="x.bin", ctype="application/octet-stream")   # istemci türü yanlış bildirse de imzaya bakılır
    assert r.status_code == 200
    assert stt.calls[0][:2] == ("komut.mp4", "audio/mp4")


def test_rejects_bad_input(env):
    _, stt = env
    assert post(b"\x1a\x45\xdf\xa3").status_code == 400                       # çok kısa
    assert post(b"%PDF-1.7" + b"\x00" * 2000).status_code == 415              # ses değil
    assert post(WEBM + b"\x00" * 500_000).status_code == 413                  # çok büyük
    assert stt.calls == []


def test_daily_quota_blocks_before_calling_provider(env, monkeypatch):
    st, stt = env
    monkeypatch.setenv("DAILY_STT_REQUESTS", "2")
    get_settings.cache_clear()
    assert post(WEBM).status_code == 200 and post(WEBM).status_code == 200
    r = post(WEBM)
    assert r.status_code == 429 and "yarın" in r.json()["detail"]
    assert len(stt.calls) == 2
    assert post(WEBM, user=BOB).status_code == 200      # kota kullanıcıya özel


def test_provider_error_does_not_leak_details(env):
    st, stt = env
    stt.fail = True
    r = post(WEBM)
    assert r.status_code == 503
    assert "gizli" not in r.text and "sk-" not in r.text
    assert st.units == []                                # başarısız çağrı hakkı düşürmez


def test_status_reports_remaining(env, monkeypatch):
    monkeypatch.setenv("DAILY_STT_REQUESTS", "5")
    get_settings.cache_clear()
    post(WEBM)
    j = client.get("/api/voice/status", headers=tok(ALICE)).json()
    assert j == {"enabled": True, "remaining": 4, "limit": 5}


def test_status_disabled_without_key(env, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "")
    get_settings.cache_clear()
    assert client.get("/api/voice/status", headers=tok(ALICE)).json()["enabled"] is False


def test_not_configured_returns_503(monkeypatch):
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "x" * 40)
    monkeypatch.setenv("OPENAI_API_KEY", "")
    get_settings.cache_clear()
    app.dependency_overrides[get_store] = lambda: FakeStore3()
    try:
        assert post(WEBM).status_code == 503
    finally:
        app.dependency_overrides.clear()
        get_settings.cache_clear()


def test_sniff_formats():
    assert vo.sniff(WEBM) == ("webm", "audio/webm")
    assert vo.sniff(MP4) == ("mp4", "audio/mp4")
    assert vo.sniff(b"OggS" + b"\x00" * 20) == ("ogg", "audio/ogg")
    assert vo.sniff(b"RIFF\x00\x00\x00\x00WAVEfmt ") == ("wav", "audio/wav")
    assert vo.sniff(b"ID3\x04" + b"\x00" * 20) == ("mp3", "audio/mpeg")
    assert vo.sniff(b"hello world, not audio") is None


def test_cost_estimate_for_stt():
    s = get_settings()
    # 1000 komut x 3 sn x 0,0045 $/dk = 0,225 $
    assert estimate_cost("stt", 1000, s) == pytest.approx(0.225)
    assert estimate_cost("stt", 0, s) == 0


# ---- OpenAI sağlayıcısı: gerçek ağ yok, httpx sahte aktarımı ----
def run(coro):
    return asyncio.run(coro)


def make_provider(handler, **kw):
    client_ = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return OpenAISTT("sk-test", http_client=client_, **kw)


def test_openai_request_shape():
    seen = {}

    def handler(req: httpx.Request):
        seen["url"] = str(req.url)
        seen["auth"] = req.headers["authorization"]
        seen["body"] = req.content
        return httpx.Response(200, json={"text": " Özetle "})

    text = run(make_provider(handler).transcribe(WEBM, "komut.webm", "audio/webm"))
    assert text == "Özetle"
    assert seen["url"].endswith("/audio/transcriptions") and seen["auth"] == "Bearer sk-test"
    body = seen["body"]
    assert b'name="model"' in body and b"gpt-transcribe" in body
    assert b'filename="komut.webm"' in body
    assert b"keywords" in body and b"languages" in body


def test_openai_falls_back_when_hints_rejected():
    n = {"i": 0}
    bodies = []

    def handler(req: httpx.Request):
        n["i"] += 1
        bodies.append(req.content)
        if n["i"] == 1:
            return httpx.Response(400, json={"error": {"message": "unknown parameter: keywords"}})
        return httpx.Response(200, json={"text": "oku"})

    assert run(make_provider(handler).transcribe(WEBM, "komut.webm", "audio/webm")) == "oku"
    assert n["i"] == 2 and b"keywords" not in bodies[1] and b'name="language"' in bodies[1]


def test_openai_auth_error_is_generic():
    def handler(req):
        return httpx.Response(401, json={"error": {"message": "Incorrect API key provided: sk-test...abcd"}})

    with pytest.raises(STTError) as e:
        run(make_provider(handler).transcribe(WEBM, "komut.webm", "audio/webm"))
    assert "sk-" not in str(e.value)
