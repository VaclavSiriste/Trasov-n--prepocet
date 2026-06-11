"""Odeslání přihlašovacího e-mailu přes SMTP."""

from __future__ import annotations

import os
import smtplib
import ssl
from email.header import Header
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr, parseaddr
from urllib.parse import urlencode


def _format_from_header(from_value: str, fallback_user: str) -> tuple[str, str]:
    """Vrátí (From hlavička, envelope adresa). Seznam SMTP vyžaduje RFC 2047 u diakritiky."""
    raw = (from_value or fallback_user).strip()
    name, addr = parseaddr(raw)
    if not addr:
        addr = fallback_user
    header = formataddr((name, addr)) if name else addr
    return header, addr


def _smtp_config() -> dict | None:
    host = (os.environ.get("SMTP_HOST") or "").strip()
    user = (os.environ.get("SMTP_USER") or "").strip()
    password = (os.environ.get("SMTP_PASS") or "").strip()
    if not host or not user or not password:
        return None
    port = int(os.environ.get("SMTP_PORT") or 587)
    from_header, envelope_from = _format_from_header(
        (os.environ.get("SMTP_FROM") or "").strip(),
        user,
    )
    return {
        "host": host,
        "port": port,
        "user": user,
        "password": password,
        "from_header": from_header,
        "envelope_from": envelope_from,
    }


def is_email_configured() -> bool:
    return _smtp_config() is not None


def app_url() -> str:
    return (os.environ.get("APP_URL") or "").strip().rstrip("/")


def build_magic_login_url(token: str, next_path: str = "/") -> str:
    base = app_url() or "http://127.0.0.1:8080"
    params = {"token": token}
    if next_path and next_path != "/":
        params["next"] = next_path
    return f"{base}/api/auth/verify?{urlencode(params)}"


def send_login_email(email: str, code: str, magic_url: str) -> dict:
    smtp = _smtp_config()
    if not smtp:
        is_prod = bool(os.environ.get("RAILWAY_ENVIRONMENT")) or os.environ.get("NODE_ENV") == "production"
        if is_prod:
            raise RuntimeError("SMTP není nakonfigurované (SMTP_HOST, SMTP_USER, SMTP_PASS).")
        print(f"[auth] SMTP chybí – kód pro {email}: {code}")
        print(f"[auth] Magic link: {magic_url}")
        return {"delivered": False, "devMode": True}

    subject = f"Přihlášení – Trasování – kód {code}"
    text = "\n".join([
        "Dobrý den,",
        "",
        f"váš přihlašovací kód je: {code}",
        "Platnost kódu je 15 minut.",
        "",
        "Nebo se přihlaste jedním kliknutím:",
        magic_url,
        "",
        "Pokud jste o přihlášení nežádali, tento e-mail ignorujte.",
    ])
    html = (
        '<div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#061428">'
        "<p>Dobrý den,</p>"
        "<p>váš přihlašovací kód pro <strong>Trasování – reporting</strong>:</p>"
        f'<p style="font-size:28px;font-weight:700;letter-spacing:4px;color:#3b82f6">{code}</p>'
        "<p>Platnost kódu je <strong>15 minut</strong>.</p>"
        f'<p><a href="{magic_url}" style="display:inline-block;padding:12px 18px;'
        'background:#3b82f6;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">'
        "Přihlásit se jedním kliknutím</a></p>"
        f'<p style="font-size:12px;color:#64748b">Pokud tlačítko nefunguje: {magic_url}</p>'
        "</div>"
    )

    msg = MIMEMultipart("alternative")
    msg["Subject"] = Header(subject, "utf-8")
    msg["From"] = smtp["from_header"]
    msg["To"] = email
    msg.attach(MIMEText(text, "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))
    envelope_from = smtp["envelope_from"]

    if smtp["port"] == 465:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(smtp["host"], smtp["port"], context=context) as server:
            server.login(smtp["user"], smtp["password"])
            server.sendmail(envelope_from, [email], msg.as_string())
    else:
        with smtplib.SMTP(smtp["host"], smtp["port"]) as server:
            server.starttls(context=ssl.create_default_context())
            server.login(smtp["user"], smtp["password"])
            server.sendmail(envelope_from, [email], msg.as_string())

    return {"delivered": True, "devMode": False}
