import pytest

from fastapi.testclient import TestClient

from conftest import with_settings
from petrovision_api.main import create_app

ADMIN_EMAIL = "captain@example.test"
ADMIN_PASSWORD = "secure-admin-test-password"


def make_client(settings, tmp_path, *, configured=True):
    config = with_settings(
        settings,
        auth_db_path=tmp_path / "users.sqlite3",
        bootstrap_admin_email=ADMIN_EMAIL if configured else "",
        bootstrap_admin_password=ADMIN_PASSWORD if configured else "",
        auth_cookie_secure=False,
    )
    return TestClient(create_app(config))


def test_api_requires_a_valid_session_and_sets_http_only_cookie(settings, tmp_path):
    client = make_client(settings, tmp_path)
    assert client.get("/api/status").status_code == 401
    assert client.get("/api/admin/users").status_code == 401

    response = client.post("/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert response.status_code == 200
    assert response.json()["user"]["role"] == "admin"
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=strict" in cookie
    assert "password" not in response.text and client.get("/api/status").status_code == 200


def test_admin_can_create_and_revoke_a_user_and_revocation_expires_sessions(settings, tmp_path):
    admin = make_client(settings, tmp_path)
    assert admin.post("/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}).status_code == 200
    created = admin.post("/api/admin/users", json={
        "email": "researcher@example.test",
        "password": "initial-password-123",
        "role": "user",
    })
    assert created.status_code == 201
    user_id = created.json()["user"]["id"]
    assert "password_hash" not in created.text

    member = make_client(settings, tmp_path)
    assert member.post("/api/auth/login", json={
        "email": "researcher@example.test",
        "password": "initial-password-123",
    }).status_code == 200
    assert member.get("/api/status").status_code == 200
    assert member.get("/api/admin/users").status_code == 403

    revoked = admin.patch(f"/api/admin/users/{user_id}", json={"active": False})
    assert revoked.status_code == 200 and revoked.json()["user"]["is_active"] is False
    assert member.get("/api/status").status_code == 401
    assert member.post("/api/auth/login", json={
        "email": "researcher@example.test",
        "password": "initial-password-123",
    }).status_code == 401

    restored = admin.patch(f"/api/admin/users/{user_id}", json={"active": True})
    assert restored.status_code == 200 and restored.json()["user"]["is_active"] is True


def test_admin_account_validation_and_last_admin_protection(settings, tmp_path):
    client = make_client(settings, tmp_path)
    client.post("/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert client.post("/api/admin/users", json={
        "email": ADMIN_EMAIL, "password": "another-password-123", "role": "user",
    }).status_code == 400
    assert client.post("/api/admin/users", json={
        "email": "short@example.test", "password": "short", "role": "user",
    }).status_code == 422

    admin = client.get("/api/auth/session").json()["user"]
    assert client.patch(f"/api/admin/users/{admin['id']}", json={"active": False}).status_code == 400
    store = client.app.state.auth_store
    with pytest.raises(ValueError, match="last active administrator"):
        store.set_active(admin["id"], False)
    second_admin = client.post("/api/admin/users", json={
        "email": "second-admin@example.test",
        "password": "another-secure-password",
        "role": "admin",
    }).json()["user"]
    store.set_active(admin["id"], False)
    with pytest.raises(ValueError, match="last active administrator"):
        store.set_active(second_admin["id"], False)


def test_login_explains_missing_admin_bootstrap_configuration(settings, tmp_path):
    client = make_client(settings, tmp_path, configured=False)
    response = client.post("/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert response.status_code == 503
    assert "PETROVISION_ADMIN_EMAIL" in response.json()["detail"]
