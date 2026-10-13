import dataclasses
import io
import sys
from pathlib import Path

import pytest
from PIL import Image

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from fastapi.testclient import TestClient  # noqa: E402

from petrovision_api.config import Settings  # noqa: E402
from petrovision_api.main import create_app  # noqa: E402


@pytest.fixture(scope="session")
def settings(tmp_path_factory) -> Settings:
    # analyses written by the tests go to a throw-away folder, never into the real history
    return dataclasses.replace(Settings.from_env(), analyses_dir=tmp_path_factory.mktemp("analyses"))


@pytest.fixture(scope="session")
def client(settings):
    return TestClient(create_app(settings))


@pytest.fixture(scope="session")
def dekerf_png(settings) -> bytes:
    """A real De Kerf test photo saved with the YOLO26 experiment (drone view, 1920x1080)."""
    f = settings.results_dir / "cv_yolo26_dekerf" / "yolo26n_dekerf_test_predictions" / "Oil (1024).jpg"
    if not f.is_file():
        pytest.skip("YOLO26 sample photo not found")
    return f.read_bytes()


@pytest.fixture(scope="session")
def real_image(settings) -> Image.Image:
    """A real LADOS test photo: the 'Original' panel of a figure saved in results/.
    (Used only to exercise the pipeline; no ground truth is implied.)"""
    fig = settings.results_dir / "cv_yolo_001" / "visualizations" / "yolo_test_050.png"
    if not fig.is_file():
        pytest.skip("results/cv_yolo_001/visualizations/yolo_test_050.png not found")
    im = Image.open(fig).convert("RGB")
    w, h = im.size
    return im.crop((int(w * 0.0075), int(h * 0.075), int(w * 0.2425), int(h * 0.985)))


def to_bytes(image: Image.Image, fmt="PNG") -> bytes:
    buf = io.BytesIO()
    image.save(buf, format=fmt)
    return buf.getvalue()


@pytest.fixture(scope="session")
def real_png(real_image) -> bytes:
    return to_bytes(real_image)


def with_settings(settings, **changes):
    return dataclasses.replace(settings, **changes)
