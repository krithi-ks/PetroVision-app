"""The results endpoints must reproduce the saved experiment files exactly."""
import csv
import json


def test_comparison_matches_csv(client, settings):
    rows = {r["Model"]: r for r in csv.DictReader(open(settings.results_dir / "cv_final_model_comparison.csv", encoding="utf-8-sig"))}
    data = client.get("/api/results/comparison").json()
    assert len(data["rows"]) == len(rows) == 5
    for row in data["rows"]:
        src = rows[row["model_name"]]
        assert row["iou"] == float(src["IoU"])
        assert row["dice"] == float(src["Dice"])
        assert row["precision"] == float(src["Precision"])
        assert row["recall"] == float(src["Recall"])
        assert row["accuracy"] == float(src["Accuracy"])
        assert row["parameters_m"] == float(src["Parameters_M"])
        assert row["mean_ms_per_image"] == float(src["Mean_ms_per_image"])
        assert row["model_id"] is not None


def test_observations_are_computed_not_hardcoded(client):
    data = client.get("/api/results/comparison").json()
    best_iou = max(data["rows"], key=lambda r: r["iou"])
    assert data["observations"]["iou"]["model_name"] == best_iou["model_name"]
    assert data["observations"]["iou"]["value"] == best_iou["iou"]
    fastest = min(data["rows"], key=lambda r: r["mean_ms_per_image"])
    assert data["observations"]["lowest_latency"]["model_name"] == fastest["model_name"]


def test_benchmark_and_summary(client, settings):
    bench = client.get("/api/results/benchmark").json()
    raw = json.load(open(settings.results_dir / "cv_inference_benchmark.json"))
    assert bench["hardware"] == raw["hardware"] and len(bench["models"]) == len(raw["models"])
    summary = client.get("/api/results/summary").json()
    assert summary["methodology"]["dataset"] == "LADOS" and summary["limitations"]


def test_history_endpoints(client):
    for model_id in ("unet", "deeplab", "segformer", "mask2former", "yolo"):
        h = client.get(f"/api/results/history/{model_id}").json()
        assert len(h["train_loss"]) == len(h["validation_loss"]) == len(h["epochs"]) > 0
    assert client.get("/api/results/history/nope").status_code == 404


def test_missing_results_dir_gives_clean_error(settings, tmp_path):
    from fastapi.testclient import TestClient
    from conftest import login_as_admin, with_settings
    from petrovision_api.main import create_app

    c = login_as_admin(TestClient(create_app(with_settings(settings, results_dir=tmp_path))), settings)
    r = c.get("/api/results/comparison")
    assert r.status_code == 404 and r.json()["error"]["code"] == "results_not_found"
    assert c.get("/api/models").status_code == 200       # model list degrades gracefully
