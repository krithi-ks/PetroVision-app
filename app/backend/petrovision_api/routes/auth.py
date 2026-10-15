"""Login, session, and administrator-only account management endpoints."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from ..auth_store import AuthStore, PASSWORD_MIN_LENGTH, SESSION_TTL_SECONDS

router = APIRouter(prefix="/api")
SESSION_COOKIE = "petrovision_session"


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=1024)


class CreateUserRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=PASSWORD_MIN_LENGTH, max_length=1024)
    role: Literal["user", "admin"] = "user"


class RegistrationRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=PASSWORD_MIN_LENGTH, max_length=1024)


class AccessRequest(BaseModel):
    active: bool


def _store(request: Request) -> AuthStore:
    return request.app.state.auth_store


def _session_user(request: Request):
    try:
        return _store(request).session_user(request.cookies.get(SESSION_COOKIE))
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def require_user(request: Request):
    user = _session_user(request)
    if user is None:
        raise HTTPException(status_code=401, detail="Sign in to continue.")
    return user


def require_admin(user=Depends(require_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Administrator access is required.")
    return user


@router.post("/auth/login")
def login(payload: LoginRequest, request: Request, response: Response):
    try:
        store = _store(request)
        user = store.authenticate(payload.email, payload.password)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if user is None:
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")
    response.set_cookie(
        SESSION_COOKIE,
        store.create_session(user["id"]),
        max_age=SESSION_TTL_SECONDS,
        httponly=True,
        secure=request.app.state.settings.auth_cookie_secure,
        samesite="strict",
        path="/",
    )
    return {"user": user}


@router.get("/auth/session")
def current_session(request: Request):
    return {"user": _session_user(request)}


@router.post("/auth/register", status_code=202)
def register(payload: RegistrationRequest, request: Request):
    try:
        registration = _store(request).request_registration(payload.email, payload.password)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "message": "Registration submitted. An administrator must approve your access before you can sign in.",
        "requested_at": registration["requested_at"],
    }


@router.post("/auth/logout")
def logout(request: Request, response: Response):
    try:
        _store(request).revoke_session(request.cookies.get(SESSION_COOKIE))
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    response.delete_cookie(SESSION_COOKIE, httponly=True, secure=request.app.state.settings.auth_cookie_secure, samesite="strict", path="/")
    return {"ok": True}


@router.get("/admin/users")
def list_users(request: Request, _admin=Depends(require_admin)):
    try:
        return {"users": _store(request).list_users()}
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/admin/registration-requests")
def list_registration_requests(request: Request, _admin=Depends(require_admin)):
    try:
        return {"requests": _store(request).list_registration_requests()}
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/admin/registration-requests/{request_id}/approve")
def approve_registration(request_id: str, request: Request, _admin=Depends(require_admin)):
    try:
        user = _store(request).approve_registration(request_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if user is None:
        raise HTTPException(status_code=404, detail="Registration request not found.")
    return {"user": user}


@router.delete("/admin/registration-requests/{request_id}")
def reject_registration(request_id: str, request: Request, _admin=Depends(require_admin)):
    try:
        deleted = _store(request).reject_registration(request_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if not deleted:
        raise HTTPException(status_code=404, detail="Registration request not found.")
    return {"deleted": request_id}


@router.post("/admin/users", status_code=201)
def add_user(payload: CreateUserRequest, request: Request, _admin=Depends(require_admin)):
    try:
        user = _store(request).add_user(payload.email, payload.password, payload.role)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"user": user}


@router.patch("/admin/users/{user_id}")
def set_user_access(user_id: str, payload: AccessRequest, request: Request, admin=Depends(require_admin)):
    if user_id == admin["id"] and not payload.active:
        raise HTTPException(status_code=400, detail="You cannot remove your own access.")
    try:
        user = _store(request).set_active(user_id, payload.active)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    return {"user": user}
