"""Typed errors that map to clean JSON responses: {"error": {"code", "message", "hint"}}."""

from __future__ import annotations


class PetroVisionError(Exception):
    status_code = 500
    code = "internal_error"

    def __init__(self, message: str, *, hint: str | None = None, code: str | None = None):
        super().__init__(message)
        self.message = message
        self.hint = hint
        if code:
            self.code = code

    def to_payload(self) -> dict:
        err = {"code": self.code, "message": self.message}
        if self.hint:
            err["hint"] = self.hint
        return {"error": err}


class UnknownModelError(PetroVisionError):
    status_code = 404
    code = "unknown_model"


class ModelUnavailableError(PetroVisionError):
    """Checkpoint missing or a Python dependency is not installed."""

    status_code = 503
    code = "model_unavailable"


class ModelLoadError(PetroVisionError):
    status_code = 500
    code = "model_load_failed"


class ImageDecodeError(PetroVisionError):
    status_code = 400
    code = "invalid_image"


class PayloadTooLargeError(PetroVisionError):
    status_code = 413
    code = "payload_too_large"


class InferenceError(PetroVisionError):
    status_code = 500
    code = "inference_failed"


class ResultsUnavailableError(PetroVisionError):
    status_code = 404
    code = "results_not_found"
