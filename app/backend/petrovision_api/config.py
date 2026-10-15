"""Configuration. Everything path-like is overridable through environment variables
(or an optional ``app/backend/.env`` file) so large checkpoints can live outside Git."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

PACKAGE_DIR = Path(__file__).resolve().parent
BACKEND_DIR = PACKAGE_DIR.parent
APP_DIR = BACKEND_DIR.parent


def _load_dotenv(path: Path) -> None:
    """Tiny .env reader (KEY=VALUE). Existing environment variables win."""
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def discover_project_root() -> Path:
    """Locate the PetroVision repository root (the folder that has src/vision and results)."""
    env = os.environ.get("PETROVISION_ROOT")
    if env:
        return Path(env).expanduser().resolve()
    for parent in PACKAGE_DIR.parents:
        if (parent / "src" / "vision" / "unet.py").is_file():
            return parent
    return APP_DIR.parent


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    project_root: Path
    models_dir: Path
    results_dir: Path
    frontend_dist: Path
    device_preference: str          # auto | cpu | cuda
    max_loaded_models: int
    max_upload_bytes: int
    max_mask_side: int
    cors_origins: tuple[str, ...]
    checkpoint_overrides: dict      # model_id -> Path
    mask2former_source: str         # HF hub id or local folder with config + preprocessor config
    analyses_dir: Path              # persisted analyses (history)
    history_max: int
    auth_db_path: Path
    bootstrap_admin_email: str
    bootstrap_admin_password: str
    auth_cookie_secure: bool
    smtp_host: str
    smtp_port: int
    smtp_username: str
    smtp_password: str
    smtp_from_email: str
    smtp_starttls: bool
    target_classes: dict            # model_id -> tuple of class names that count as 'petroleum-like' (None = all)

    @classmethod
    def from_env(cls) -> "Settings":
        _load_dotenv(BACKEND_DIR / ".env")
        root = discover_project_root()
        models_dir = Path(os.environ.get("PETROVISION_MODELS_DIR", root / "models")).expanduser()
        results_dir = Path(os.environ.get("PETROVISION_RESULTS_DIR", root / "results")).expanduser()
        dist = Path(os.environ.get("PETROVISION_FRONTEND_DIST", APP_DIR / "frontend" / "dist")).expanduser()

        overrides = {}
        for model_id in ("unet", "deeplab", "segformer", "mask2former", "yolo", "yolo26"):
            value = os.environ.get(f"PETROVISION_CKPT_{model_id.upper()}")
            if value:
                overrides[model_id] = Path(value).expanduser()

        origins = os.environ.get(
            "PETROVISION_CORS_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:8000",
        )
        targets = {}
        for model_id in ("yolo", "yolo26"):
            raw = os.environ.get(f"PETROVISION_{model_id.upper()}_CLASSES", "").strip()
            targets[model_id] = tuple(c.strip().lower() for c in raw.split(",") if c.strip()) or None

        return cls(
            project_root=root,
            models_dir=models_dir,
            results_dir=results_dir,
            frontend_dist=dist,
            device_preference=os.environ.get("PETROVISION_DEVICE", "auto").lower(),
            max_loaded_models=max(1, _int_env("PETROVISION_MAX_LOADED_MODELS", 3)),
            max_upload_bytes=_int_env("PETROVISION_MAX_UPLOAD_MB", 25) * 1024 * 1024,
            max_mask_side=_int_env("PETROVISION_MAX_MASK_SIDE", 1024),
            cors_origins=tuple(o.strip() for o in origins.split(",") if o.strip()),
            checkpoint_overrides=overrides,
            mask2former_source=os.environ.get(
                "PETROVISION_MASK2FORMER_SOURCE",
                "facebook/mask2former-swin-small-ade-semantic",
            ),
            target_classes=targets,
            analyses_dir=Path(os.environ.get("PETROVISION_ANALYSES_DIR", BACKEND_DIR / "data" / "analyses")).expanduser(),
            history_max=max(10, _int_env("PETROVISION_HISTORY_MAX", 300)),
            auth_db_path=Path(os.environ.get("PETROVISION_AUTH_DB", BACKEND_DIR / "data" / "users.sqlite3")).expanduser(),
            bootstrap_admin_email=os.environ.get("PETROVISION_ADMIN_EMAIL", "").strip(),
            bootstrap_admin_password=os.environ.get("PETROVISION_ADMIN_PASSWORD", ""),
            auth_cookie_secure=os.environ.get("PETROVISION_AUTH_COOKIE_SECURE", "false").lower() in {"1", "true", "yes"},
            smtp_host=os.environ.get("PETROVISION_SMTP_HOST", "").strip(),
            smtp_port=_int_env("PETROVISION_SMTP_PORT", 587),
            smtp_username=os.environ.get("PETROVISION_SMTP_USERNAME", "").strip(),
            smtp_password=os.environ.get("PETROVISION_SMTP_PASSWORD", ""),
            smtp_from_email=os.environ.get("PETROVISION_SMTP_FROM_EMAIL", "").strip(),
            smtp_starttls=os.environ.get("PETROVISION_SMTP_STARTTLS", "true").lower() in {"1", "true", "yes"},
        )
