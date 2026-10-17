"""Devre dışı bırakılan hesapları API'de anında durdurur.

Supabase'te kullanıcı yasaklansa bile elindeki jeton süresi dolana kadar (~1 saat) geçerlidir; bu ara katman her
isteğin jetonundaki kullanıcının profiles.is_active değerine bakar (kısa süreli önbellekle) ve devre dışıysa 403 döner.
- Hesabı görme (GET /api/me) ve silme (DELETE /api/me) engellenmez: KVKK gereği kullanıcı verisini silebilmelidir.
- Veritabanına ulaşılamazsa istek geçirilir (zaten hiçbir uç nokta veritabanı olmadan çalışmaz); hata günlüğe yazılır.
- Geçersiz/eksik jeton burada karara bağlanmaz; 401'i ilgili uç nokta verir.
Saf ASGI olduğundan SSE akışlarını bozmaz. Yalnızca standart kütüphane kullanır (bağımsız test edilebilir)."""
import asyncio
import json
import logging
import time
from typing import Any, Awaitable, Callable

log = logging.getLogger(__name__)

EXEMPT = {("GET", "/api/me"), ("DELETE", "/api/me"), ("GET", "/health")}
DEFAULT_TTL = 30.0
MESSAGE = "Hesabınız devre dışı bırakıldı. Bilgi için yönetici ile iletişime geçin."


class ActiveCache:
    def __init__(self, ttl: float = DEFAULT_TTL, clock: Callable[[], float] = time.monotonic):
        self.ttl, self.clock = ttl, clock
        self._d: dict[str, tuple[float, bool]] = {}

    def get(self, user_id: str) -> bool | None:
        e = self._d.get(user_id)
        if e and e[0] > self.clock():
            return e[1]
        self._d.pop(user_id, None)
        return None

    def set(self, user_id: str, active: bool) -> None:
        if len(self._d) > 5000:   # sınırsız büyümesin
            self._d.clear()
        self._d[user_id] = (self.clock() + self.ttl, active)

    def invalidate(self, user_id: str | None = None) -> None:
        if user_id is None:
            self._d.clear()
        else:
            self._d.pop(user_id, None)


ACTIVE_CACHE = ActiveCache()


class ActiveGuard:
    def __init__(self, app: Any, decode: Callable[[str], dict],
                 lookup: Callable[[str], Awaitable[bool | None]],
                 enabled: Callable[[], bool] = lambda: True, cache: ActiveCache | None = None):
        self.app, self.decode, self.lookup, self.enabled = app, decode, lookup, enabled
        self.cache = cache if cache is not None else ACTIVE_CACHE

    @staticmethod
    def _bearer(scope: dict) -> str | None:
        for k, v in scope.get("headers", []):
            if k == b"authorization":
                parts = v.decode("latin-1").split(" ", 1)
                if len(parts) == 2 and parts[0].lower() == "bearer" and parts[1].strip():
                    return parts[1].strip()
        return None

    async def _active(self, user_id: str) -> bool:
        cached = self.cache.get(user_id)
        if cached is not None:
            return cached
        try:
            res = await self.lookup(user_id)
        except Exception:
            log.warning("Hesap durumu sorgulanamadı (kullanıcı %s); istek geçirildi", user_id, exc_info=True)
            return True
        active = True if res is None else bool(res)   # profil bulunamadıysa karar uç noktaya bırakılır
        self.cache.set(user_id, active)
        return active

    async def __call__(self, scope: dict, receive: Any, send: Any) -> None:
        if (scope["type"] != "http" or scope.get("method") == "OPTIONS"
                or (scope.get("method"), scope.get("path")) in EXEMPT or not self.enabled()):
            return await self.app(scope, receive, send)
        token = self._bearer(scope)
        if not token:
            return await self.app(scope, receive, send)
        try:
            claims = await asyncio.to_thread(self.decode, token)   # JWKS ilk çekiminde ağ kullanabilir
        except Exception:
            return await self.app(scope, receive, send)
        user_id = claims.get("sub") if isinstance(claims, dict) else None
        if not user_id or await self._active(str(user_id)):
            return await self.app(scope, receive, send)
        body = json.dumps({"detail": MESSAGE}, ensure_ascii=False).encode()
        await send({"type": "http.response.start", "status": 403,
                    "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]})
        await send({"type": "http.response.body", "body": body})
