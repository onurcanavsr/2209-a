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


    # ---- özetler (Faz 3). Sahiplik, çağıran tarafından get_document(doc_id, user_id) ile doğrulanır ----
    async def get_summary(self, doc_id: str, level: str) -> dict | None:
        r = await self._c().get("/summaries", params={
            "select": "level,content,model,created_at", "document_id": f"eq.{doc_id}", "level": f"eq.{level}", "limit": "1"})
        self._check(r)
        rows = r.json()
        return rows[0] if rows else None

    async def list_summaries(self, doc_id: str) -> list[dict]:
        r = await self._c().get("/summaries", params={
            "select": "level,content,model,created_at", "document_id": f"eq.{doc_id}"})
        self._check(r)
        return r.json()

    async def save_summary(self, doc_id: str, level: str, content: str, model: str) -> None:
        r = await self._c().post("/summaries", params={"on_conflict": "document_id,level"},
                                 json={"document_id": doc_id, "level": level, "content": content, "model": model},
                                 headers={"Prefer": "resolution=merge-duplicates"})
        self._check(r)

    async def count_actions_since(self, user_id: str, action: str, since: datetime) -> int:
        r = await self._c().get("/usage_logs", params={
            "select": "id", "user_id": f"eq.{user_id}", "action": f"eq.{action}", "created_at": f"gte.{since.isoformat()}",
            "limit": "1"}, headers={"Prefer": "count=exact"})
        self._check(r)
        total = r.headers.get("content-range", "*/0").split("/")[-1]
        return int(total) if total.isdigit() else 0


    async def sum_units_since(self, user_id: str, action: str, since: datetime) -> int:
        """Günlük kota için: bir eylemin 'units' toplamı (ses kotasında karakter sayısı)."""
        r = await self._c().get("/usage_logs", params={
            "select": "units", "user_id": f"eq.{user_id}", "action": f"eq.{action}",
            "created_at": f"gte.{since.isoformat()}", "limit": "5000"})
        self._check(r)
        return sum(int(row.get("units") or 0) for row in r.json())


    # ---- soru-cevap ve testler (Faz 5). Her sorgu user_id ile sınırlıdır ----
    async def add_qa(self, doc_id: str, user_id: str, question: str, answer: str, sources: list, model: str) -> None:
        r = await self._c().post("/qa_messages", json={
            "document_id": doc_id, "user_id": user_id, "question": question,
            "answer": answer, "sources": sources, "model": model})
        self._check(r)

    async def list_qa(self, doc_id: str, user_id: str, limit: int = 50) -> list[dict]:
        """En yeni 'limit' kayıt, eskiden yeniye sıralı döner."""
        r = await self._c().get("/qa_messages", params={
            "select": "id,question,answer,sources,created_at", "document_id": f"eq.{doc_id}",
            "user_id": f"eq.{user_id}", "order": "created_at.desc", "limit": str(limit)})
        self._check(r)
        return list(reversed(r.json()))

    async def delete_qa(self, doc_id: str, user_id: str) -> None:
        r = await self._c().delete("/qa_messages", params={"document_id": f"eq.{doc_id}", "user_id": f"eq.{user_id}"})
        self._check(r)

    async def create_quiz(self, row: dict) -> dict:
        r = await self._c().post("/quizzes", json=row, headers={"Prefer": "return=representation"})
        self._check(r)
        return r.json()[0]

    async def get_quiz(self, quiz_id: str, user_id: str) -> dict | None:
        r = await self._c().get("/quizzes", params={
            "select": "id,document_id,difficulty,question_count,questions,created_at",
            "id": f"eq.{quiz_id}", "user_id": f"eq.{user_id}", "limit": "1"})
        self._check(r)
        rows = r.json()
        return rows[0] if rows else None

    async def list_quizzes(self, doc_id: str, user_id: str) -> list[dict]:
        r = await self._c().get("/quizzes", params={
            "select": "id,difficulty,question_count,created_at", "document_id": f"eq.{doc_id}",
            "user_id": f"eq.{user_id}", "order": "created_at.desc", "limit": "50"})
        self._check(r)
        return r.json()

    async def count_quizzes(self, doc_id: str, user_id: str) -> int:
        r = await self._c().get("/quizzes", params={
            "select": "id", "document_id": f"eq.{doc_id}", "user_id": f"eq.{user_id}", "limit": "1"},
            headers={"Prefer": "count=exact"})
        self._check(r)
        total = r.headers.get("content-range", "*/0").split("/")[-1]
        return int(total) if total.isdigit() else 0

    async def delete_quiz(self, quiz_id: str, user_id: str) -> bool:
        r = await self._c().delete("/quizzes", params={"id": f"eq.{quiz_id}", "user_id": f"eq.{user_id}"},
                                   headers={"Prefer": "return=representation"})
        self._check(r)
        return len(r.json()) > 0

    async def add_attempt(self, row: dict) -> dict:
        r = await self._c().post("/quiz_attempts", json=row, headers={"Prefer": "return=representation"})
        self._check(r)
        return r.json()[0]

    async def list_attempts(self, quiz_id: str, user_id: str) -> list[dict]:
        r = await self._c().get("/quiz_attempts", params={
            "select": "id,score,total,created_at", "quiz_id": f"eq.{quiz_id}", "user_id": f"eq.{user_id}",
            "order": "created_at.desc", "limit": "50"})
        self._check(r)
        return r.json()


    # ---- yönetim paneli (Faz 6). Yalnızca routers/admin.py çağırır ----
    async def get_profile(self, user_id: str) -> dict | None:
        r = await self._c().get("/profiles", params={
            "select": "id,email,role,is_active,created_at", "id": f"eq.{user_id}", "limit": "1"})
        self._check(r)
        rows = r.json()
        return rows[0] if rows else None

    async def set_profile(self, user_id: str, values: dict) -> None:
        r = await self._c().patch("/profiles", params={"id": f"eq.{user_id}"}, json=values)
        self._check(r)

    async def count_active_admins(self) -> int:
        r = await self._c().get("/profiles", params={
            "select": "id", "role": "eq.admin", "is_active": "eq.true", "limit": "1"},
            headers={"Prefer": "count=exact"})
        self._check(r)
        total = r.headers.get("content-range", "*/0").split("/")[-1]
        return int(total) if total.isdigit() else 0

    async def _rpc(self, fn: str, args: dict):
        r = await self._c().post(f"/rpc/{fn}", json=args)
        self._check(r)
        return r.json()

    async def admin_overview(self) -> dict:
        return await self._rpc("admin_overview", {})

    async def admin_users(self, q: str, limit: int, offset: int) -> list[dict]:
        return await self._rpc("admin_user_list", {"p_q": q, "p_limit": limit, "p_offset": offset})

    async def usage_daily(self, start: datetime, end: datetime) -> list[dict]:
        return await self._rpc("admin_usage_daily", {"p_from": start.isoformat(), "p_to": end.isoformat()})

    async def usage_by_user(self, start: datetime, end: datetime, limit: int) -> list[dict]:
        return await self._rpc("admin_usage_by_user", {"p_from": start.isoformat(), "p_to": end.isoformat(), "p_limit": limit})

    async def add_audit(self, row: dict) -> None:
        r = await self._c().post("/admin_audit", json=row)
        self._check(r)

    async def list_audit(self, limit: int) -> list[dict]:
        r = await self._c().get("/admin_audit", params={
            "select": "id,admin_email,action,target_email,detail,created_at", "order": "created_at.desc", "limit": str(limit)})
        self._check(r)
        return r.json()


_store: SupabaseStore | None = None


def get_store() -> SupabaseStore:
    global _store
    if _store is None:
        _store = SupabaseStore()
    return _store
