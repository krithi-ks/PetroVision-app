"""Model cache. Models are loaded once (lazily or via the preload endpoint) and kept in
memory; they are never reloaded per request or per webcam frame."""

from __future__ import annotations

import threading
import time
from collections import OrderedDict

from ..config import Settings
from ..errors import ModelUnavailableError, UnknownModelError
from ..registry import MODEL_SPECS, SPEC_BY_ID, Availability, ModelSpec, check_availability
from .predictors import PREDICTOR_CLASSES, BasePredictor


def get_device(preference: str = "auto"):
    import torch

    preference = (preference or "auto").lower()
    if preference == "cpu":
        return torch.device("cpu")
    if preference in ("cuda", "gpu"):
        if torch.cuda.is_available():
            return torch.device("cuda")
        return torch.device("cpu")   # requested GPU is unavailable -> honest CPU fallback (reported via /api/health)
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


def describe_device(device) -> dict:
    import torch

    info = {"type": device.type, "name": "CPU"}
    if device.type == "cuda":
        info["name"] = torch.cuda.get_device_name(0)
    return info


class ModelManager:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._lock = threading.RLock()
        self._loaded: "OrderedDict[str, BasePredictor]" = OrderedDict()
        self._device = None

    @property
    def device(self):
        if self._device is None:
            self._device = get_device(self.settings.device_preference)
        return self._device

    def spec(self, model_id: str) -> ModelSpec:
        try:
            return SPEC_BY_ID[model_id]
        except KeyError:
            raise UnknownModelError(
                f"Unknown model '{model_id}'.", hint="Valid ids: " + ", ".join(SPEC_BY_ID)
            ) from None

    def availability(self, model_id: str) -> Availability:
        return check_availability(self.spec(model_id), self.settings)

    def is_loaded(self, model_id: str) -> bool:
        with self._lock:
            return model_id in self._loaded

    def loaded_ids(self) -> list:
        with self._lock:
            return list(self._loaded)

    def get(self, model_id: str) -> BasePredictor:
        """Return a ready predictor, loading it on first use."""
        spec = self.spec(model_id)
        with self._lock:
            predictor = self._loaded.get(model_id)
            if predictor is not None:
                self._loaded.move_to_end(model_id)
                return predictor

            availability = check_availability(spec, self.settings)
            if availability.status != "available":
                raise ModelUnavailableError(availability.message, code=availability.status)

            predictor = PREDICTOR_CLASSES[spec.family](spec, availability.checkpoint_path, self.device, self.settings)
            predictor.load()
            self._loaded[model_id] = predictor
            self._evict_if_needed()
            return predictor

    def preload(self, model_id: str) -> BasePredictor:
        """Load and warm up (used by the UI before starting the webcam)."""
        predictor = self.get(model_id)
        if not getattr(predictor, "_warmed", False):
            start = time.perf_counter()
            predictor.warm_up()
            predictor._warmed = True
            predictor.warmup_seconds = round(time.perf_counter() - start, 3)
        return predictor

    def unload(self, model_id: str) -> bool:
        self.spec(model_id)
        with self._lock:
            predictor = self._loaded.pop(model_id, None)
        if predictor is None:
            return False
        predictor.unload()
        return True

    def _evict_if_needed(self) -> None:
        while len(self._loaded) > self.settings.max_loaded_models:
            _id, oldest = self._loaded.popitem(last=False)   # least recently used
            oldest.unload()

    def runtime_info(self, model_id: str) -> dict | None:
        with self._lock:
            predictor = self._loaded.get(model_id)
        return predictor.runtime_info() if predictor else None

    @staticmethod
    def all_specs():
        return MODEL_SPECS
