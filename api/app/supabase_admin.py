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
