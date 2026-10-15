"""Email notifications for administrator-facing account events."""

from __future__ import annotations

import logging
import smtplib
import ssl
from datetime import datetime, timezone
from email.message import EmailMessage

from .config import Settings

log = logging.getLogger("petrovision")


def send_registration_notification(settings: Settings, email: str, requested_at: int) -> str:
    """Send a registration notice and report whether delivery was possible."""

    if not settings.smtp_host or not settings.smtp_from_email or not settings.bootstrap_admin_email:
        return "not_configured"

    requested = datetime.fromtimestamp(requested_at, timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    message = EmailMessage()
    message["Subject"] = "PetroVision access request"
    message["From"] = settings.smtp_from_email
    message["To"] = settings.bootstrap_admin_email
    message.set_content(
        "A new PetroVision workspace access request is waiting for review.\n\n"
        f"Email: {email}\n"
        f"Requested: {requested}\n\n"
        "Sign in to the PetroVision administrator workspace to approve or decline this request."
    )

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as client:
            if settings.smtp_starttls:
                client.starttls(context=ssl.create_default_context())
            if settings.smtp_username:
                client.login(settings.smtp_username, settings.smtp_password)
            client.send_message(message)
    except (OSError, smtplib.SMTPException):
        log.exception("Could not deliver a registration notification to the configured admin email.")
        return "failed"

    return "sent"
