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
    session = client.get("/api/auth/session")
    assert session.status_code == 200 and session.json() == {"user": None}
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


def test_registration_requests_require_admin_approval_before_login(settings, tmp_path):
    admin = make_client(settings, tmp_path)
    registered_email = "new.member@example.test"
    registered_password = "registered-password-123"
    request = admin.post("/api/auth/register", json={
        "email": registered_email,
        "password": registered_password,
    })
    assert request.status_code == 202
    assert "administrator must approve" in request.json()["message"].lower()
    assert admin.post("/api/auth/login", json={
        "email": registered_email,
        "password": registered_password,
    }).status_code == 401
    assert admin.post("/api/auth/register", json={
        "email": registered_email.upper(),
        "password": registered_password,
    }).status_code == 400

    assert admin.post("/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD,
    }).status_code == 200
    requests = admin.get("/api/admin/registration-requests")
    assert requests.status_code == 200
    assert len(requests.json()["requests"]) == 1
    request_id = requests.json()["requests"][0]["id"]

    member = make_client(settings, tmp_path)
    assert member.post(f"/api/admin/registration-requests/{request_id}/approve").status_code == 401
    approved = admin.post(f"/api/admin/registration-requests/{request_id}/approve")
    assert approved.status_code == 200
    assert approved.json()["user"]["email"] == registered_email
    assert approved.json()["user"]["role"] == "user"
    assert "password_hash" not in approved.text
    assert admin.get("/api/admin/registration-requests").json()["requests"] == []
    assert member.post("/api/auth/login", json={
        "email": registered_email,
        "password": registered_password,
    }).status_code == 200
    assert member.get("/api/status").status_code == 200


def test_registration_request_can_be_declined(settings, tmp_path):
    admin = make_client(settings, tmp_path)
    request = admin.post("/api/auth/register", json={
        "email": "declined@example.test",
        "password": "declined-password-123",
    })
    assert request.status_code == 202
    admin.post("/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    request_id = admin.get("/api/admin/registration-requests").json()["requests"][0]["id"]
    assert admin.delete(f"/api/admin/registration-requests/{request_id}").status_code == 200
    assert admin.get("/api/admin/registration-requests").json()["requests"] == []
    assert admin.post("/api/auth/login", json={
        "email": "declined@example.test",
        "password": "declined-password-123",
    }).status_code == 401
