import math
import os
import re
import time
import traceback

import bcrypt
import httpx
import jwt
from fastapi import Request
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from starlette.concurrency import run_in_threadpool

from app.config import db
from app.utils import js
from app.utils.http import body, send

_google_request = google_requests.Request()
_http = httpx.AsyncClient(timeout=15)

# ── jsonwebtoken's `expiresIn` (parsed with the `ms` package) ────────────────
_MS_RE = re.compile(
    r"(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m"
    r"|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?",
    re.IGNORECASE | re.ASCII,
)
_S, _M, _H, _D = 1000, 60_000, 3_600_000, 86_400_000
_UNITS = {
    "y": _D * 365.25, "yr": _D * 365.25, "yrs": _D * 365.25, "year": _D * 365.25, "years": _D * 365.25,
    "w": _D * 7, "week": _D * 7, "weeks": _D * 7,
    "d": _D, "day": _D, "days": _D,
    "h": _H, "hr": _H, "hrs": _H, "hour": _H, "hours": _H,
    "m": _M, "min": _M, "mins": _M, "minute": _M, "minutes": _M,
    "s": _S, "sec": _S, "secs": _S, "second": _S, "seconds": _S,
    "ms": 1, "msec": 1, "msecs": 1, "millisecond": 1, "milliseconds": 1,
}


def _timespan_ms(value: str) -> float:
    m = _MS_RE.fullmatch(value) if len(value) <= 100 else None
    if not m:
        raise ValueError('"expiresIn" should be a number of seconds or string representing a timespan')
    return float(m.group(1)) * _UNITS[(m.group(2) or "ms").lower()]


def generate_token(user_id) -> str:
    secret = os.getenv("JWT_SECRET")
    if not secret:
        raise ValueError("secretOrPrivateKey must have a value")
    iat = math.floor(time.time())
    exp = math.floor(iat + _timespan_ms(os.getenv("JWT_EXPIRES_IN") or "7d") / 1000)
    # Same claims, header and HS256 signature as jsonwebtoken's jwt.sign({ userId }, secret, { expiresIn })
    return jwt.encode({"userId": user_id, "iat": iat, "exp": exp}, secret, algorithm="HS256")


# ── bcryptjs ──────────────────────────────────────────────────────────────────
def _password_bytes(password) -> bytes:
    if not isinstance(password, str):
        raise TypeError("Illegal arguments")
    return password.encode("utf-8")[:72]  # bcrypt only uses the first 72 bytes


async def _hash_password(password) -> str:
    data = _password_bytes(password)
    # $2a$ prefix and cost 12, exactly like bcryptjs.hash(password, 12)
    salt = bcrypt.gensalt(12, prefix=b"2a")
    return (await run_in_threadpool(bcrypt.hashpw, data, salt)).decode()


async def _check_password(password, hashed) -> bool:
    data = _password_bytes(password)
    return await run_in_threadpool(bcrypt.checkpw, data, js.to_string(hashed).encode())


def _log_error(label: str):
    print(f"{label}:", traceback.format_exc())


# ── Handlers ──────────────────────────────────────────────────────────────────
async def register(request: Request):
    b = body(request)
    name, email, password = b.get("name"), b.get("email"), b.get("password")
    if not js.truthy(name) or not js.truthy(email) or not js.truthy(password):
        return send(400, {"error": "Name, email and password are required"})
    pw_length = js.length(password)
    if pw_length is not None and pw_length < 6:
        return send(400, {"error": "Password must be at least 6 characters"})

    try:
        existing = await db.query("SELECT id FROM users WHERE email = $1", [js.lower(email)])
        if existing.rows:
            return send(409, {"error": "Email already registered"})

        hashed = await _hash_password(password)
        result = await db.query(
            "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, avatar_url",
            [js.trim(name), js.lower(email), hashed],
        )

        user = result.rows[0]
        token = generate_token(user["id"])
        return send(201, {"token": token, "user": user})
    except Exception:
        _log_error("Register error")
        return send(500, {"error": "Registration failed"})


async def login(request: Request):
    b = body(request)
    email, password = b.get("email"), b.get("password")
    if not js.truthy(email) or not js.truthy(password):
        return send(400, {"error": "Email and password are required"})

    try:
        result = await db.query(
            "SELECT id, name, email, password_hash, avatar_url, gemini_api_key FROM users WHERE email = $1",
            [js.lower(email)],
        )

        if not result.rows:
            return send(401, {"error": "Invalid email or password"})

        user = result.rows[0]
        if not user["password_hash"]:
            return send(401, {"error": "This account uses Google sign-in"})

        valid = await _check_password(password, user["password_hash"])
        if not valid:
            return send(401, {"error": "Invalid email or password"})

        token = generate_token(user["id"])
        safe_user = {k: v for k, v in user.items() if k != "password_hash"}
        return send(200, {"token": token, "user": safe_user})
    except Exception:
        _log_error("Login error")
        return send(500, {"error": "Login failed"})


async def _get_google_profile(credential, access_token) -> dict:
    """Resolves a verified Google profile from either an ID token (Google's rendered
    button / One Tap) or an OAuth access token (custom button via the popup flow)."""
    client_id = os.getenv("GOOGLE_CLIENT_ID")

    if js.truthy(credential):
        payload = await run_in_threadpool(
            id_token.verify_oauth2_token,
            credential,
            _google_request,
            client_id,
            300,  # google-auth-library's default clock skew
        )
        return {
            "sub": payload.get("sub"),
            "email": payload.get("email"),
            "emailVerified": payload.get("email_verified") is True,
            "name": payload.get("name"),
            "picture": payload.get("picture"),
        }

    # Access tokens aren't self-verifying: confirm it was issued to this app, or a
    # token minted for some other site could be replayed here to log in as its user
    r = await _http.get("https://oauth2.googleapis.com/tokeninfo", params={"access_token": access_token})
    r.raise_for_status()
    info = r.json()
    if info.get("aud") != client_id:
        raise ValueError("Access token was issued for a different client")
    r = await _http.get(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        headers={"Authorization": f"Bearer {js.to_string(access_token)}"},
    )
    if not r.is_success:
        raise ValueError(f"Google userinfo failed with {r.status_code}")
    profile = r.json()
    if profile.get("sub") != info.get("sub"):
        raise ValueError("Google token subject mismatch")
    return {
        "sub": profile.get("sub"),
        "email": profile.get("email"),
        "emailVerified": profile.get("email_verified") is True,
        "name": profile.get("name"),
        "picture": profile.get("picture"),
    }


async def google_auth(request: Request):
    b = body(request)
    credential, access_token = b.get("credential"), b.get("access_token")
    if not js.truthy(credential) and not js.truthy(access_token):
        return send(400, {"error": "Google credential required"})

    try:
        profile = await _get_google_profile(credential, access_token)
        google_id, email, name, picture = profile["sub"], profile["email"], profile["name"], profile["picture"]
        # Accounts are linked by email below, so only trust addresses Google has verified
        if not js.truthy(email) or not profile["emailVerified"]:
            return send(401, {"error": "Your Google email address is not verified"})

        fields = "id, name, email, avatar_url, gemini_api_key"
        result = await db.query(f"SELECT {fields} FROM users WHERE google_id = $1", [google_id])

        if not result.rows:
            result = await db.query(f"SELECT {fields} FROM users WHERE email = $1", [js.lower(email)])
            if result.rows:
                await db.query(
                    "UPDATE users SET google_id = $1, avatar_url = $2 WHERE id = $3",
                    [google_id, picture, result.rows[0]["id"]],
                )
                result = await db.query(f"SELECT {fields} FROM users WHERE id = $1", [result.rows[0]["id"]])
            else:
                result = await db.query(
                    f"INSERT INTO users (name, email, google_id, avatar_url) VALUES ($1, $2, $3, $4) RETURNING {fields}",
                    [name, js.lower(email), google_id, picture],
                )

        user = result.rows[0]
        token = generate_token(user["id"])
        return send(200, {"token": token, "user": user})
    except Exception:
        _log_error("Google auth error")
        return send(401, {"error": "Google authentication failed"})


async def get_me(request: Request):
    return send(200, {"user": request.state.user})


async def update_api_key(request: Request):
    gemini_api_key = body(request).get("gemini_api_key")
    try:
        await db.query(
            "UPDATE users SET gemini_api_key = $1, updated_at = NOW() WHERE id = $2",
            [gemini_api_key if js.truthy(gemini_api_key) else None, request.state.user["id"]],
        )
        return send(200, {"message": "API key updated"})
    except Exception:
        return send(500, {"error": "Failed to update API key"})
