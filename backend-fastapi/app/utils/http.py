import json
import math
import typing

from fastapi import Request
from starlette.responses import JSONResponse


def _js_jsonable(value):
    """Match JSON.stringify output: NaN/Infinity become null, whole floats print without '.0'."""
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        if value.is_integer() and abs(value) < 1e21:
            return int(value)
        return value
    if isinstance(value, dict):
        return {k: _js_jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_js_jsonable(v) for v in value]
    return value


class JsJSONResponse(JSONResponse):
    media_type = "application/json"

    def render(self, content: typing.Any) -> bytes:
        return json.dumps(
            _js_jsonable(content), ensure_ascii=False, separators=(",", ":")
        ).encode("utf-8")

    def init_headers(self, headers=None):
        super().init_headers(headers)
        # Express sends `application/json; charset=utf-8`
        self.raw_headers = [
            (k, b"application/json; charset=utf-8") if k == b"content-type" else (k, v)
            for k, v in self.raw_headers
        ]


def send(status: int, content) -> JsJSONResponse:
    return JsJSONResponse(content, status_code=status)


class ApiError(Exception):
    """Short-circuits a request with `{ error: message }`, like `res.status(x).json(...)`."""

    def __init__(self, status: int, message: str):
        self.status = status
        self.message = message


def body(request: Request) -> dict:
    """The parsed JSON body (see BodyParserMiddleware). Non-object bodies behave like
    destructuring an array in JS: every field is undefined."""
    parsed = getattr(request.state, "body", None)
    return parsed if isinstance(parsed, dict) else {}
