"""Faz 6: yönetim paneli. Yetki (JWT + canlı profil), kendini/son yöneticiyi koruma, işlemler, denetim kaydı, maliyet."""
import time
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi.testclient import TestClient

from app.active_guard import ACTIVE_CACHE
from app.config import get_settings
from app.costs import estimate_cost
from app.main import app
from app.routers import admin as adm
from app.store import get_store
from tests.test_documents import FakeStore

SECRET = "x" * 40
AD1, AD2 = "00000000-0000-0000-0000-0000000000a1", "00000000-0000-0000-0000-0000000000a2"
ST1, ST2, ST3 = ("00000000-0000-0000-0000-0000000000b1", "00000000-0000-0000-0000-0000000000b2",
                 "00000000-0000-0000-0000-0000000000b3")
GHOST = "00000000-0000-0000-0000-0000000000ff"
client = TestClient(app)


def token(sub, role=None):
    claims = {"sub": sub, "email": f"{sub[-2:]}@x.com", "aud": "authenticated", "exp": int(time.time()) + 3600}
    if role:
        claims["app_metadata"] = {"role": role}
    return {"Authorization": "Bearer " + jwt.encode(claims, SECRET, algorithm="HS256")}


def admin(sub=AD1):
    return token(sub, "admin")


class FakeAdminStore(FakeStore):
    def __init__(self):
        super().__init__()
        mk = lambda i, email, role="student", active=True: {"id": i, "email": email, "role": role, "is_active": active,
                                                            "created_at": "2026-10-01T10:00:00+00:00"}
        self.profiles = {AD1: mk(AD1, "a1@x.com", "admin"), AD2: mk(AD2, "a2@x.com", "admin"),
                         ST1: mk(ST1, "s1@x.com"), ST2: mk(ST2, "s2@x.com"), ST3: mk(ST3, "s3@x.com", active=False)}
        self.users_calls, self.audit, self.daily, self.by_user = [], [], [], []
        self.fail_audit = False

    async def get_profile(self, uid):
        p = self.profiles.get(uid)
        return dict(p) if p else None

    async def set_profile(self, uid, values):
        self.profiles[uid].update(values)

    async def count_active_admins(self):
        return sum(1 for p in self.profiles.values() if p["role"] == "admin" and p["is_active"])

    async def admin_overview(self):
        return {"users": len(self.profiles), "inactive_users": 1, "admins": 2, "new_7d": 1, "active_7d": 2,
                "documents": 5, "documents_failed": 0, "summaries": 3, "quizzes": 1, "qa_messages": 7}

    async def admin_users(self, q, limit, offset):
        self.users_calls.append((q, limit, offset))
        rows = [{**p, "doc_count": 2, "last_activity": None, "total": len(self.profiles)} for p in self.profiles.values()]
        return rows[offset:offset + limit]

    async def usage_daily(self, start, end):
        return list(self.daily)

    async def usage_by_user(self, start, end, limit):
        return list(self.by_user)

    async def add_audit(self, row):
        if self.fail_audit:
            raise RuntimeError("audit yazılamadı")
        self.audit.append(row)

    async def list_audit(self, limit):
        return list(reversed(self.audit))[:limit]


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setenv("SUPABASE_JWT_SECRET", SECRET)
    get_settings.cache_clear()
    ACTIVE_CACHE.invalidate()
    st = FakeAdminStore()
    calls = {"ban": [], "role": [], "delete": [], "purge": [], "fail": set()}

    async def ban(uid, banned):
        if "ban" in calls["fail"]: raise RuntimeError("auth down")
        calls["ban"].append((uid, banned))

    async def role(uid, r):
        if "role" in calls["fail"]: raise RuntimeError("auth down")
        calls["role"].append((uid, r))

    async def delete(uid):
        if "delete" in calls["fail"]: raise RuntimeError("auth down")
        calls["delete"].append(uid)

    monkeypatch.setattr(adm, "set_user_ban", ban)
    monkeypatch.setattr(adm, "set_user_role", role)
    monkeypatch.setattr(adm, "delete_auth_user", delete)
    monkeypatch.setattr(adm.audio_cache, "purge_user", lambda uid: calls["purge"].append(uid))
    app.dependency_overrides[get_store] = lambda: st
    yield st, calls
    app.dependency_overrides.clear()
    get_settings.cache_clear()
    ACTIVE_CACHE.invalidate()


GETS = ["/api/admin/overview", "/api/admin/users", "/api/admin/usage", "/api/admin/usage/users", "/api/admin/limits", "/api/admin/audit"]


# ---------- yetki ----------
@pytest.mark.parametrize("path", GETS)
def test_login_required(env, path):
    assert client.get(path).status_code == 401


@pytest.mark.parametrize("path", GETS)
def test_student_gets_403(env, path):
    assert client.get(path, headers=token(ST1)).status_code == 403


def test_mutations_need_admin(env):
    assert client.put(f"/api/admin/users/{ST2}/status", json={"is_active": False}).status_code == 401
    assert client.put(f"/api/admin/users/{ST2}/status", json={"is_active": False}, headers=token(ST1)).status_code == 403
    assert client.put(f"/api/admin/users/{ST2}/role", json={"role": "admin"}, headers=token(ST1)).status_code == 403
    assert client.delete(f"/api/admin/users/{ST2}", headers=token(ST1)).status_code == 403


def test_demoted_admin_with_old_token_is_refused(env):
    """JWT hâlâ 'admin' diyor ama veritabanında rol alınmış: canlı doğrulama engeller."""
    st, _ = env
    st.profiles[AD2]["role"] = "student"
    assert client.get("/api/admin/overview", headers=admin(AD2)).status_code == 403


def test_deactivated_admin_and_missing_profile_are_refused(env):
    st, _ = env
    st.profiles[AD2]["is_active"] = False
    assert client.get("/api/admin/overview", headers=admin(AD2)).status_code == 403
    assert client.get("/api/admin/overview", headers=admin(GHOST)).status_code == 403


# ---------- genel bakış ve kullanıcı listesi ----------
def test_overview_totals_and_today_cost(env):
    st, _ = env
    today = datetime.now(timezone(timedelta(hours=3))).date().isoformat()
    st.daily = [{"day": today, "action": "summarize", "calls": 2, "units": 40_000, "users": 1},
                {"day": today, "action": "tts", "calls": 3, "units": 9_000, "users": 1},
                {"day": "2000-01-01", "action": "summarize", "calls": 9, "units": 90_000, "users": 2}]
    r = client.get("/api/admin/overview", headers=admin()).json()
    assert r["users"] == 5 and r["documents"] == 5
    assert r["today"]["calls"] == 5 and {a["action"] for a in r["today"]["by_action"]} == {"summarize", "tts"}
    assert r["last_30d"]["calls"] == 14 and r["last_30d"]["est_cost"] > r["today"]["est_cost"] > 0


def test_users_pagination_total_and_wildcard_escaping(env):
    st, _ = env
    r = client.get("/api/admin/users", params={"q": "  50%_\\  ", "page": 2, "page_size": 2}, headers=admin()).json()
    assert st.users_calls == [("50\\%\\_\\\\", 2, 2)]            # %, _, \ etkisizleştirildi; offset=(2-1)*2
    assert r["total"] == 5 and r["page"] == 2 and len(r["items"]) == 2
    assert all("total" not in i for i in r["items"])


@pytest.mark.parametrize("params", [{"page_size": 51}, {"page_size": 0}, {"page": 0}, {"q": "x" * 101}])
def test_users_param_validation(env, params):
    assert client.get("/api/admin/users", params=params, headers=admin()).status_code == 422


# ---------- devre dışı bırakma ----------
def test_deactivate_student_updates_profile_bans_clears_cache_and_audits(env):
    st, calls = env
    ACTIVE_CACHE.set(ST1, True)
    r = client.put(f"/api/admin/users/{ST1}/status", json={"is_active": False}, headers=admin())
    assert r.status_code == 200 and r.json() == {"id": ST1, "is_active": False, "ban_synced": True}
    assert st.profiles[ST1]["is_active"] is False and calls["ban"] == [(ST1, True)]
    assert ACTIVE_CACHE.get(ST1) is None                          # etki ≤30 sn beklemeden başlar
    assert st.audit[-1]["action"] == "kullanici_devre_disi" and st.audit[-1]["target_email"] == "s1@x.com"
    assert st.audit[-1]["admin_id"] == AD1


def test_reactivate_unbans(env):
    st, calls = env
    r = client.put(f"/api/admin/users/{ST3}/status", json={"is_active": True}, headers=admin())
    assert r.status_code == 200 and st.profiles[ST3]["is_active"] is True and calls["ban"] == [(ST3, False)]
    assert st.audit[-1]["action"] == "kullanici_etkinlestir"


def test_status_is_idempotent_without_side_effects(env):
    st, calls = env
    r = client.put(f"/api/admin/users/{ST3}/status", json={"is_active": False}, headers=admin())
    assert r.status_code == 200 and calls["ban"] == [] and st.audit == []


def test_ban_sync_failure_still_deactivates_and_reports_it(env):
    st, calls = env
    calls["fail"].add("ban")
    r = client.put(f"/api/admin/users/{ST1}/status", json={"is_active": False}, headers=admin())
    assert r.status_code == 200 and r.json()["ban_synced"] is False and st.profiles[ST1]["is_active"] is False


def test_cannot_deactivate_self_or_admin_or_unknown(env):
    st, calls = env
    assert client.put(f"/api/admin/users/{AD1}/status", json={"is_active": False}, headers=admin()).status_code == 400
    assert client.put(f"/api/admin/users/{AD2}/status", json={"is_active": False}, headers=admin()).status_code == 409
    assert client.put(f"/api/admin/users/{GHOST}/status", json={"is_active": False}, headers=admin()).status_code == 404
    assert client.put("/api/admin/users/not-a-uuid/status", json={"is_active": False}, headers=admin()).status_code == 404
    assert st.profiles[AD2]["is_active"] is True and calls["ban"] == []


# ---------- rol ----------
def test_promote_student_syncs_auth_and_audits(env):
    st, calls = env
    r = client.put(f"/api/admin/users/{ST1}/role", json={"role": "admin"}, headers=admin())
    assert r.status_code == 200 and st.profiles[ST1]["role"] == "admin" and calls["role"] == [(ST1, "admin")]
    assert st.audit[-1]["action"] == "rol_degistir" and st.audit[-1]["detail"] == {"eski": "student", "yeni": "admin"}


def test_cannot_promote_inactive_user(env):
    st, calls = env
    assert client.put(f"/api/admin/users/{ST3}/role", json={"role": "admin"}, headers=admin()).status_code == 409
    assert st.profiles[ST3]["role"] == "student" and calls["role"] == []


def test_demote_other_admin_ok_but_never_self_or_last_active_admin(env):
    st, calls = env
    assert client.put(f"/api/admin/users/{AD1}/role", json={"role": "student"}, headers=admin()).status_code == 400  # kendisi
    assert client.put(f"/api/admin/users/{AD2}/role", json={"role": "student"}, headers=admin()).status_code == 200  # iki yönetici var
    assert st.profiles[AD2]["role"] == "student" and calls["role"] == [(AD2, "student")]


def test_last_active_admin_guard_blocks_race_between_two_admins(env, monkeypatch):
    """İşlemi yapan zaten etkin yöneticidir, bu yüzden kural normalde tetiklenmez; iki yönetici aynı anda birbirini
    indirmeye çalışırsa (yarış) sayım 1 görünür ve ikinci işlem reddedilmelidir."""
    st, calls = env

    async def one_left():
        return 1
    monkeypatch.setattr(st, "count_active_admins", one_left)
    r = client.put(f"/api/admin/users/{AD2}/role", json={"role": "student"}, headers=admin())
    assert r.status_code == 409 and st.profiles[AD2]["role"] == "admin" and calls["role"] == []


def test_inactive_admin_can_be_demoted_even_when_only_one_active_admin(env):
    st, _ = env
    st.profiles[AD2]["is_active"] = False          # etkin yönetici yalnız AD1
    r = client.put(f"/api/admin/users/{AD2}/role", json={"role": "student"}, headers=admin())
    assert r.status_code == 200 and st.profiles[AD2]["role"] == "student"


def test_role_auth_failure_reverts_profile_and_returns_502(env):
    st, calls = env
    calls["fail"].add("role")
    r = client.put(f"/api/admin/users/{ST1}/role", json={"role": "admin"}, headers=admin())
    assert r.status_code == 502 and st.profiles[ST1]["role"] == "student" and st.audit == []


def test_same_role_is_noop_and_invalid_role_rejected(env):
    st, calls = env
    assert client.put(f"/api/admin/users/{ST1}/role", json={"role": "student"}, headers=admin()).status_code == 200
    assert calls["role"] == [] and st.audit == []
    assert client.put(f"/api/admin/users/{ST1}/role", json={"role": "superuser"}, headers=admin()).status_code == 422


# ---------- silme ----------
def test_delete_student_removes_account_purges_audio_and_keeps_audit_trail(env):
    st, calls = env
    ACTIVE_CACHE.set(ST1, True)
    r = client.delete(f"/api/admin/users/{ST1}", headers=admin())
    assert r.status_code == 204 and calls["delete"] == [ST1] and calls["purge"] == [ST1]
    assert ACTIVE_CACHE.get(ST1) is None
    assert st.audit[-1]["action"] == "kullanici_sil" and st.audit[-1]["target_email"] == "s1@x.com"


def test_cannot_delete_self_or_admin_or_unknown(env):
    st, calls = env
    assert client.delete(f"/api/admin/users/{AD1}", headers=admin()).status_code == 400
    assert client.delete(f"/api/admin/users/{AD2}", headers=admin()).status_code == 409
    assert client.delete(f"/api/admin/users/{GHOST}", headers=admin()).status_code == 404
    assert calls["delete"] == [] and st.audit == []


def test_delete_failure_is_clean_502_without_audit(env):
    st, calls = env
    calls["fail"].add("delete")
    r = client.delete(f"/api/admin/users/{ST1}", headers=admin())
    assert r.status_code == 502 and "auth down" not in r.text and st.audit == [] and calls["purge"] == []


def test_audit_failure_does_not_undo_the_action(env):
    st, calls = env
    st.fail_audit = True
    assert client.delete(f"/api/admin/users/{ST1}", headers=admin()).status_code == 204
    assert calls["delete"] == [ST1]


# ---------- kullanım ve maliyet ----------
def test_usage_costs_match_estimator_and_aggregate(env):
    st, _ = env
    st.daily = [{"day": "2026-10-16", "action": "summarize", "calls": 2, "units": 40_000, "users": 2},
                {"day": "2026-10-17", "action": "summarize", "calls": 1, "units": 10_000, "users": 1},
                {"day": "2026-10-17", "action": "ask", "calls": 4, "units": 24_000, "users": 1}]
    s = get_settings()
    r = client.get("/api/admin/usage", params={"days": 7}, headers=admin()).json()
    want = sum(estimate_cost(x["action"], x["units"], s) for x in st.daily)
    assert r["total_est_cost"] == pytest.approx(want, rel=1e-4)
    assert [d["day"] for d in r["daily"]] == ["2026-10-16", "2026-10-17"]
    assert r["daily"][1]["calls"] == 5
    assert r["by_action"][0]["est_cost"] >= r["by_action"][1]["est_cost"]               # pahalıdan ucuza
    assert {a["action"]: a["calls"] for a in r["by_action"]} == {"summarize": 3, "ask": 4}


@pytest.mark.parametrize("days", [0, 91, -1])
def test_usage_days_validation(env, days):
    assert client.get("/api/admin/usage", params={"days": days}, headers=admin()).status_code == 422


def test_usage_per_user_sorted_by_estimated_cost(env):
    st, _ = env
    st.by_user = [
        {"user_id": ST1, "email": "s1@x.com", "action": "ask", "calls": 50, "units": 50_000},
        {"user_id": ST2, "email": "s2@x.com", "action": "summarize", "calls": 3, "units": 150_000},
        {"user_id": ST2, "email": "s2@x.com", "action": "tts", "calls": 9, "units": 9_000},
    ]
    r = client.get("/api/admin/usage/users", headers=admin()).json()
    assert [i["user_id"] for i in r["items"]] == sorted([ST1, ST2], key=lambda u: -next(i["est_cost"] for i in r["items"] if i["user_id"] == u))
    s2 = next(i for i in r["items"] if i["user_id"] == ST2)
    assert s2["calls"] == 12 and s2["by_action"] == {"summarize": 3, "tts": 9}


# ---------- ayarlar ve denetim kaydı ----------
def test_limits_expose_no_secrets(env, monkeypatch):
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-role-gizli")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-gizli")
    get_settings.cache_clear()
    r = client.get("/api/admin/limits", headers=admin())
    assert r.status_code == 200 and "gizli" not in r.text and "limits" in r.json() and "cost_assumptions" in r.json()


def test_audit_lists_latest_first(env):
    st, _ = env
    client.put(f"/api/admin/users/{ST1}/status", json={"is_active": False}, headers=admin())
    client.put(f"/api/admin/users/{ST3}/status", json={"is_active": True}, headers=admin())
    r = client.get("/api/admin/audit", headers=admin()).json()
    assert [a["action"] for a in r] == ["kullanici_etkinlestir", "kullanici_devre_disi"]
