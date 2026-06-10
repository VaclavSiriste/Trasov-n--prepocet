"""HTTP handlery pro /api/auth/*."""

from __future__ import annotations

import json
import os
from urllib.parse import parse_qs, quote, urlparse

from auth import (
    allowed_domains_label,
    build_auth_cookie,
    build_logout_cookie,
    create_auth_token,
    get_session_from_headers,
    is_allowed_email,
)
from auth_challenge import (
    create_code_challenge,
    create_magic_login_token,
    generate_login_code,
    verify_code_challenge,
    verify_magic_login_token,
)
from auth_email import app_url, build_magic_login_url, is_email_configured, send_login_email


def _is_prod() -> bool:
    return bool(os.environ.get("RAILWAY_ENVIRONMENT")) or os.environ.get("NODE_ENV") == "production"


def _json(handler, code: int, payload: dict) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(code)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def _redirect(handler, location: str, cookies: list[str] | None = None) -> None:
    handler.send_response(303)
    handler.send_header("Location", location)
    for cookie in cookies or []:
        handler.send_header("Set-Cookie", cookie)
    handler.end_headers()


def handle_auth_get(handler, path: str, query: str) -> bool:
    qs = parse_qs(query)

    if path == "/api/auth/session":
        session = get_session_from_headers(handler.headers)
        if not session:
            _json(handler, 200, {"ok": False})
        else:
            _json(handler, 200, {"ok": True, "email": session["email"]})
        return True

    if path == "/api/auth/env-status":
        url = app_url()
        _json(handler, 200, {
            "smtpReady": is_email_configured(),
            "allowedDomains": allowed_domains_label(),
            "appUrlReady": bool(url),
            "authSecretReady": bool((os.environ.get("APP_AUTH_SECRET") or "").strip()),
            "authDisabled": auth_disabled(),
            "hint": (
                "Na serveru nastavte SMTP_HOST, SMTP_USER, SMTP_PASS."
                if not is_email_configured() else
                "Nastavte APP_URL na veřejnou adresu aplikace."
                if not url else None
            ),
        })
        return True

    if path == "/api/auth/verify":
        token = (qs.get("token") or [""])[0]
        next_path = (qs.get("next") or ["/"])[0]
        if not next_path.startswith("/"):
            next_path = "/"
        payload = verify_magic_login_token(token)
        if not payload or not is_allowed_email(payload.get("email", "")):
            err = quote("Odkaz je neplatný nebo vypršel.")
            _redirect(handler, f"/login.html?error={err}")
            return True
        dest = payload.get("next") or next_path
        if not str(dest).startswith("/"):
            dest = "/"
        _redirect(handler, dest, [build_auth_cookie(create_auth_token(payload["email"]))])
        return True

    if path in ("/api/auth/logout", "/api/logout"):
        _redirect(handler, "/login.html", [build_logout_cookie()])
        return True

    return False


def handle_auth_post(handler, path: str, body: dict) -> bool:
    if path == "/api/auth/request-code":
        email = str(body.get("email") or "").strip().lower()
        next_path = body.get("next") if isinstance(body.get("next"), str) and body["next"].startswith("/") else "/"
        if not is_allowed_email(email):
            _json(handler, 400, {
                "error": f"Povolené jsou pouze e-maily s doménou {allowed_domains_label()}.",
            })
            return True
        try:
            code = generate_login_code()
            challenge_id = create_code_challenge(email, code)
            magic_token = create_magic_login_token(email, next_path)
            magic_url = build_magic_login_url(magic_token, next_path)
            delivery = send_login_email(email, code, magic_url)
            response = {
                "ok": True,
                "message": "Na e-mail jsme odeslali přihlašovací kód a odkaz.",
                "challengeId": challenge_id,
            }
            if delivery.get("devMode") and not _is_prod():
                response["devCode"] = code
                response["devMagicUrl"] = magic_url
            _json(handler, 200, response)
        except Exception as exc:
            print("request-code:", exc)
            _json(handler, 500, {"error": "Nepodařilo se odeslat přihlašovací e-mail. Zkuste to znovu."})
        return True

    if path == "/api/auth/verify-code":
        email = str(body.get("email") or "").strip().lower()
        code = str(body.get("code") or "").strip()
        challenge_id = str(body.get("challengeId") or "")
        if not is_allowed_email(email):
            _json(handler, 400, {
                "error": f"Povolené jsou pouze e-maily s doménou {allowed_domains_label()}.",
            })
            return True
        if not code.isdigit() or len(code) != 6:
            _json(handler, 400, {"error": "Zadejte šestimístný kód z e-mailu."})
            return True
        if not challenge_id or not verify_code_challenge(challenge_id, code, email):
            _json(handler, 401, {"error": "Neplatný nebo expirovaný kód. Požádejte o nový."})
            return True
        next_path = body.get("next") if isinstance(body.get("next"), str) and body["next"].startswith("/") else "/"
        handler.send_response(200)
        handler.send_header("Content-Type", "application/json; charset=utf-8")
        handler.send_header("Set-Cookie", build_auth_cookie(create_auth_token(email)))
        handler.send_header("Access-Control-Allow-Origin", "*")
        body_out = json.dumps({"ok": True, "email": email, "next": next_path}, ensure_ascii=False).encode()
        handler.send_header("Content-Length", str(len(body_out)))
        handler.end_headers()
        handler.wfile.write(body_out)
        return True

    return False


PUBLIC_PATHS = {
    "/login.html",
    "/login.js",
    "/login.css",
    "/api/health",
}


def is_public_path(path: str) -> bool:
    if path in PUBLIC_PATHS:
        return True
    if path.startswith("/api/auth/"):
        return True
    if path in ("/api/logout",):
        return True
    if path.endswith((".js", ".css", ".ico", ".svg", ".woff", ".woff2")):
        return True
    return False


def auth_disabled() -> bool:
    return os.environ.get("AUTH_DISABLED", "").strip().lower() in ("1", "true", "yes")


def require_auth(handler, path: str) -> bool:
    """Vrátí True pokud je request povolený. Jinak pošle redirect/401 a vrátí False."""
    if auth_disabled() or is_public_path(path):
        return True
    session = get_session_from_headers(handler.headers)
    if session:
        handler.user = session
        return True
    if path.startswith("/api/"):
        _json(handler, 401, {"error": "Nejste přihlášeni. Obnovte stránku a přihlaste se."})
        return False
    next_url = quote(handler.path or "/")
    _redirect(handler, f"/login.html?next={next_url}")
    return False
