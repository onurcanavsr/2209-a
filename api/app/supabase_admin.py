"""Yönetici (service role) işlemleri: yalnızca sunucuda çalışır."""
import httpx

from .config import get_settings


async def delete_auth_user(user_id: str) -> None:
    """Kullanıcıyı Supabase Auth'tan siler. profiles/documents/... kayıtları
    'on delete cascade' ile birlikte silinir."""
    s = get_settings()
    if not s.supabase_url or not s.supabase_service_role_key:
        raise RuntimeError("Supabase yönetici anahtarı yapılandırılmamış")
    key = s.supabase_service_role_key
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.delete(
            f"{s.supabase_url}/auth/v1/admin/users/{user_id}",
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
        )
    if r.status_code not in (200, 204):
        raise RuntimeError(f"Kullanıcı silinemedi: {r.status_code}")


async def _update_auth_user(user_id: str, payload: dict) -> None:
    s = get_settings()
    if not s.supabase_url or not s.supabase_service_role_key:
        raise RuntimeError("Supabase yönetici anahtarı yapılandırılmamış")
    key = s.supabase_service_role_key
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.put(
            f"{s.supabase_url}/auth/v1/admin/users/{user_id}", json=payload,
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
        )
    if r.status_code != 200:
        raise RuntimeError(f"Kullanıcı güncellenemedi: {r.status_code}")


async def set_user_ban(user_id: str, banned: bool) -> None:
    """Devre dışı hesap yeni oturum açamaz ve jetonunu yenileyemez (mevcut jeton süresi dolana kadar
    API tarafında active_guard ile engellenir)."""
    await _update_auth_user(user_id, {"ban_duration": "876000h" if banned else "none"})


async def set_user_role(user_id: str, role: str) -> None:
    """Rolü app_metadata'ya yazar (kullanıcının değiştiremeyeceği yer). Etkisi, kullanıcının
    jetonunu yenilemesiyle başlar; bu yüzden API ayrıca profiles.role'ü canlı doğrular."""
    await _update_auth_user(user_id, {"app_metadata": {"role": role}})

