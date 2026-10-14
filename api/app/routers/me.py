import logging

from fastapi import APIRouter, Depends, HTTPException, Response, status

from ..auth import CurrentUser, get_current_user, require_admin
from ..supabase_admin import delete_auth_user

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["kullanıcı"])


@router.get("/me")
def me(user: CurrentUser = Depends(get_current_user)):
    return {"id": user.id, "email": user.email, "role": user.role}


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_me(user: CurrentUser = Depends(get_current_user)):
    """KVKK: kullanıcı kendi hesabını ve tüm verilerini siler."""
    if user.role == "admin":
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Yönetici hesabı buradan silinemez. Önce yönetici rolünü kaldırın.",
        )
    try:
        await delete_auth_user(user.id)
    except Exception:
        log.exception("Hesap silme başarısız (kullanıcı %s)", user.id)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, "Hesap şu anda silinemedi, lütfen tekrar deneyin."
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/admin/ping")
def admin_ping(user: CurrentUser = Depends(require_admin)):
    return {"ok": True}
