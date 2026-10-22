"""Helpers that reproduce the JavaScript semantics the Express backend relied on
(truthiness, Number()/isNaN/parseFloat/parseInt coercion, String.trim, and how
node-pg serialises query parameters), so request validation and stored values
behave identically in the FastAPI port."""
import json
import math
import re
from datetime import datetime
from decimal import Decimal

NAN = float("nan")

_NUMBER_RE = re.compile(r"[+-]?(?:Infinity|(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?)")
_RADIX_RE = re.compile(r"0([xX][0-9a-fA-F]+|[oO][0-7]+|[bB][01]+)")
_WS = "[\\s﻿]"


def _to_float(s: str) -> float:
    try:
        return float(s.replace("Infinity", "inf"))
    except OverflowError:
        return math.inf if not s.startswith("-") else -math.inf


def _int_to_float(n: int) -> float:
    try:
        return float(n)
    except OverflowError:
        return math.inf if n > 0 else -math.inf


def trim_start(s: str) -> str:
    return re.sub(f"^{_WS}+", "", s)


def trim(value) -> str:
    """String.prototype.trim — raises TypeError for non-strings like JS would."""
    if not isinstance(value, str):
        raise TypeError("trim is not a function")
    return re.sub(f"^{_WS}+|{_WS}+$", "", value)


def lower(value) -> str:
    """String.prototype.toLowerCase — raises TypeError for non-strings."""
    if not isinstance(value, str):
        raise TypeError("toLowerCase is not a function")
    return value.lower()


def length(value):
    """`value.length` — UTF-16 length for strings, None (undefined) for scalars."""
    if isinstance(value, str):
        return len(value.encode("utf-16-le")) // 2
    if isinstance(value, list):
        return len(value)
    return None


def truthy(value) -> bool:
    if value is None or value is False:
        return False
    if isinstance(value, bool):
        return True
    if isinstance(value, (int, float)):
        return not (value == 0 or (isinstance(value, float) and math.isnan(value)))
    if isinstance(value, str):
        return value != ""
    return True  # objects and arrays, even empty ones


def number_to_string(x) -> str:
    """Number.prototype.toString()"""
    if isinstance(x, bool):
        return "true" if x else "false"
    if isinstance(x, int):
        return str(x)
    if math.isnan(x):
        return "NaN"
    if math.isinf(x):
        return "Infinity" if x > 0 else "-Infinity"
    if x == 0:
        return "0"
    if x.is_integer() and abs(x) < 1e21:
        return str(int(x))
    r = repr(x)
    if 1e-6 <= abs(x) < 1e21:
        return format(Decimal(r), "f")
    mantissa, exp = r.split("e")
    sign = "-" if exp.startswith("-") else "+"
    return f"{mantissa}e{sign}{exp.lstrip('+-').lstrip('0') or '0'}"


def to_string(value) -> str:
    """String(value)"""
    if value is None:
        return "null"
    if isinstance(value, (bool, int, float)):
        return number_to_string(value)
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return ",".join("" if v is None else to_string(v) for v in value)
    return "[object Object]"


def to_number(value) -> float:
    """Number(value) / the implicit coercion done by `<=`, `isNaN`, etc."""
    if value is None:
        return 0.0
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    if isinstance(value, int):
        return _int_to_float(value)
    if isinstance(value, float):
        return value
    s = trim(to_string(value)) if not isinstance(value, str) else trim(value)
    if s == "":
        return 0.0
    if _NUMBER_RE.fullmatch(s):
        return _to_float(s)
    m = _RADIX_RE.fullmatch(s)
    if m:
        base = {"x": 16, "o": 8, "b": 2}[m.group(1)[0].lower()]
        return _int_to_float(int(m.group(1)[1:], base))
    return NAN


def is_nan(value) -> bool:
    return math.isnan(to_number(value))


def parse_float(value) -> float:
    s = trim_start(to_string(value))
    m = _NUMBER_RE.match(s)
    return _to_float(m.group(0)) if m else NAN


def parse_int(value):
    s = trim_start(to_string(value))
    sign = 1
    if s[:1] in ("+", "-"):
        sign = -1 if s[0] == "-" else 1
        s = s[1:]
    if s[:2] in ("0x", "0X"):
        m = re.match(r"[0-9a-fA-F]+", s[2:])
        return sign * int(m.group(0), 16) if m else NAN
    m = re.match(r"[0-9]+", s)
    return sign * int(m.group(0)) if m else NAN


def _date_to_pg(d: datetime) -> str:
    if d.tzinfo is None:
        d = d.astimezone()
    return d.isoformat(timespec="milliseconds")


def _array_to_pg(values) -> str:
    out = []
    for v in values:
        if v is None:
            out.append("NULL")
        elif isinstance(v, list):
            out.append(_array_to_pg(v))
        else:
            s = to_pg(v)
            out.append('"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"')
    return "{" + ",".join(out) + "}"


def to_pg(value):
    """node-pg's prepareValue: every parameter is sent as untyped text so Postgres
    infers the type from context, exactly as the Express backend's queries did."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return _date_to_pg(value)
    if isinstance(value, list):
        return _array_to_pg(value)
    if isinstance(value, dict):
        return json.dumps(value, separators=(",", ":"), ensure_ascii=False)
    return to_string(value)
