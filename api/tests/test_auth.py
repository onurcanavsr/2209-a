"""Başarı ölçütü: girişsiz hiçbir korumalı uç nokta açılamaz."""
import time

import jwt
import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app

SECRET = "x" * 40


@pytest.fixture(autouse=True)
def _secret(monkeypatch):
    monkeypatch.setenv("SUPABASE_JWT_SECRET", SECRET)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


client = TestClient(app)


def token(role=None, exp_delta=3600):
    claims = {"sub": "u1", "email": "a@b.com", "aud": "authenticated",
              "exp": int(time.time()) + exp_delta}
    if role:
        claims["app_metadata"] = {"role": role}
    return jwt.encode(claims, SECRET, algorithm="HS256")


def auth(t):
    return {"Authorization": f"Bearer {t}"}


def test_health_is_public():
    assert client.get("/health").status_code == 200


@pytest.mark.parametrize("path", ["/api/me", "/api/admin/ping"])
def test_no_token_rejected(path):
    assert client.get(path).status_code == 401


def test_garbage_token_rejected():
    assert client.get("/api/me", headers=auth("abc")).status_code == 401


def test_expired_token_rejected():
    assert client.get("/api/me", headers=auth(token(exp_delta=-10))).status_code == 401


def test_valid_student():
    r = client.get("/api/me", headers=auth(token()))
    assert r.status_code == 200 and r.json()["role"] == "student"


def test_student_cannot_reach_admin():
    assert client.get("/api/admin/ping", headers=auth(token())).status_code == 403


def test_admin_allowed():
    assert client.get("/api/admin/ping", headers=auth(token("admin"))).status_code == 200
