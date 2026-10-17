"""Faz 6: yönetim paneli (kullanıcılar, kullanım, tahmini maliyet, denetim kaydı).

Güvenlik: her uç nokta require_admin (JWT rolü) VE canlı profil doğrulaması ister; böylece yetkisi alınan yönetici
jetonu bitene kadar işlem yapamaz. Yönetici kendi hesabına ve diğer yöneticilere zarar verecek işlem yapamaz."""
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel

from .. import audio_cache
from ..active_guard import ACTIVE_CACHE
from ..auth import CurrentUser, require_admin
from ..config import get_settings
from ..costs import estimate_cost
from ..store import get_store
from ..supabase_admin import delete_auth_user, set_user_ban, set_user_role

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["yönetim"])

TR = timezone(timedelta(hours=3))   # Türkiye 2016'dan beri sabit UTC+3
MAX_Q = 100
MAX_PAGE_SIZE = 50


async def admin_user(user: CurrentUser = Depends(require_admin), store=Depends(get_store)) -> CurrentUser:
    p = await store.get_profile(user.id)
    if not p or p.get("role") != "admin" or not p.get("is_active", True):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Bu işlem için yetkiniz yok")
    return user


def _uuid(value: str) -> str:
    try:
        return str(uuid.UUID(value))
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kullanıcı bulunamadı")


def _tr_midnight(days_ago: int = 0) -> datetime:
    now = datetime.now(TR)
    return now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=days_ago)


async def _audit(store, admin: CurrentUser, action: str, target: dict | None = None, detail: dict | None = None):
    try:
        await store.add_audit({"admin_id": admin.id, "admin_email": admin.email, "action": action,
                               "target_id": target["id"] if target else None,
                               "target_email": target.get("email") if target else None, "detail": detail or {}})
    except Exception:
        log.exception("Denetim kaydı yazılamadı (%s)", action)   # işlem başarılıysa kayıt hatası onu geri almaz


async def _target(store, admin: CurrentUser, user_id: str) -> dict:
    uid = _uuid(user_id)
    t = await store.get_profile(uid)
    if not t:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kullanıcı bulunamadı")
    if uid == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Kendi hesabınız üzerinde bu işlemi yapamazsınız.")
    return t


def _priced(rows: list[dict], s) -> list[dict]:
    return [{**r, "est_cost": round(estimate_cost(r["action"], r["units"], s), 6)} for r in rows]


def _by_action(rows: list[dict]) -> list[dict]:
    acc: dict[str, dict] = {}
    for r in rows:
        a = acc.setdefault(r["action"], {"action": r["action"], "calls": 0, "units": 0, "est_cost": 0.0})
        a["calls"] += r["calls"]; a["units"] += r["units"]; a["est_cost"] += r["est_cost"]
    return sorted(({**a, "est_cost": round(a["est_cost"], 6)} for a in acc.values()), key=lambda a: -a["est_cost"])


# ---------------- genel bakış ----------------
@router.get("/overview")
async def overview(admin: CurrentUser = Depends(admin_user), store=Depends(get_store)):
    s = get_settings()
    ov = await store.admin_overview()
    start30 = _tr_midnight(29)
    rows = _priced(await store.usage_daily(start30, _tr_midnight(-1)), s)
    today = _tr_midnight().date().isoformat()
    today_rows = [r for r in rows if str(r["day"]) == today]
    return {**ov,
            "today": {"by_action": _by_action(today_rows), "est_cost": round(sum(r["est_cost"] for r in today_rows), 6),
                      "calls": sum(r["calls"] for r in today_rows)},
            "last_30d": {"est_cost": round(sum(r["est_cost"] for r in rows), 6), "calls": sum(r["calls"] for r in rows)}}


# ---------------- kullanıcılar ----------------
@router.get("/users")
async def users(q: str = Query("", max_length=MAX_Q), page: int = Query(1, ge=1, le=10_000),
                page_size: int = Query(20, ge=1, le=MAX_PAGE_SIZE),
                admin: CurrentUser = Depends(admin_user), store=Depends(get_store)):
    # ILIKE joker karakterleri kullanıcı girdisinde etkisiz kılınır
    safe = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    rows = await store.admin_users(safe, page_size, (page - 1) * page_size)
    total = rows[0]["total"] if rows else 0
    items = [{k: v for k, v in r.items() if k != "total"} for r in rows]
    return {"items": items, "total": total, "page": page, "page_size": page_size}


class StatusIn(BaseModel):
    is_active: bool


class RoleIn(BaseModel):
    role: Literal["student", "admin"]


@router.put("/users/{user_id}/status")
async def set_status(user_id: str, body: StatusIn, admin: CurrentUser = Depends(admin_user), store=Depends(get_store)):
    t = await _target(store, admin, user_id)
    if t["role"] == "admin" and not body.is_active:
        raise HTTPException(status.HTTP_409_CONFLICT, "Yönetici hesabı devre dışı bırakılamaz. Önce yönetici rolünü kaldırın.")
    if t["is_active"] == body.is_active:
        return {"id": t["id"], "is_active": t["is_active"], "ban_synced": True}
    await store.set_profile(t["id"], {"is_active": body.is_active})   # uygulama kararı buradan; ban yalnızca ek önlem
    ACTIVE_CACHE.invalidate(t["id"])
    ban_ok = True
    try:
        await set_user_ban(t["id"], banned=not body.is_active)
    except Exception:
        ban_ok = False
        log.exception("Supabase yasaklama senkronu başarısız (%s)", t["id"])   # API her durumda erişimi keser
    await _audit(store, admin, "kullanici_etkinlestir" if body.is_active else "kullanici_devre_disi", t)
    return {"id": t["id"], "is_active": body.is_active, "ban_synced": ban_ok}


@router.put("/users/{user_id}/role")
async def set_role(user_id: str, body: RoleIn, admin: CurrentUser = Depends(admin_user), store=Depends(get_store)):
    t = await _target(store, admin, user_id)
    if t["role"] == body.role:
        return {"id": t["id"], "role": t["role"]}
    if body.role == "admin" and not t["is_active"]:
        raise HTTPException(status.HTTP_409_CONFLICT, "Devre dışı hesap yönetici yapılamaz. Önce hesabı etkinleştirin.")
    if body.role == "student" and t["is_active"] and await store.count_active_admins() <= 1:
        raise HTTPException(status.HTTP_409_CONFLICT, "Son yöneticinin rolü kaldırılamaz.")
    old = t["role"]
    await store.set_profile(t["id"], {"role": body.role})
    try:
        await set_user_role(t["id"], body.role)
    except Exception:
        log.exception("Rol senkronu başarısız (%s)", t["id"])
        await store.set_profile(t["id"], {"role": old})            # tutarsız kalmasın
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Rol şu anda değiştirilemedi, lütfen tekrar deneyin.")
    await _audit(store, admin, "rol_degistir", t, {"eski": old, "yeni": body.role})
    return {"id": t["id"], "role": body.role}


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(user_id: str, admin: CurrentUser = Depends(admin_user), store=Depends(get_store)):
    t = await _target(store, admin, user_id)
    if t["role"] == "admin":
        raise HTTPException(status.HTTP_409_CONFLICT, "Yönetici hesabı silinemez. Önce yönetici rolünü kaldırın.")
    try:
        await delete_auth_user(t["id"])   # belgeler, özetler, testler... 'on delete cascade' ile silinir
    except Exception:
        log.exception("Yönetici hesap silme başarısız (%s)", t["id"])
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Hesap şu anda silinemedi, lütfen tekrar deneyin.")
    try:
        audio_cache.purge_user(t["id"])
    except Exception:
        log.exception("Ses dosyaları silinemedi (%s)", t["id"])
    ACTIVE_CACHE.invalidate(t["id"])
    await _audit(store, admin, "kullanici_sil", t)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------- kullanım ve tahmini maliyet ----------------
@router.get("/usage")
async def usage(days: int = Query(30, ge=1, le=90), admin: CurrentUser = Depends(admin_user), store=Depends(get_store)):
    s = get_settings()
    rows = _priced(await store.usage_daily(_tr_midnight(days - 1), _tr_midnight(-1)), s)
    daily: dict[str, dict] = {}
    for r in rows:
        d = daily.setdefault(str(r["day"]), {"day": str(r["day"]), "calls": 0, "est_cost": 0.0})
        d["calls"] += r["calls"]; d["est_cost"] += r["est_cost"]
    return {"days": days,
            "rows": [{**r, "day": str(r["day"])} for r in rows],
            "daily": [{**d, "est_cost": round(d["est_cost"], 6)} for d in sorted(daily.values(), key=lambda d: d["day"])],
            "by_action": _by_action(rows),
            "total_est_cost": round(sum(r["est_cost"] for r in rows), 6)}


@router.get("/usage/users")
async def usage_users(days: int = Query(30, ge=1, le=90), limit: int = Query(50, ge=1, le=200),
                      admin: CurrentUser = Depends(admin_user), store=Depends(get_store)):
    s = get_settings()
    rows = await store.usage_by_user(_tr_midnight(days - 1), _tr_midnight(-1), limit)
    per: dict[str, dict] = {}
    for r in rows:
        u = per.setdefault(r["user_id"], {"user_id": r["user_id"], "email": r.get("email"), "calls": 0,
                                         "est_cost": 0.0, "by_action": {}})
        cost = estimate_cost(r["action"], r["units"], s)
        u["calls"] += r["calls"]; u["est_cost"] += cost
        u["by_action"][r["action"]] = r["calls"]
    items = sorted(per.values(), key=lambda u: -u["est_cost"])
    return {"days": days, "items": [{**u, "est_cost": round(u["est_cost"], 6)} for u in items]}


# ---------------- ayarlar (salt okunur) ve denetim kaydı ----------------
@router.get("/limits")
async def limits(admin: CurrentUser = Depends(admin_user)):
    """Etkin sınırlar ve maliyet varsayımları (.env'den). Değiştirmek için ortam değişkenini güncelleyip API'yi yeniden başlatın."""
    s = get_settings()
    return {
        "limits": {"max_upload_mb": s.max_upload_mb, "daily_uploads": s.daily_limit_per_user,
                   "daily_summaries": s.daily_summary_limit, "daily_questions": s.daily_qa_limit,
                   "daily_quizzes": s.daily_quiz_limit, "daily_tts_chars": s.daily_tts_chars},
        "models": {"main": s.llm_model, "fast": s.llm_model_fast, "tts_provider": s.tts_provider},
        "cost_assumptions": {
            "llm_main_usd_per_mtok": [s.cost_llm_main_in_per_mtok, s.cost_llm_main_out_per_mtok],
            "llm_fast_usd_per_mtok": [s.cost_llm_fast_in_per_mtok, s.cost_llm_fast_out_per_mtok],
            "tts_usd_per_mchar": s.cost_tts_per_mchar, "chars_per_token": s.cost_chars_per_token},
    }


@router.get("/audit")
async def audit(limit: int = Query(50, ge=1, le=200), admin: CurrentUser = Depends(admin_user), store=Depends(get_store)):
    return await store.list_audit(limit)
