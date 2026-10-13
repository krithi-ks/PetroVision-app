"""FastAPI application factory.

Run (from the repository root)::

    python -m uvicorn petrovision_api.main:app --app-dir app/backend --port 8000
"""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import __version__
from .config import Settings
from .errors import PetroVisionError
from .history import HistoryStore
from .inference.manager import ModelManager
from .results import ResultsRepository
from .routes.api import router

log = logging.getLogger("petrovision")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    app = FastAPI(
        title="PetroVision API",
        version=__version__,
        description="Inference + saved-results API for the PetroVision petroleum-contamination segmentation project.",
    )
    app.state.settings = settings
    app.state.manager = ModelManager(settings)
    app.state.results = ResultsRepository(settings)
    app.state.history = HistoryStore(settings.analyses_dir, settings.history_max)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(PetroVisionError)
    async def _petrovision_error(_request: Request, exc: PetroVisionError):
        return JSONResponse(status_code=exc.status_code, content=exc.to_payload())

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_request: Request, exc: RequestValidationError):
        fields = "; ".join(f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in exc.errors())
        return JSONResponse(status_code=422, content={"error": {"code": "invalid_request", "message": fields}})

    @app.exception_handler(Exception)
    async def _unexpected(_request: Request, exc: Exception):
        log.exception("Unhandled error")
        return JSONResponse(
            status_code=500,
            content={"error": {"code": "internal_error", "message": "Something went wrong while analysing. Please try again."}},
        )

    app.include_router(router)
    _log_startup_report(app.state.manager, settings)
    _mount_frontend(app, settings.frontend_dist)
    return app


def _log_startup_report(manager: ModelManager, settings: Settings) -> None:
    """Developer-facing: where each model was looked for. Printed to the server console only."""
    from .registry import checkpoint_path

    lines = [f"PetroVision backend - models folder: {settings.models_dir}"]
    for spec in manager.all_specs():
        a = manager.availability(spec.id)
        lines.append(f"  {spec.label:<14} {a.status:<20} {checkpoint_path(spec, settings)}")
    print("\n".join(lines), flush=True)


def _mount_frontend(app: FastAPI, dist: Path) -> None:
    """Serve the built React app (``npm run build``) from the same origin when present."""
    index = dist / "index.html"
    if not index.is_file():
        return
    if (dist / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")
    dist_resolved = dist.resolve()

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str):
        if path.startswith("api/"):
            return JSONResponse(status_code=404, content={"error": {"code": "not_found", "message": "Unknown API route."}})
        candidate = (dist / path).resolve()
        if path and candidate.is_file() and dist_resolved in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(index)


app = create_app()
