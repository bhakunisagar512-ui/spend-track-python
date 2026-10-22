"""Pure-ASGI equivalents of the Express middleware stack in backend/src/index.js:
helmet(), cors(), express.json({ limit: '10kb' }), express-rate-limit, Express's
routing quirks (HEAD served by GET routes, optional trailing slash) and the final
`(err, req, res, next)` error handler."""
import json
import logging
import math
import time
import traceback

from starlette.datastructures import Headers, MutableHeaders

from app.utils.http import send as json_response

log = logging.getLogger("spendai")

INTERNAL_ERROR = {"error": "Internal server error"}


async def _respond(scope, receive, send, response):
    await response(scope, receive, send)


def _with_headers(send, add):
    """Wrap `send` so `add(headers)` can edit response headers before they go out."""

    async def wrapper(message):
        if message["type"] == "http.response.start":
            message["headers"] = list(message.get("headers", []))
            add(MutableHeaders(scope=message))
        await send(message)

    return wrapper


def _mounted(path: str, prefix: str) -> bool:
    """Express app.use(prefix) matching: exact or at a segment boundary, case-insensitive."""
    path, prefix = path.lower(), prefix.lower()
    return path == prefix or path.startswith(prefix + "/")


# ── helmet() v7 defaults ──────────────────────────────────────────────────────
HELMET_HEADERS = {
    "Content-Security-Policy": (
        "default-src 'self';base-uri 'self';font-src 'self' https: data:;"
        "form-action 'self';frame-ancestors 'self';img-src 'self' data:;"
        "object-src 'none';script-src 'self';script-src-attr 'none';"
        "style-src 'self' https: 'unsafe-inline';upgrade-insecure-requests"
    ),
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Origin-Agent-Cluster": "?1",
    "Referrer-Policy": "no-referrer",
    "Strict-Transport-Security": "max-age=15552000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "X-DNS-Prefetch-Control": "off",
    "X-Download-Options": "noopen",
    "X-Frame-Options": "SAMEORIGIN",
    "X-Permitted-Cross-Domain-Policies": "none",
    "X-XSS-Protection": "0",
}


class HelmetMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        def add(headers):
            for k, v in HELMET_HEADERS.items():
                if k not in headers:
                    headers[k] = v

        await self.app(scope, receive, _with_headers(send, add))


# ── cors({ origin: CLIENT_URL, credentials: true }) ──────────────────────────
def _vary(headers: MutableHeaders, field: str):
    existing = headers.get("vary")
    if not existing:
        headers["Vary"] = field
    elif existing.strip() != "*" and field.lower() not in [f.strip().lower() for f in existing.split(",")]:
        headers["Vary"] = f"{existing}, {field}"


class CORSMiddleware:
    def __init__(self, app, origin: str):
        self.app = app
        self.origin = origin

    def _common(self, headers: MutableHeaders):
        headers["Access-Control-Allow-Origin"] = self.origin
        _vary(headers, "Origin")
        headers["Access-Control-Allow-Credentials"] = "true"

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        if scope["method"] == "OPTIONS":
            # Preflight: answered here for every path, never reaching the routes
            request_headers = Headers(scope=scope)
            message = {"type": "http.response.start", "status": 204, "headers": []}
            headers = MutableHeaders(scope=message)
            self._common(headers)
            headers["Access-Control-Allow-Methods"] = "GET,HEAD,PUT,PATCH,POST,DELETE"
            # No allowedHeaders configured: reflect the requested ones (always varying on them)
            allow = request_headers.get("access-control-request-headers")
            _vary(headers, "Access-Control-Request-Headers")
            if allow:
                headers["Access-Control-Allow-Headers"] = allow
            headers["Content-Length"] = "0"
            await send(message)
            await send({"type": "http.response.body", "body": b""})
            return

        await self.app(scope, receive, _with_headers(send, self._common))


# ── Express routing quirks ────────────────────────────────────────────────────
class ExpressRoutingMiddleware:
    """HEAD requests are served by GET routes (without a body) and a trailing slash
    is optional, as with Express's default (non-strict) router."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        path = scope["path"]
        if len(path) > 1 and path.endswith("/"):
            scope = dict(scope)
            scope["path"] = path.rstrip("/") or "/"
            raw = scope.get("raw_path")
            if raw:
                scope["raw_path"] = raw.rstrip(b"/") or b"/"

        if scope["method"] != "HEAD":
            return await self.app(scope, receive, send)

        scope = dict(scope)
        scope["method"] = "GET"

        async def head_send(message):
            if message["type"] == "http.response.body":
                message = {**message, "body": b""}
            await send(message)

        await self.app(scope, receive, head_send)


# ── express.json({ limit: '10kb' }) ──────────────────────────────────────────
class BodyParserMiddleware:
    LIMIT = 10 * 1024

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        state = scope.setdefault("state", {})
        state["body"] = {}
        headers = Headers(scope=scope)
        mime = (headers.get("content-type") or "").split(";")[0].strip().lower()
        has_body = "transfer-encoding" in headers or (headers.get("content-length") or "").strip().isdigit()
        if mime != "application/json" or not has_body:
            return await self.app(scope, receive, send)

        try:
            declared = int(headers.get("content-length") or 0)
            if declared > self.LIMIT:
                raise ValueError("request entity too large")
            chunks, size, more = [], 0, True
            while more:
                message = await receive()
                if message["type"] == "http.disconnect":
                    return
                chunk = message.get("body", b"")
                size += len(chunk)
                if size > self.LIMIT:
                    raise ValueError("request entity too large")
                chunks.append(chunk)
                more = message.get("more_body", False)
            raw = b"".join(chunks)
            state["body"] = self._parse(raw)
        except Exception:
            # Express's final error handler turns body-parser errors into a plain 500
            log.error(traceback.format_exc())
            return await _respond(scope, receive, send, json_response(500, INTERNAL_ERROR))

        replayed = False

        async def replay():
            nonlocal replayed
            if not replayed:
                replayed = True
                return {"type": "http.request", "body": raw, "more_body": False}
            return await receive()

        await self.app(scope, replay, send)

    @staticmethod
    def _parse(raw: bytes):
        if not raw:
            return {}
        text = raw.decode("utf-8")
        if text.lstrip(" \t\n\r")[:1] not in ("{", "["):
            raise ValueError("strict JSON body must be an object or array")

        def reject(name):
            raise ValueError(f"Unexpected token {name} in JSON")

        return json.loads(text, parse_constant=reject)


# ── express-rate-limit (in-memory store, per-IP, legacy X-RateLimit-* headers) ─
class _Limiter:
    def __init__(self, prefix: str, window_ms: int, max_hits: int, message: dict):
        self.prefix = prefix
        self.window = window_ms / 1000
        self.max = max_hits
        self.message = message
        self.clients = {}
        self.next_sweep = time.time() + self.window

    def hit(self, key: str):
        now = time.time()
        if now >= self.next_sweep:
            self.clients = {k: v for k, v in self.clients.items() if v[1] > now}
            self.next_sweep = now + self.window
        count, reset_at = self.clients.get(key, (0, 0))
        if reset_at <= now:
            count, reset_at = 0, now + self.window
        count += 1
        self.clients[key] = (count, reset_at)
        return count, reset_at


class RateLimitMiddleware:
    def __init__(self, app, limiters):
        self.app = app
        self.limiters = [_Limiter(**cfg) for cfg in limiters]

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        client = scope.get("client")
        key = client[0] if client else ""
        rate_headers = {}

        for limiter in self.limiters:
            if not _mounted(scope["path"], limiter.prefix):
                continue
            count, reset_at = limiter.hit(key)
            rate_headers = {
                "X-RateLimit-Limit": str(limiter.max),
                "X-RateLimit-Remaining": str(max(limiter.max - count, 0)),
                "X-RateLimit-Reset": str(math.ceil(reset_at)),
            }
            if count > limiter.max:
                response = json_response(429, limiter.message)
                response.headers.update(rate_headers)
                response.headers["Retry-After"] = str(math.ceil(reset_at - time.time()))
                return await _respond(scope, receive, send, response)

        if not rate_headers:
            return await self.app(scope, receive, send)
        await self.app(scope, receive, _with_headers(send, lambda h: h.update(rate_headers)))


# ── app.use((err, req, res, next) => res.status(500)...) ─────────────────────
class ErrorHandlerMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        started = False

        async def tracking_send(message):
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, receive, tracking_send)
        except Exception:
            log.error(traceback.format_exc())
            if not started:
                await _respond(scope, receive, send, json_response(500, INTERNAL_ERROR))
