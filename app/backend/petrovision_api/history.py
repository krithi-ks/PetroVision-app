"""Persistent analysis history.

Every real image analysis is stored as a small folder::

    <analyses_dir>/<analysis_id>/
        analysis.json   model, image info, timing, measurements, per-instance data (+ contours), viz settings
        source.jpg      the analysed image (long side capped at 1280 px)
        thumb.jpg       320 px preview
        labels.png      8-bit label map (0 = background, k = instance/region k)

Masks, overlays and 3D surfaces are re-derived from ``labels.png`` + ``analysis.json`` so nothing large is
duplicated and the saved analysis can be shown again without re-running inference.
"""

from __future__ import annotations

import base64
import json
import re
import shutil
import threading
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

ID_RE = re.compile(r"^\d{8}-\d{6}-[0-9a-f]{6}$")
SOURCE_MAX_SIDE = 1280
THUMB_SIDE = 320


def _data_url_bytes(data_url: str) -> bytes:
    return base64.b64decode(data_url.split(",", 1)[1])


class HistoryStore:
    def __init__(self, root: Path, max_items: int = 300):
        self.root = Path(root)
        self.max_items = max_items
        self._lock = threading.Lock()

    # ------------------------------------------------------------------ helpers
    def valid_id(self, analysis_id: str) -> bool:
        return bool(ID_RE.match(analysis_id or ""))

    def _dir(self, analysis_id: str) -> Path:
        return self.root / analysis_id

    @staticmethod
    def _summary(record: dict) -> dict:
        m = record["measurements"]
        return {
            "id": record["id"],
            "created_at": record["created_at"],
            "model": record["model"],
            "filename": record["image"].get("filename"),
            "image": {"width": record["image"]["width"], "height": record["image"]["height"]},
            "instance_count": record["instance_count"],
            "coverage_percent": m["coverage_percent"],
            "inference_ms": record["timing"]["inference_ms"],
            "thumb_url": f"/api/history/{record['id']}/thumb",
        }

    # ------------------------------------------------------------------ write
    def save(self, payload: dict, image: Image.Image) -> dict:
        now = datetime.now(timezone.utc)
        # <date>-<time>-<microseconds as 6 hex digits>: lexicographic order == chronological order,
        # even for analyses created within the same second. A collision bumps the counter.
        micro = now.microsecond
        analysis_id = f"{now:%Y%m%d-%H%M%S}-{micro:06x}"
        while self._dir(analysis_id).exists():
            micro += 1
            analysis_id = f"{now:%Y%m%d-%H%M%S}-{micro:06x}"
        folder = self._dir(analysis_id)
        tmp = self.root / f".tmp-{analysis_id}"
        tmp.mkdir(parents=True, exist_ok=True)
        try:
            src = image.convert("RGB")
            if max(src.size) > SOURCE_MAX_SIDE:
                scale = SOURCE_MAX_SIDE / max(src.size)
                src = src.resize((round(src.width * scale), round(src.height * scale)), Image.Resampling.LANCZOS)
            src.save(tmp / "source.jpg", quality=88, optimize=True)
            thumb = src.copy()
            thumb.thumbnail((THUMB_SIDE, THUMB_SIDE))
            thumb.save(tmp / "thumb.jpg", quality=80)
            (tmp / "labels.png").write_bytes(_data_url_bytes(payload["mask"]["labels_png"]))

            record = {
                "id": analysis_id,
                "created_at": now.isoformat(timespec="seconds"),
                "model": payload["model"],
                "image": payload["image"],
                "mask": {"width": payload["mask"]["width"], "height": payload["mask"]["height"]},
                "measurements": payload["measurements"],
                "instances": payload["instances"],
                "instance_count": payload["instance_count"],
                "contours": payload.get("contours", []),
                "timing": payload["timing"],
                "viz": None,
            }
            (tmp / "analysis.json").write_text(json.dumps(record, separators=(",", ":")), encoding="utf-8")
            with self._lock:
                self.root.mkdir(parents=True, exist_ok=True)
                tmp.rename(folder)
                self._prune()
        except Exception:
            shutil.rmtree(tmp, ignore_errors=True)
            raise
        return record

    def update_viz(self, analysis_id: str, viz: dict) -> dict | None:
        record = self.get(analysis_id)
        if record is None:
            return None
        record["viz"] = viz
        with self._lock:
            (self._dir(analysis_id) / "analysis.json").write_text(json.dumps(record, separators=(",", ":")), encoding="utf-8")
        return record

    def delete(self, analysis_id: str) -> bool:
        if not self.valid_id(analysis_id) or not self._dir(analysis_id).is_dir():
            return False
        with self._lock:
            shutil.rmtree(self._dir(analysis_id), ignore_errors=True)
        return True

    def clear(self) -> int:
        n = 0
        for folder in self._folders():
            shutil.rmtree(folder, ignore_errors=True)
            n += 1
        return n

    def _prune(self) -> None:
        folders = self._folders()
        for old in folders[self.max_items:]:
            shutil.rmtree(old, ignore_errors=True)

    # ------------------------------------------------------------------ read
    def _folders(self) -> list[Path]:
        if not self.root.is_dir():
            return []
        return sorted((p for p in self.root.iterdir() if p.is_dir() and ID_RE.match(p.name)), reverse=True)   # newest first

    def get(self, analysis_id: str) -> dict | None:
        if not self.valid_id(analysis_id):
            return None
        f = self._dir(analysis_id) / "analysis.json"
        try:
            return json.loads(f.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None

    def list(self, limit: int = 50) -> list[dict]:
        out = []
        for folder in self._folders():
            record = self.get(folder.name)
            if record:
                out.append(self._summary(record))
            if len(out) >= limit:
                break
        return out

    def count(self) -> int:
        return len(self._folders())

    def latest(self) -> dict | None:
        for folder in self._folders():
            record = self.get(folder.name)
            if record:
                return record
        return None

    def file(self, analysis_id: str, name: str) -> Path | None:
        if not self.valid_id(analysis_id) or name not in {"source.jpg", "thumb.jpg", "labels.png"}:
            return None
        p = self._dir(analysis_id) / name
        return p if p.is_file() else None

    @staticmethod
    def urls(analysis_id: str) -> dict:
        base = f"/api/history/{analysis_id}"
        return {"source": f"{base}/source", "labels": f"{base}/labels", "thumb": f"{base}/thumb"}

    def full(self, analysis_id: str) -> dict | None:
        record = self.get(analysis_id)
        if record is None:
            return None
        return {**record, "urls": self.urls(analysis_id)}
