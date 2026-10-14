"""Telegram incident endpoint contract tests (no real Telegram request is made)."""

def test_telegram_endpoint_requires_and_sends_both_images(client, real_png, monkeypatch):
    from petrovision_api.routes import api as api_routes

    seen = {}

    async def fake_send_media_group(original, overlay, caption, incident_id):
        seen["original"] = original
        seen["overlay"] = overlay
        seen["caption"] = caption
        seen["incident_id"] = incident_id
        return {"sent": True, "message_ids": [101, 102]}

    monkeypatch.setattr(api_routes, "_send_telegram_media_group", fake_send_media_group)

    response = client.post(
        "/api/incidents/telegram",
        files={
            "file": ("original.jpg", real_png, "image/jpeg"),
            "overlay_file": ("predicted.jpg", real_png, "image/jpeg"),
        },
        data={
            "incident_id": "PV-test-001",
            "timestamp": "2026-10-14T09:00:00Z",
            "model_id": "yolo",
            "summary": "Test incident",
        },
    )

    assert response.status_code == 200, response.text
    assert response.json()["sent"] is True
    assert response.json()["message_ids"] == [101, 102]
    assert seen["original"] and seen["overlay"]
    assert "PV-test-001" in seen["caption"]
    assert seen["incident_id"] == "PV-test-001"


def test_telegram_endpoint_requires_predicted_image(client, real_png):
    response = client.post(
        "/api/incidents/telegram",
        files={"file": ("original.jpg", real_png, "image/jpeg")},
        data={
            "incident_id": "PV-test-002",
            "timestamp": "2026-10-14T09:00:00Z",
            "model_id": "yolo",
            "summary": "Test incident",
        },
    )
    assert response.status_code == 422
