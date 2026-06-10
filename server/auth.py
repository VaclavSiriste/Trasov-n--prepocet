"""Session cookie auth (stejný princip jako Pokladameee)."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from http.cookies import SimpleCookie
from typing import Any
from urllib.parse import unquote

AUTH_COOKIE_NAME = "trasovani_auth"
AUTH_DURATION_SEC = 12 * 60 * 60
DEFAULT_DOMAINS = ("zaluzieee.cz", "demaxia.cz", "pokladameee.cz")


def _secret() -> str:
    return os.environ.get("APP_AUTH_SECRET", "local-trasovani-auth-secret")


def _allowed_domains() -> list[str]:
    raw = os.environ.get("AUTH_ALLOWED_DOMAINS", "").strip()
    if raw:
        return [d.strip().lower() for d in raw.split(",") if d.strip()]
    return list(DEFAULT_DOMAINS)


def allowed_domains_label() -> str:
    return " nebo ".join(f"@{d}" for d in _allowed_domains())


def is_allowed_email(email: str) -> bool:
    if not isinstance(email, str):
        return False
    normalized = email.strip().lower()
    domain = normalized.split("@")[-1] if "@" in normalized else ""
    return domain in _allowed_domains()


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _b64url_decode(data: str) -> bytes:
    pad = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + pad)


def _sign(value: str) -> str:
    digest = hmac.new(_secret().encode(), value.encode(), hashlib.sha256).digest()
    return _b64url_encode(digest)


def create_auth_token(email: str) -> str:
    payload = {
        "email": email.strip().lower(),
        "exp": int(time.time() * 1000) + AUTH_DURATION_SEC * 1000,
    }
    encoded = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode())
    return f"{encoded}.{_sign(encoded)}"


def verify_auth_token(token: str | None) -> dict[str, Any] | None:
    if not token or "." not in token:
        return None
    encoded, provided_sig = token.split(".", 1)
    expected_sig = _sign(encoded)
    if not hmac.compare_digest(provided_sig, expected_sig):
        return None
    try:
        payload = json.loads(_b64url_decode(encoded))
        email = payload.get("email")
        exp = int(payload.get("exp") or 0)
        if not email or not is_allowed_email(email):
            return None
        if exp < int(time.time() * 1000):
            return None
        return {"email": email, "exp": exp}
    except (ValueError, json.JSONDecodeError, TypeError):
        return None


def build_auth_cookie(token: str) -> str:
    secure = "; Secure" if os.environ.get("RAILWAY_ENVIRONMENT") or os.environ.get("NODE_ENV") == "production" else ""
    return (
        f"{AUTH_COOKIE_NAME}={token}; Path=/; HttpOnly; SameSite=Lax; "
        f"Max-Age={AUTH_DURATION_SEC}{secure}"
    )


def build_logout_cookie() -> str:
    secure = "; Secure" if os.environ.get("RAILWAY_ENVIRONMENT") or os.environ.get("NODE_ENV") == "production" else ""
    return f"{AUTH_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0{secure}"


def parse_cookies(header: str | None) -> dict[str, str]:
    out: dict[str, str] = {}
    if not header:
        return out
    cookie = SimpleCookie()
    cookie.load(header)
    for key, morsel in cookie.items():
        out[key] = unquote(morsel.value)
    return out


def get_session_from_headers(headers) -> dict[str, Any] | None:
    cookies = parse_cookies(headers.get("Cookie"))
    return verify_auth_token(cookies.get(AUTH_COOKIE_NAME))
