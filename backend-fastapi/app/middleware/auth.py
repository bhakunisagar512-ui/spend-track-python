import os

import jwt
from fastapi import Request

from app.config import db
from app.utils.http import ApiError

# jsonwebtoken accepts any HMAC algorithm for a shared secret
_ALGORITHMS = ["HS256", "HS384", "HS512"]


async def auth_middleware(request: Request):
    auth_header = request.headers.get("authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise ApiError(401, "No token provided")

    try:
        token = auth_header.split(" ")[1]
        decoded = jwt.decode(
            token,
            os.getenv("JWT_SECRET"),
            algorithms=_ALGORITHMS,
            options={"verify_aud": False, "verify_iat": False},
        )

        result = await db.query(
            "SELECT id, name, email, avatar_url, gemini_api_key FROM users WHERE id = $1",
            [decoded.get("userId")],
        )
    except jwt.ExpiredSignatureError:
        raise ApiError(401, "Token expired")
    except Exception:
        raise ApiError(401, "Invalid token")

    if not result.rows:
        raise ApiError(401, "User not found")

    request.state.user = result.rows[0]
