"""Veri erişim katmanı. Supabase PostgREST üzerinden service role ile çalışır;
HER sorgu açıkça user_id ile sınırlandırılır (kullanıcılar birbirinin verisini göremez)."""
import logging
from datetime import datetime

import httpx

from .config import get_settings

log = logging.getLogger(__name__)

LIST_COLS = "id,title,kind,status,size_bytes,page_count,char_count,used_ocr,truncated,note,error,created_at"


class DuplicateError(Exception):
    pass


class StoreError(Exception):
    pass


class SupabaseStore:
    def __init__(self):
        self._client: httpx.AsyncClient | None = None

    def _c(self) -> httpx.AsyncClient:
        if self._client is None:
            s = get_settings()
            if not s.supabase_url or not s.supabase_service_role_key:
                raise StoreError("Supabase yapılandırılmamış")
            k = s.supabase_service_role_key
            self._client = httpx.AsyncClient(
                base_url=f"{s.supabase_url}/rest/v1",
                headers={"apikey": k, "Authorization": f"Bearer {k}"},
                timeout=20,
            )
        return self._client

    async def close(self):
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    @staticmethod
    def _check(r: httpx.Response, ok=(200, 201, 204, 206)):
        if r.status_code not in ok:
            raise StoreError(f"{r.request.method} {r.request.url.path} -> {r.status_code}: {r.text[:200]}")

    async def find_by_hash(self, user_id: str, content_hash: str) -> dict | None:
        r = await self._c().get("/documents", params={
            "select": LIST_COLS, "user_id": f"eq.{user_id}", "content_hash": f"eq.{content_hash}", "limit": "1"})
        self._check(r)
        rows = r.json()
        return rows[0] if rows else None

    async def create_document(self, row: dict) -> dict:
        r = await self._c().post("/documents", json=row, headers={"Prefer": "return=representation"})
        if r.status_code == 409:
            raise DuplicateError()
        self._check(r)
        return r.json()[0]

    async def update_document(self, doc_id: str, user_id: str, values: dict) -> None:
        r = await self._c().patch("/documents", params={"id": f"eq.{doc_id}", "user_id": f"eq.{user_id}"}, json=values)
        self._check(r)

    async def get_document(self, doc_id: str, user_id: str) -> dict | None:
        r = await self._c().get("/documents", params={
            "select": LIST_COLS + ",raw_text", "id": f"eq.{doc_id}", "user_id": f"eq.{user_id}", "limit": "1"})
        self._check(r)
        rows = r.json()
        return rows[0] if rows else None

    async def list_documents(self, user_id: str) -> list[dict]:
        r = await self._c().get("/documents", params={
            "select": LIST_COLS, "user_id": f"eq.{user_id}", "order": "created_at.desc", "limit": "200"})
        self._check(r)
        return r.json()

    async def delete_document(self, doc_id: str, user_id: str) -> bool:
        r = await self._c().delete("/documents", params={"id": f"eq.{doc_id}", "user_id": f"eq.{user_id}"},
                                   headers={"Prefer": "return=representation"})
        self._check(r)
        return len(r.json()) > 0

    async def count_uploads_since(self, user_id: str, since: datetime) -> int:
        r = await self._c().get("/usage_logs", params={
            "select": "id", "user_id": f"eq.{user_id}", "action": "eq.upload", "created_at": f"gte.{since.isoformat()}",
            "limit": "1"}, headers={"Prefer": "count=exact"})
        self._check(r)
        total = r.headers.get("content-range", "*/0").split("/")[-1]
        return int(total) if total.isdigit() else 0

    async def log_usage(self, user_id: str, action: str, units: int = 0) -> None:
        r = await self._c().post("/usage_logs", json={"user_id": user_id, "action": action, "units": units})
        self._check(r)

    async def fail_stale_processing(self) -> None:
        """Sunucu yeniden başlayınca yarım kalan işleri hataya çevirir."""
        r = await self._c().patch("/documents", params={"status": "eq.processing"},
                                  json={"status": "failed", "error": "İşlem yarıda kesildi. Lütfen dosyayı yeniden yükleyin."})
        self._check(r)


_store: SupabaseStore | None = None


def get_store() -> SupabaseStore:
    global _store
    if _store is None:
        _store = SupabaseStore()
    return _store
