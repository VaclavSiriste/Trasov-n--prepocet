"""OTP a magic-link tokeny (stejný princip jako Pokladameee)."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Any

CHALLENGE_TTL_MS = 15 * 60 * 1000


def _secret() -> str:
    return os.environ.get("APP_AUTH_SECRET", "local-trasovani-auth-secret")


def _b64url_encode(data: bytes) -> str:
    import base64

    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _b64url_decode(data: str) -> bytes:
    import base64

    pad = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + pad)


def _sign_payload(payload: dict[str, Any]) -> str:
    encoded = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode())
    sig = hmac.new(_secret().encode(), encoded.encode(), hashlib.sha256).digest()
    return f"{encoded}.{_b64url_encode(sig)}"


def verify_signed_payload(token: str | None) -> dict[str, Any] | None:
    if not token or "." not in token:
        return None
    encoded, provided_sig = token.split(".", 1)
    expected_sig = _b64url_encode(
        hmac.new(_secret().encode(), encoded.encode(), hashlib.sha256).digest()
    )
    if not hmac.compare_digest(provided_sig, expected_sig):
        return None
    try:
        return json.loads(_b64url_decode(encoded))
    except (ValueError, json.JSONDecodeError):
        return None


def generate_login_code() -> str:
    return f"{secrets.randbelow(900000) + 100000}"


def _hash_code(code: str) -> str:
    digest = hashlib.sha256(str(code).strip().encode()).digest()
    return _b64url_encode(digest)


def create_code_challenge(email: str, code: str) -> str:
    return _sign_payload({
        "type": "code",
        "email": email,
        "codeHash": _hash_code(code),
        "exp": int(time.time() * 1000) + CHALLENGE_TTL_MS,
    })


def verify_code_challenge(challenge_id: str, code: str, email: str) -> bool:
    payload = verify_signed_payload(challenge_id)
    if not payload or payload.get("type") != "code":
        return False
    if payload.get("email") != email:
        return False
    if int(payload.get("exp") or 0) < int(time.time() * 1000):
        return False
    return _hash_code(code) == payload.get("codeHash")


def create_magic_login_token(email: str, next_path: str = "/") -> str:
    safe_next = next_path if isinstance(next_path, str) and next_path.startswith("/") else "/"
    return _sign_payload({
        "type": "magic",
        "email": email,
        "next": safe_next,
        "exp": int(time.time() * 1000) + CHALLENGE_TTL_MS,
    })


def verify_magic_login_token(token: str | None) -> dict[str, Any] | None:
    payload = verify_signed_payload(token)
    if not payload or payload.get("type") != "magic":
        return None
    if int(payload.get("exp") or 0) < int(time.time() * 1000):
        return None
    return payload
