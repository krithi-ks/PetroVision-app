"""Convenience launcher:  python app/backend/run.py   (host/port via PETROVISION_HOST / PETROVISION_PORT)."""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import uvicorn  # noqa: E402

if __name__ == "__main__":
    uvicorn.run(
        "petrovision_api.main:app",
        host=os.environ.get("PETROVISION_HOST", "127.0.0.1"),
        port=int(os.environ.get("PETROVISION_PORT", "8000")),
        reload=os.environ.get("PETROVISION_RELOAD", "0") == "1",
    )
