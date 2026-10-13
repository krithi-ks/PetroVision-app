"""Result persistence + De Kerf results. Everything is checked against files produced by the experiments."""
import json
import re

import pytest

from conftest import to_bytes


def _need(client, model_id):
    if client.get(f"/api/models/{model_id}").json()["availability"]["status"] != "available":
        pytest.skip(f"{model_id} not available")


# ------------------------------------------------------------------ De Kerf (YOLO26) saved results
def test_dekerf_results_match_the_saved_notebook_output(client, settings):
    d = client.get("/api/results/dekerf").json()
    assert d["available"] is True and d["model_name"] == "YOLO26n-Seg"
    nb = next((settings.project_root / "notebooks").rglob("*YOLO26*DeKerf*.ipynb"))
    text = " ".join("".join(o.get("text", [])) for c in json.loads(nb.read_text(encoding="utf-8"))["cells"] for o in c.get("outputs", []))
    for label, key in {"Box Precision": "box_precision", "Box mAP50-95": "box_mAP50_95", "Mask Recall": "mask_recall", "Mask mAP50": "mask_mAP50"}.items():
        printed = float(re.search(rf"{label}:\s*([0-9.]+)", text).group(1))
        assert d["metrics"][key] == printed                                      # exactly what the notebook printed
    assert d["test"]["test_images"] == 254 and d["test"]["test_instances"] == 216
    assert "derived" in d["annotation"].lower() and "not human-annotated" in d["annotation"].lower()
    assert len(d["history"]["epochs"]) == d["training"]["epochs"] == 50


def test_dekerf_is_reported_separately_from_the_lados_comparison(client):
    names = [r["model_name"] for r in client.get("/api/results/comparison").json()["rows"]]
    assert "YOLO26n-Seg" not in names and len(names) == 5


def test_dekerf_missing_is_a_clean_empty_state(settings, tmp_path):
    import dataclasses
    from fastapi.testclient import TestClient
    from petrovision_api.main import create_app

    c = TestClient(create_app(dataclasses.replace(settings, results_dir=tmp_path, project_root=tmp_path)))
    assert c.get("/api/results/dekerf").json() == {"available": False}


# ------------------------------------------------------------------ history
def _infer(client, png, model="yolo", **form):
    return client.post("/api/infer/image", files={"file": ("sample.png", png, "image/png")}, data={"model_id": model, **form})


def test_every_image_analysis_is_persisted_and_reusable(client, real_png):
    _need(client, "yolo")
    j = _infer(client, real_png).json()
    aid = j["analysis_id"]
    assert re.match(r"^\d{8}-\d{6}-[0-9a-f]{6}$", aid) and j["urls"]["source"].endswith("/source")

    rec = client.get(f"/api/history/{aid}").json()
    assert rec["model"]["id"] == "yolo" and rec["instance_count"] == j["instance_count"]
    assert rec["measurements"]["coverage_percent"] == j["measurements"]["coverage_percent"]
    assert rec["instances"][0]["area_px"] == j["instances"][0]["area_px"] and rec["instances"][0]["contour"]
    assert rec["timing"]["inference_ms"] == j["timing"]["inference_ms"]
    assert "png" not in rec["mask"] and "overlay_png" not in rec["mask"]            # no large duplicated data in the record

    for name, ctype in (("source", "image/jpeg"), ("thumb", "image/jpeg"), ("labels", "image/png")):
        r = client.get(f"/api/history/{aid}/{name}")
        assert r.status_code == 200 and r.headers["content-type"] == ctype and len(r.content) > 100

    assert client.get("/api/history/latest").json()["analysis"]["id"] == aid         # latest, without re-running the model
    listed = client.get("/api/history").json()
    assert listed["items"][0]["id"] == aid and listed["items"][0]["thumb_url"].endswith("/thumb")


def test_save_false_does_not_persist(client, real_png):
    _need(client, "yolo")
    before = client.get("/api/history").json()["total"]
    j = _infer(client, real_png, save="false").json()
    assert "analysis_id" not in j and client.get("/api/history").json()["total"] == before


def test_history_is_newest_first_and_viz_settings_are_saved(client, real_png):
    _need(client, "yolo")
    a = _infer(client, real_png).json()["analysis_id"]
    b = _infer(client, real_png).json()["analysis_id"]
    ids = [i["id"] for i in client.get("/api/history").json()["items"]]
    assert ids.index(b) < ids.index(a)
    viz = {"mode": "instances", "color": "#00ffaa", "opacity": 0.6, "hidden_instances": [2], "evil": "dropped"}
    saved = client.put(f"/api/history/{a}/viz", json=viz).json()["viz"]
    assert saved == {"mode": "instances", "color": "#00ffaa", "opacity": 0.6, "hidden_instances": [2]}
    assert client.get(f"/api/history/{a}").json()["viz"] == saved


def test_history_delete_and_unknown_ids(client, real_png):
    _need(client, "yolo")
    aid = _infer(client, real_png).json()["analysis_id"]
    assert client.delete(f"/api/history/{aid}").status_code == 200
    r = client.get(f"/api/history/{aid}")
    assert r.status_code == 404 and r.json()["error"]["code"] == "analysis_not_found"
    assert client.get("/api/history/20250101-000000-abcdef/source").status_code == 404


@pytest.mark.parametrize("bad", ["..", "../../etc/passwd", "%2e%2e%2f%2e%2e%2fetc%2fpasswd", "not-an-id", "20250101-000000-ZZZZZZ"])
def test_history_rejects_path_traversal(client, bad):
    for suffix in ("", "/source", "/labels"):
        r = client.get(f"/api/history/{bad}{suffix}")
        assert "root:" not in r.text and r.status_code != 500                      # nothing outside the history folder is ever served
        if r.status_code == 200:                                                   # '..' is normalised away by the client -> the app's own index page
            assert r.headers["content-type"].startswith("text/html")
        else:
            assert r.status_code in (404, 405)
    assert client.delete(f"/api/history/{bad}").status_code in (404, 405)


def test_history_is_capped(settings, real_png, tmp_path):
    import dataclasses
    from fastapi.testclient import TestClient
    from petrovision_api.main import create_app

    c = TestClient(create_app(dataclasses.replace(settings, analyses_dir=tmp_path, history_max=10)))
    if c.get("/api/models/unet").json()["availability"]["status"] != "available":
        pytest.skip("unet not available")
    for _ in range(12):
        assert _infer(c, real_png, model="unet").status_code == 200
    assert c.get("/api/history").json()["total"] == 10
