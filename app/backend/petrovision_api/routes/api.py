"""HTTP API. All inference endpoints run the real models on the real uploaded data."""

from __future__ import annotations

import io
import json
import logging
import platform
import sys
import time
import os
import httpx

from PIL import Image

from fastapi import HTTPException
from fastapi import APIRouter, Body, File, Form, Query, Request, UploadFile
from fastapi.responses import FileResponse
from starlette.concurrency import run_in_threadpool

from .. import __version__
from ..errors import ImageDecodeError, PayloadTooLargeError, PetroVisionError, ResultsUnavailableError
from ..imaging import decode_image
from ..inference.manager import describe_device
from ..pipeline import analyze_image

router = APIRouter(prefix="/api")
log = logging.getLogger("petrovision")

FRAME_MAX_MASK_SIDE = 480


# ------------------------------------------------------------------------------ helpers
def _state(request: Request):
    return request.app.state


def _display_path(path, root) -> str:
    try:
        return str(path.resolve().relative_to(root.resolve()))
    except ValueError:
        return str(path)


def _research_row(request: Request, results_name: str):
    try:
        for row in _state(request).results.comparison()["rows"]:
            if row["model_name"] == results_name:
                return row
    except ResultsUnavailableError:
        return None
    return None


def _model_payload(request: Request, spec, rows_by_name: dict | None = None) -> dict:
    st = _state(request)
    availability = st.manager.availability(spec.id)
    research = rows_by_name.get(spec.results_name) if rows_by_name is not None else _research_row(request, spec.results_name)
    return {
        "id": spec.id,
        "label": spec.label,
        "experiment_id": spec.experiment_id,
        "family": spec.family,
        "task": spec.task,
        "dataset": spec.dataset,
        "architecture": spec.architecture,
        "initialization": spec.initialization,
        "description": spec.description,
        "input_note": spec.input_note,
        "availability": {
            "status": availability.status,
            "available": availability.status == "available",
            "message": availability.message,
        },
        "loaded": st.manager.is_loaded(spec.id),
        "research_result": research,
    }


async def _read_upload(file: UploadFile, limit: int) -> bytes:
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise PayloadTooLargeError(f"File is larger than the {limit // 1_048_576} MB upload limit.")
    return data


async def _send_telegram_photo(
    photo: bytes,
    filename: str,
    caption: str,
) -> dict:
    """Send one evidence image to the configured Telegram chat."""
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
    if not token or not chat_id:
        raise HTTPException(status_code=503, detail="Telegram is not configured. Check backend environment variables.")

    url = f"https://api.telegram.org/bot{token}/sendPhoto"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                url,
                data={"chat_id": chat_id, "caption": caption[:1024]},
                files={"photo": (filename, photo, "image/jpeg")},
            )
        if response.is_error:
            log.error("Telegram API returned HTTP %s: %s", response.status_code, response.text[:1000])
            raise HTTPException(status_code=502, detail="Telegram rejected the incident alert. Check backend logs.")
        payload = response.json()
        if not payload.get("ok"):
            log.error("Telegram API reported failure: %s", payload.get("description", "Unknown Telegram API error"))
            raise HTTPException(status_code=502, detail="Telegram did not accept the incident alert. Check backend logs.")
        return {"sent": True, "message_id": payload["result"]["message_id"]}
    except httpx.HTTPError as exc:
        log.exception("Telegram network request failed: %s", type(exc).__name__)
        raise HTTPException(status_code=502, detail="Could not reach Telegram. Check backend logs.") from exc


async def _send_telegram_media_group(
    original: bytes,
    overlay: bytes,
    caption: str,
    incident_id: str,
) -> dict:
    """Send original + prediction overlay as two photos in one Telegram album."""
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
    if not token or not chat_id:
        raise HTTPException(status_code=503, detail="Telegram is not configured. Check backend environment variables.")

    url = f"https://api.telegram.org/bot{token}/sendMediaGroup"
    # Telegram captions for media-group photos are limited; attach the caption to the first image.
    media = [
        {"type": "photo", "media": "attach://original", "caption": caption[:1024]},
        {"type": "photo", "media": "attach://overlay"},
    ]
    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(
                url,
                data={"chat_id": chat_id, "media": json.dumps(media)},
                files={
                    "original": (f"{incident_id}-original.jpg", original, "image/jpeg"),
                    "overlay": (f"{incident_id}-predicted.jpg", overlay, "image/jpeg"),
                },
            )
        if response.is_error:
            log.error("Telegram media-group API returned HTTP %s: %s", response.status_code, response.text[:1000])
            raise HTTPException(status_code=502, detail="Telegram rejected the evidence images. Check backend logs.")
        payload = response.json()
        if not payload.get("ok"):
            log.error("Telegram media-group failure: %s", payload.get("description", "Unknown Telegram API error"))
            raise HTTPException(status_code=502, detail="Telegram did not accept both evidence images. Check backend logs.")
        messages = payload.get("result", [])
        return {"sent": True, "message_ids": [m.get("message_id") for m in messages]}
    except httpx.HTTPError as exc:
        log.exception("Telegram media-group request failed: %s", type(exc).__name__)
        raise HTTPException(status_code=502, detail="Could not reach Telegram. Check backend logs.") from exc


# ------------------------------------------------------------------------------ health
_STARTED = time.time()


@router.get("/health")
def health(request: Request):
    st = _state(request)
    info = {
        "status": "ok",
        "version": __version__,
        "uptime_seconds": round(time.time() - _STARTED, 1),
        "python": sys.version.split()[0],
        "platform": platform.platform(),
        "device_preference": st.settings.device_preference,
        "paths": {
            "models_dir_exists": st.settings.models_dir.is_dir(),
            "results_dir_exists": st.settings.results_dir.is_dir(),
            "frontend_built": st.settings.frontend_dist.joinpath("index.html").is_file(),
        },
        "loaded_models": st.manager.loaded_ids(),
    }
    try:
        import torch
        info["torch"] = torch.__version__
        info["device"] = describe_device(st.manager.device)
        if st.settings.device_preference in ("cuda", "gpu") and info["device"]["type"] != "cuda":
            info["device_warning"] = "CUDA was requested but is not available; running on CPU."
    except Exception as exc:
        info["status"] = "degraded"
        info["torch_error"] = str(exc)
    return info


@router.get("/status")
def status(request: Request):
    st = _state(request)
    available = [s.id for s in st.manager.all_specs() if st.manager.availability(s.id).status == "available"]
    return {"ready": bool(available), "models_available": len(available), "models_total": len(st.manager.all_specs())}


# ------------------------------------------------------------------------------ environmental context
@router.get("/geocode")
async def geocode(query: str = Query(..., min_length=2)):
    query = query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Location query is required.")
    url = "https://geocoding-api.open-meteo.com/v1/search"
    params = {"name": query, "count": 10, "language": "en", "format": "json"}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
        data = response.json()
        return {"results": [{"name": item.get("name"), "latitude": item.get("latitude"), "longitude": item.get("longitude"),
                             "country": item.get("country"), "country_code": item.get("country_code"), "admin1": item.get("admin1"),
                             "admin2": item.get("admin2"), "timezone": item.get("timezone")} for item in data.get("results", [])]}
    except httpx.HTTPError as exc:
        log.exception("Marine location search failed")
        raise HTTPException(status_code=502, detail="Location search service is temporarily unavailable.") from exc


@router.get("/marine")
async def marine(latitude: float = Query(..., ge=-90, le=90), longitude: float = Query(..., ge=-180, le=180)):
    url = "https://marine-api.open-meteo.com/v1/marine"
    params = {"latitude": latitude, "longitude": longitude,
              "hourly": "wave_height,wave_direction,wave_period,sea_surface_temperature,ocean_current_velocity,ocean_current_direction",
              "forecast_days": 2, "timezone": "auto", "cell_selection": "sea"}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
        return response.json()
    except httpx.HTTPError as exc:
        log.exception("Marine data request failed for %.6f, %.6f", latitude, longitude)
        raise HTTPException(status_code=502, detail="Marine data service is temporarily unavailable.") from exc


# ------------------------------------------------------------------------------ models
@router.get("/models")
def list_models(request: Request):
    st = _state(request)
    try:
        rows = {r["model_name"]: r for r in st.results.comparison()["rows"]}
    except ResultsUnavailableError:
        rows = {}
    models = [_model_payload(request, spec, rows) for spec in st.manager.all_specs()]
    return {"models": models, "available_count": sum(1 for m in models if m["availability"]["available"]), "total": len(models)}


@router.get("/models/{model_id}")
def model_detail(model_id: str, request: Request):
    st = _state(request)
    return _model_payload(request, st.manager.spec(model_id))


@router.post("/models/{model_id}/load")
async def load_model(model_id: str, request: Request):
    st = _state(request)
    st.manager.spec(model_id)
    predictor = await run_in_threadpool(st.manager.preload, model_id)
    return _model_payload(request, predictor.spec)


@router.post("/models/{model_id}/unload")
def unload_model(model_id: str, request: Request):
    st = _state(request)
    return {"model_id": model_id, "unloaded": st.manager.unload(model_id)}


# ------------------------------------------------------------------------------ inference
def _analyze_bytes(request: Request, model_id: str, data: bytes, *, save: bool = False, **kwargs) -> dict:
    st = _state(request)
    predictor = st.manager.get(model_id)
    image = decode_image(data)
    result = analyze_image(predictor, image, **kwargs)
    if save:
        try:
            record = st.history.save(result, image)
            result["analysis_id"] = record["id"]
            result["created_at"] = record["created_at"]
            result["urls"] = st.history.urls(record["id"])
        except Exception:
            log.exception("Could not persist analysis")
            result["analysis_id"] = None
    return result


@router.post("/infer/image")
async def infer_image(request: Request, file: UploadFile = File(...), model_id: str = Form(...), save: bool = Form(True)):
    st = _state(request)
    st.manager.spec(model_id)
    data = await _read_upload(file, st.settings.max_upload_bytes)
    return await run_in_threadpool(_analyze_bytes, request, model_id, data, save=save,
                                   max_side=st.settings.max_mask_side, filename=file.filename)


@router.post("/infer/frame")
async def infer_frame(request: Request, model_id: str = Query(...)):
    """Webcam frame (raw JPEG/PNG bytes in the body). Returns lightweight prediction labels for live scan."""
    st = _state(request)
    st.manager.spec(model_id)
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > st.settings.max_upload_bytes:
        raise PayloadTooLargeError("Frame is too large.")
    data = await request.body()
    if len(data) > st.settings.max_upload_bytes:
        raise PayloadTooLargeError("Frame is too large.")
    if not data:
        raise ImageDecodeError("Empty frame.")
    result = await run_in_threadpool(
        _analyze_bytes, request, model_id, data,
        max_side=min(st.settings.max_mask_side, FRAME_MAX_MASK_SIDE),
        include_mask_png=False, include_contours=True, include_overlay=True,
    )
    for key in ("notes", "contours"):
        result.pop(key, None)
    return result


@router.post("/incidents/telegram")
async def send_telegram_incident(
    file: UploadFile = File(...),
    overlay_file: UploadFile = File(...),
    incident_id: str = Form(...),
    timestamp: str = Form(...),
    model_id: str = Form(...),
    summary: str = Form(...),
):
    """Send original captured image and annotated prediction image to Telegram."""
    original_bytes = await _read_upload(file, 10 * 1024 * 1024)
    overlay_bytes = await _read_upload(overlay_file, 10 * 1024 * 1024)
    if not original_bytes or not overlay_bytes:
        raise HTTPException(status_code=400, detail="Original and predicted evidence images are both required.")
    try:
        original_img = decode_image(original_bytes)
        overlay_img = decode_image(overlay_bytes)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Could not decode incident images.") from exc
    if original_img.size != overlay_img.size:
        overlay_img = overlay_img.resize(original_img.size, Image.Resampling.NEAREST)
        buf = io.BytesIO()
        overlay_img.save(buf, format="JPEG", quality=90)
        overlay_bytes = buf.getvalue()

    caption = (
        "🚨 PETROVISION — POSSIBLE OIL-SPILL VISUAL DETECTION\n\n"
        f"Incident: {incident_id}\nTime (UTC): {timestamp}\nModel: {model_id}\n\n"
        f"{summary}\n\n"
        "AI visual indication only; not chemical confirmation."
    )
    delivery = await _send_telegram_media_group(original_bytes, overlay_bytes, caption, incident_id)
    return {"incident_id": incident_id, **delivery}


# ------------------------------------------------------------------------------ results
@router.get("/results/comparison")
def results_comparison(request: Request):
    return _state(request).results.comparison()


@router.get("/results/benchmark")
def results_benchmark(request: Request):
    return _state(request).results.benchmark()


@router.get("/results/summary")
def results_summary(request: Request):
    return _state(request).results.summary()


@router.get("/results/history/{model_id}")
def results_history(model_id: str, request: Request):
    st = _state(request)
    st.manager.spec(model_id)
    return _state(request).results.history(model_id)


@router.get("/results/dekerf")
def results_dekerf(request: Request):
    return _state(request).results.dekerf()


# ------------------------------------------------------------------------------ history
class HistoryNotFound(PetroVisionError):
    status_code = 404
    code = "analysis_not_found"


@router.get("/history")
def history_list(request: Request, limit: int = Query(50, ge=1, le=300)):
    h = _state(request).history
    return {"items": h.list(limit), "total": h.count()}


@router.get("/history/latest")
def history_latest(request: Request):
    h = _state(request).history
    latest = h.latest()
    return {"analysis": h.full(latest["id"]) if latest else None}


@router.get("/history/{analysis_id}")
def history_get(analysis_id: str, request: Request):
    record = _state(request).history.full(analysis_id)
    if record is None:
        raise HistoryNotFound("This analysis is no longer available.")
    return record


@router.get("/history/{analysis_id}/{name}")
def history_file(analysis_id: str, name: str, request: Request):
    files = {"source": "source.jpg", "thumb": "thumb.jpg", "labels": "labels.png"}
    path = _state(request).history.file(analysis_id, files.get(name, ""))
    if path is None:
        raise HistoryNotFound("This analysis is no longer available.")
    return FileResponse(path, headers={"Cache-Control": "private, max-age=86400"})


@router.put("/history/{analysis_id}/viz")
def history_viz(analysis_id: str, request: Request, viz: dict = Body(...)):
    allowed = {"mode", "color", "opacity", "show_boxes", "show_labels", "hidden_instances"}
    clean = {k: v for k, v in viz.items() if k in allowed}
    record = _state(request).history.update_viz(analysis_id, clean)
    if record is None:
        raise HistoryNotFound("This analysis is no longer available.")
    return {"id": analysis_id, "viz": record["viz"]}


@router.delete("/history/{analysis_id}")
def history_delete(analysis_id: str, request: Request):
    if not _state(request).history.delete(analysis_id):
        raise HistoryNotFound("This analysis is no longer available.")
    return {"deleted": analysis_id}


@router.delete("/history")
def history_clear(request: Request):
    return {"deleted": _state(request).history.clear()}
