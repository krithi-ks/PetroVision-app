"""Persistent user accounts and opaque, revocable browser sessions."""

from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
import sqlite3
import threading
import time
import uuid
from pathlib import Path

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
SESSION_TTL_SECONDS = 12 * 60 * 60
PASSWORD_MIN_LENGTH = 8
_DUMMY_SALT = b"petrovision-login-timing"
_DUMMY_HASH = hashlib.scrypt(b"not-a-password", salt=_DUMMY_SALT, n=2**14, r=8, p=1, dklen=64)


def validate_password(password: str) -> None:
    if len(password) < PASSWORD_MIN_LENGTH:
        raise ValueError(f"Password must contain at least {PASSWORD_MIN_LENGTH} characters.")
    if not any(char.islower() for char in password):
        raise ValueError("Password must contain a lowercase letter.")
    if not any(char.isupper() for char in password):
        raise ValueError("Password must contain an uppercase letter.")
    if not any(char.isdigit() for char in password):
        raise ValueError("Password must contain a number.")
    if not any(not (char.isascii() and char.isalnum()) for char in password):
        raise ValueError("Password must contain a special character.")


class AuthStore:
    def __init__(self, path: Path, admin_email: str = "", admin_password: str = ""):
        self.path = path
        self.admin_email = admin_email.strip().lower()
        self.admin_password = admin_password
        self._init_lock = threading.Lock()
        self._initialized = False

    def _connect(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def _initialize(self):
        if self._initialized:
            return
        with self._init_lock:
            if self._initialized:
                return
            with self._connect() as db:
                db.executescript(
                    """
                    CREATE TABLE IF NOT EXISTS users (
                        id TEXT PRIMARY KEY,
                        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                        password_hash TEXT NOT NULL,
                        role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
                        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
                        created_at INTEGER NOT NULL
                    );
                    CREATE TABLE IF NOT EXISTS sessions (
                        token_hash TEXT PRIMARY KEY,
                        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                        expires_at INTEGER NOT NULL
                    );
                    CREATE INDEX IF NOT EXISTS sessions_user_id ON sessions(user_id);
                    CREATE TABLE IF NOT EXISTS registration_requests (
                        id TEXT PRIMARY KEY,
                        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                        password_hash TEXT NOT NULL,
                        requested_at INTEGER NOT NULL
                    );
                    """
                )
                has_users = db.execute("SELECT 1 FROM users LIMIT 1").fetchone() is not None
                if not has_users:
                    if bool(self.admin_email) != bool(self.admin_password):
                        raise RuntimeError("Set both PETROVISION_ADMIN_EMAIL and PETROVISION_ADMIN_PASSWORD to bootstrap the first admin.")
                    if self.admin_email and (not EMAIL_RE.fullmatch(self.admin_email) or len(self.admin_email) > 254):
                        raise RuntimeError("PETROVISION_ADMIN_EMAIL must be a valid email address.")
                    if self.admin_password:
                        try:
                            validate_password(self.admin_password)
                        except ValueError as exc:
                            raise RuntimeError(f"PETROVISION_ADMIN_PASSWORD is invalid: {exc}") from exc
                if not has_users and self.admin_email:
                    db.execute(
                        """INSERT OR IGNORE INTO users (id, email, password_hash, role, created_at)
                           VALUES (?, ?, ?, 'admin', ?)""",
                        (uuid.uuid4().hex, self.admin_email, self._hash_password(self.admin_password), int(time.time())),
                    )
            self._initialized = True

    @staticmethod
    def _hash_password(password: str) -> str:
        salt = secrets.token_bytes(16)
        digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=64)
        return f"scrypt${salt.hex()}${digest.hex()}"

    @staticmethod
    def _verify_password(password: str, encoded: str | None) -> bool:
        valid_hash = False
        if encoded:
            try:
                algorithm, salt_hex, digest_hex = encoded.split("$")
                if algorithm != "scrypt":
                    raise ValueError("Unknown password hash")
                salt, expected = bytes.fromhex(salt_hex), bytes.fromhex(digest_hex)
                valid_hash = True
            except ValueError:
                salt, expected = _DUMMY_SALT, _DUMMY_HASH
        else:
            salt, expected = _DUMMY_SALT, _DUMMY_HASH
        actual = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=64)
        return valid_hash and hmac.compare_digest(actual, expected)

    @staticmethod
    def _public_user(row):
        return {
            "id": row["id"],
            "email": row["email"],
            "role": row["role"],
            "is_active": bool(row["is_active"]),
            "created_at": row["created_at"],
        }

    def authenticate(self, email: str, password: str):
        self._initialize()
        normalized = email.strip().lower()
        with self._connect() as db:
            row = db.execute("SELECT * FROM users WHERE email = ?", (normalized,)).fetchone()
            if row is None and db.execute("SELECT 1 FROM users LIMIT 1").fetchone() is None:
                raise RuntimeError(
                    "No administrator account exists. Set PETROVISION_ADMIN_EMAIL and "
                    "PETROVISION_ADMIN_PASSWORD on the server to create the first admin."
                )
        if not self._verify_password(password, row["password_hash"] if row else None):
            return None
        if not row["is_active"]:
            return None
        return self._public_user(row)

    def create_session(self, user_id: str):
        self._initialize()
        token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(token.encode("ascii")).hexdigest()
        with self._connect() as db:
            db.execute(
                "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
                (token_hash, user_id, int(time.time()) + SESSION_TTL_SECONDS),
            )
        return token

    def session_user(self, token: str | None):
        self._initialize()
        if not token:
            return None
        token_hash = hashlib.sha256(token.encode("ascii", errors="ignore")).hexdigest()
        now = int(time.time())
        with self._connect() as db:
            row = db.execute(
                """SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
                   WHERE s.token_hash = ? AND s.expires_at > ? AND u.is_active = 1""",
                (token_hash, now),
            ).fetchone()
            db.execute("DELETE FROM sessions WHERE expires_at <= ?", (now,))
        return self._public_user(row) if row else None

    def revoke_session(self, token: str | None):
        self._initialize()
        if not token:
            return
        token_hash = hashlib.sha256(token.encode("ascii", errors="ignore")).hexdigest()
        with self._connect() as db:
            db.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))

    def list_users(self):
        self._initialize()
        with self._connect() as db:
            rows = db.execute("SELECT * FROM users ORDER BY created_at DESC, email COLLATE NOCASE").fetchall()
        return [self._public_user(row) for row in rows]

    def request_registration(self, email: str, password: str):
        self._initialize()
        normalized = email.strip().lower()
        if len(normalized) > 254 or not EMAIL_RE.fullmatch(normalized):
            raise ValueError("Enter a valid email address.")
        validate_password(password)
        request_id = uuid.uuid4().hex
        requested_at = int(time.time())
        with self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            if db.execute("SELECT 1 FROM users WHERE role = 'admin' AND is_active = 1 LIMIT 1").fetchone() is None:
                raise RuntimeError("Registration is unavailable because no active administrator is configured.")
            exists = db.execute(
                "SELECT 1 FROM users WHERE email = ? UNION SELECT 1 FROM registration_requests WHERE email = ?",
                (normalized, normalized),
            ).fetchone()
            if exists:
                raise ValueError("An account or registration request with this email already exists.")
            db.execute(
                """INSERT INTO registration_requests (id, email, password_hash, requested_at)
                   VALUES (?, ?, ?, ?)""",
                (request_id, normalized, self._hash_password(password), requested_at),
            )
        return {"id": request_id, "email": normalized, "requested_at": requested_at}

    def list_registration_requests(self):
        self._initialize()
        with self._connect() as db:
            rows = db.execute(
                "SELECT id, email, requested_at FROM registration_requests ORDER BY requested_at DESC, email COLLATE NOCASE"
            ).fetchall()
        return [dict(row) for row in rows]

    def approve_registration(self, request_id: str):
        self._initialize()
        with self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            request = db.execute(
                "SELECT * FROM registration_requests WHERE id = ?", (request_id,)
            ).fetchone()
            if request is None:
                return None
            if db.execute("SELECT 1 FROM users WHERE email = ?", (request["email"],)).fetchone():
                raise ValueError("An account with this email already exists.")
            user_id = uuid.uuid4().hex
            db.execute(
                """INSERT INTO users (id, email, password_hash, role, created_at)
                   VALUES (?, ?, ?, 'user', ?)""",
                (user_id, request["email"], request["password_hash"], request["requested_at"]),
            )
            db.execute("DELETE FROM registration_requests WHERE id = ?", (request_id,))
            row = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return self._public_user(row)

    def reject_registration(self, request_id: str):
        self._initialize()
        with self._connect() as db:
            cursor = db.execute("DELETE FROM registration_requests WHERE id = ?", (request_id,))
            return cursor.rowcount > 0

    def add_user(self, email: str, password: str, role: str):
        self._initialize()
        normalized = email.strip().lower()
        if len(normalized) > 254 or not EMAIL_RE.fullmatch(normalized):
            raise ValueError("Enter a valid email address.")
        validate_password(password)
        if role not in {"user", "admin"}:
            raise ValueError("Role must be user or admin.")
        user_id = uuid.uuid4().hex
        try:
            with self._connect() as db:
                db.execute(
                    """INSERT INTO users (id, email, password_hash, role, created_at)
                       VALUES (?, ?, ?, ?, ?)""",
                    (user_id, normalized, self._hash_password(password), role, int(time.time())),
                )
                row = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        except sqlite3.IntegrityError as exc:
            raise ValueError("An account with this email already exists.") from exc
        return self._public_user(row)

    def set_active(self, user_id: str, active: bool):
        self._initialize()
        with self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
            if row is None:
                return None
            if not active and row["role"] == "admin" and row["is_active"]:
                admins = db.execute(
                    "SELECT COUNT(*) FROM users WHERE role = 'admin' AND is_active = 1"
                ).fetchone()[0]
                if admins <= 1:
                    raise ValueError("The last active administrator cannot be deactivated.")
            db.execute("UPDATE users SET is_active = ? WHERE id = ?", (int(active), user_id))
            if not active:
                db.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
            row = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return self._public_user(row)
