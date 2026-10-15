import httpx


def test_telegram_incident_sends_both_images_and_cautionary_caption(client, monkeypatch):
    sent = {}

    async def send_media_group(*, original, prediction, caption, details):
        sent.update(original=original, prediction=prediction, caption=caption, details=details)
        return {"sent": True, "message_ids": [10, 11]}

    monkeypatch.setattr("petrovision_api.routes.api._send_telegram_media_group", send_media_group)
    response = client.post(
        "/api/incidents/telegram",
        data={
            "incident_id": "PV-123",
            "timestamp": "2026-10-15T10:00:00Z",
            "model_id": "yolo",
            "alert_type": "spreading",
            "summary": "Coverage increased from 1.0% to 1.7%.",
        },
        files={
            "file": ("original.jpg", b"original-frame", "image/jpeg"),
            "prediction": ("prediction.jpg", b"predicted-frame", "image/jpeg"),
        },
    )

    assert response.status_code == 200
    assert response.json()["message_ids"] == [10, 11]
    assert sent["original"] == b"original-frame"
    assert sent["prediction"] == b"predicted-frame"
    assert "POSSIBLE SPREADING" in sent["caption"]
    assert "Coverage increased" in sent["details"]
    assert "not chemical confirmation" in sent["details"]
    assert len(sent["caption"]) <= 1024
    assert len(sent["details"]) <= 1024


def test_telegram_transport_failure_is_reported_as_delivery_error(client, monkeypatch):
    class FailingClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return False

        async def post(self, *_args, **_kwargs):
            raise httpx.ConnectError("connection failed")

    monkeypatch.setattr("petrovision_api.routes.api.httpx.AsyncClient", lambda **_kwargs: FailingClient())
    response = client.post(
        "/api/incidents/telegram",
        data={
            "incident_id": "PV-789",
            "timestamp": "2026-10-15T10:00:00Z",
            "model_id": "yolo",
            "alert_type": "detected",
            "summary": "Persistent visual detection.",
        },
        files={
            "file": ("original.jpg", b"original-frame", "image/jpeg"),
            "prediction": ("prediction.jpg", b"predicted-frame", "image/jpeg"),
        },
    )

    assert response.status_code == 502
    assert "could not reach telegram" in response.json()["detail"].lower()


def test_telegram_integration_status_does_not_expose_credentials(client, monkeypatch):
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "do-not-return-this")
    monkeypatch.setenv("TELEGRAM_CHAT_ID", "private-chat")

    response = client.get("/api/integrations/telegram")

    assert response.status_code == 200
    assert response.json() == {"configured": True}
    assert "do-not-return-this" not in response.text
    assert "private-chat" not in response.text


def test_telegram_caption_keeps_caution_with_long_detection_details(client, monkeypatch):
    sent = {}

    async def send_media_group(*, original, prediction, caption, details):
        sent.update(caption=caption, details=details)
        return {"sent": True, "message_ids": [12, 13]}

    monkeypatch.setattr("petrovision_api.routes.api._send_telegram_media_group", send_media_group)
    response = client.post(
        "/api/incidents/telegram",
        data={
            "incident_id": "PV-456",
            "timestamp": "2026-10-15T10:00:00Z",
            "model_id": "yolo",
            "alert_type": "detected",
            "summary": "coverage " * 300,
        },
        files={
            "file": ("original.jpg", b"original-frame", "image/jpeg"),
            "prediction": ("prediction.jpg", b"predicted-frame", "image/jpeg"),
        },
    )

    assert response.status_code == 200
    assert len(sent["caption"]) <= 1024
    assert len(sent["details"]) <= 1024
    assert "coverage" in sent["details"]
    assert "not chemical confirmation" in sent["details"]
