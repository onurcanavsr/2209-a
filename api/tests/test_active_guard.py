"""Devre dışı hesap koruması: saf ASGI, FastAPI gerektirmez."""
import asyncio
import json

from app.active_guard import ActiveCache, ActiveGuard


class Clock:
    def __init__(self): self.t = 0.0
    def __call__(self): return self.t


def make(active_map, calls=None, enabled=True, raises=False, ttl=30.0):
    clock = Clock()
    cache = ActiveCache(ttl=ttl, clock=clock)
    seen = []

    async def downstream(scope, receive, send):
        seen.append(scope.get("path"))
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    def decode(token):
        if token == "bad":
            raise ValueError("geçersiz")
        if token == "nosub":
            return {}
        return {"sub": token}

    async def lookup(uid):
        if calls is not None:
            calls.append(uid)
        if raises:
            raise RuntimeError("veritabanı yok")
        return active_map.get(uid)

    return ActiveGuard(downstream, decode, lookup, enabled=lambda: enabled, cache=cache), seen, cache, clock


def call(guard, method="GET", path="/api/documents", token=None, scope_type="http"):
    headers = [(b"authorization", f"Bearer {token}".encode())] if token else []
    out = []

    async def send(m): out.append(m)
    async def receive(): return {"type": "http.request"}
    asyncio.run(guard({"type": scope_type, "method": method, "path": path, "headers": headers}, receive, send))
    status = out[0]["status"] if out else None
    body = b"".join(m.get("body", b"") for m in out if m["type"] == "http.response.body")
    return status, body


def test_inactive_user_gets_403_json_and_never_reaches_app():
    g, seen, *_ = make({"u1": False})
    status, body = call(g, token="u1")
    assert status == 403 and "devre dışı" in json.loads(body)["detail"] and seen == []


def test_active_user_passes():
    g, seen, *_ = make({"u1": True})
    assert call(g, token="u1")[0] == 200 and seen == ["/api/documents"]


def test_no_token_bad_token_and_missing_sub_pass_through_to_route_for_401():
    g, seen, *_ = make({})
    assert call(g)[0] == 200 and call(g, token="bad")[0] == 200 and call(g, token="nosub")[0] == 200
    assert len(seen) == 3


def test_unknown_profile_is_not_blocked():
    g, *_ = make({})                       # lookup None → profil yok
    assert call(g, token="ghost")[0] == 200


def test_user_can_still_view_and_delete_own_account_when_inactive():
    g, *_ = make({"u1": False})
    assert call(g, "GET", "/api/me", "u1")[0] == 200
    assert call(g, "DELETE", "/api/me", "u1")[0] == 200       # KVKK: silme hakkı engellenmez
    assert call(g, "GET", "/health", "u1")[0] == 200
    assert call(g, "POST", "/api/me", "u1")[0] == 403         # yalnızca belirtilen yöntem+yol muaf


def test_options_preflight_and_non_http_pass():
    g, *_ = make({"u1": False})
    assert call(g, "OPTIONS", "/api/documents", "u1")[0] == 200
    out = []
    async def send(m): out.append(m)
    asyncio.run(g({"type": "lifespan"}, None, send))          # lifespan'a dokunmaz (downstream çağrılır)
    assert out and out[0]["status"] == 200


def test_disabled_guard_passes_everything():
    g, *_ = make({"u1": False}, enabled=False)
    assert call(g, token="u1")[0] == 200


def test_lookup_is_cached_then_expires():
    calls = []
    g, _, cache, clock = make({"u1": True}, calls)
    call(g, token="u1"); call(g, token="u1"); call(g, token="u1")
    assert calls == ["u1"]
    clock.t = 31
    call(g, token="u1")
    assert calls == ["u1", "u1"]


def test_invalidate_applies_status_change_immediately():
    active = {"u1": True}
    g, _, cache, _ = make(active)
    assert call(g, token="u1")[0] == 200
    active["u1"] = False                      # yönetici devre dışı bıraktı
    assert call(g, token="u1")[0] == 200      # önbellek yüzünden henüz görünmez (≤ TTL)
    cache.invalidate("u1")                    # yönetici işlemi önbelleği temizler
    assert call(g, token="u1")[0] == 403
    active["u1"] = True; cache.invalidate("u1")
    assert call(g, token="u1")[0] == 200


def test_database_failure_fails_open_and_is_not_cached():
    calls = []
    g, seen, cache, _ = make({"u1": False}, calls, raises=True)
    assert call(g, token="u1")[0] == 200 and call(g, token="u1")[0] == 200
    assert calls == ["u1", "u1"] and len(seen) == 2          # hata önbelleğe yazılmaz, her seferinde yeniden denenir


def test_lowercase_bearer_scheme_and_garbage_header():
    g, seen, *_ = make({"u1": False})
    out = []
    async def send(m): out.append(m)
    async def receive(): return {}
    asyncio.run(g({"type": "http", "method": "GET", "path": "/x", "headers": [(b"authorization", b"bearer u1")]}, receive, send))
    assert out[0]["status"] == 403
    out.clear()
    asyncio.run(g({"type": "http", "method": "GET", "path": "/x", "headers": [(b"authorization", b"Basic abc")]}, receive, send))
    assert out[0]["status"] == 200
