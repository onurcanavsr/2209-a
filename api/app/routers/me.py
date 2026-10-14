from fastapi import APIRouter, Depends

from ..auth import CurrentUser, get_current_user, require_admin

router = APIRouter(prefix="/api", tags=["kullanıcı"])


@router.get("/me")
def me(user: CurrentUser = Depends(get_current_user)):
    return {"id": user.id, "email": user.email, "role": user.role}


@router.get("/admin/ping")
def admin_ping(user: CurrentUser = Depends(require_admin)):
    return {"ok": True}
