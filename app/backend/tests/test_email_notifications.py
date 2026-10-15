from dataclasses import replace

from petrovision_api.email_notifications import send_registration_notification


def test_registration_notification_sends_admin_request_via_configured_smtp(settings, monkeypatch):
    sent = {}

    class SMTPClient:
        def __init__(self, host, port, timeout):
            sent["connection"] = (host, port, timeout)

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def starttls(self, *, context):
            sent["tls"] = context

        def login(self, username, password):
            sent["credentials"] = (username, password)

        def send_message(self, message):
            sent["message"] = message

    configured = replace(
        settings,
        bootstrap_admin_email="admin@example.test",
        smtp_host="smtp.example.test",
        smtp_port=587,
        smtp_username="smtp-user",
        smtp_password="smtp-password",
        smtp_from_email="petrovision@example.test",
        smtp_starttls=True,
    )
    monkeypatch.setattr("petrovision_api.email_notifications.smtplib.SMTP", SMTPClient)

    status = send_registration_notification(configured, "member@example.test", 1_750_000_000)

    assert status == "sent"
    assert sent["connection"] == ("smtp.example.test", 587, 15)
    assert sent["credentials"] == ("smtp-user", "smtp-password")
    assert sent["message"]["To"] == "admin@example.test"
    assert "member@example.test" in sent["message"].get_content()
    assert "password" not in sent["message"].get_content().lower()


def test_registration_notification_reports_missing_smtp_configuration(settings):
    unconfigured = replace(
        settings,
        bootstrap_admin_email="",
        smtp_host="",
        smtp_from_email="",
    )
    assert send_registration_notification(unconfigured, "member@example.test", 1_750_000_000) == "not_configured"
