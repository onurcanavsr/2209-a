"""Zorunlu kimlik doğrulama: geçerli Supabase JWT'si olmayan istek reddedilir."""
from dataclasses import dataclass

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import Settings, get_settings

bearer = HTTPBearer(auto_error=False)
_jwks_client: jwt.PyJWKClient | None = None


@dataclass
class CurrentUser:
    id: str
    email: str | None
    role: str  # "student" | "admin"


def _unauthorized(detail: str = "Giriş yapmanız gerekiyor") -> HTTPException:
    return HTTPException(
        status.HTTP_401_UNAUTHORIZED, detail, headers={"WWW-Authenticate": "Bearer"}
    )


def _decode(token: str, s: Settings) -> dict:
    global _jwks_client
    if s.supabase_jwt_secret:  # eski HS256 projeler
        return jwt.decode(
            token, s.supabase_jwt_secret, algorithms=["HS256"], audience="authenticated"
        )
    if not s.supabase_url:
        raise jwt.InvalidTokenError("Sunucu yapılandırılmamış")
    if _jwks_client is None:  # yeni asimetrik anahtarlar
        _jwks_client = jwt.PyJWKClient(f"{s.supabase_url}/auth/v1/.well-known/jwks.json")
    key = _jwks_client.get_signing_key_from_jwt(token).key
    return jwt.decode(
        token, key, algorithms=["RS256", "ES256"], audience="authenticated"
    )


def get_current_user(
    cred: HTTPAuthorizationCredentials | None = Depends(bearer),
    s: Settings = Depends(get_settings),
) -> CurrentUser:
    if cred is None:
        raise _unauthorized()
    try:
        claims = _decode(cred.credentials, s)
    except jwt.PyJWTError:
        raise _unauthorized("Oturum geçersiz veya süresi dolmuş")
    # Rol, kullanıcının değiştiremeyeceği app_metadata içinden okunur
    role = (claims.get("app_metadata") or {}).get("role", "student")
    return CurrentUser(id=claims["sub"], email=claims.get("email"), role=role)


def require_admin(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Bu işlem için yetkiniz yok")
    return user
