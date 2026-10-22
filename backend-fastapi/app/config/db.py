import os
import re
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from psycopg import AsyncConnection
from psycopg.adapt import Loader
from psycopg.rows import dict_row
from psycopg.types.string import TextLoader
from psycopg_pool import AsyncConnectionPool

from app.config import env  # noqa: F401  (loads .env first)
from app.utils.js import to_pg

if not os.getenv("DATABASE_URL"):
    print("❌ ERROR: DATABASE_URL is not defined in .env")

# ── Result types identical to node-pg ─────────────────────────────────────────
# node-pg returns NUMERIC/BIGINT/UUID as strings and TIMESTAMP as a JS Date
# (serialised as an ISO string in UTC). The frontend depends on those shapes.

_TS_RE = re.compile(
    r"(\d{4,})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?)?"
    r"(?:(Z)|([+-])(\d{2})(?::?(\d{2}))?(?::?(\d{2}))?)?( BC)?"
)


def _iso(dt: datetime) -> str:
    dt = dt.astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def _pg_datetime_to_iso(text: str):
    m = _TS_RE.fullmatch(text)
    if not m or m.group(13):
        return text  # infinity / BC dates: pass through untouched
    y, mo, d, h, mi, s, frac, z, sign, oh, om, os_, _ = m.groups()
    ms = int((frac or "0")[:3].ljust(3, "0"))
    naive = datetime(int(y), int(mo), int(d), int(h or 0), int(mi or 0), int(s or 0), ms * 1000)
    if z:
        return _iso(naive.replace(tzinfo=timezone.utc))
    if sign:
        offset = timedelta(hours=int(oh), minutes=int(om or 0), seconds=int(os_ or 0))
        return _iso(naive.replace(tzinfo=timezone(offset if sign == "+" else -offset)))
    return _iso(naive.astimezone())  # no zone: interpreted in the server's local time


class _JsDateLoader(Loader):
    def load(self, data):
        return _pg_datetime_to_iso(bytes(data).decode())


def _register_loaders(adapters):
    for name in ("numeric", "int8", "uuid"):
        adapters.register_loader(name, TextLoader)
    for name in ("timestamp", "timestamptz", "date"):
        adapters.register_loader(name, _JsDateLoader)


def _connect_kwargs():
    kwargs = {"autocommit": True, "prepare_threshold": None}
    url = os.getenv("DATABASE_URL") or ""
    if "sslmode=" not in url:
        # ssl: production ? { rejectUnauthorized: false } : false
        kwargs["sslmode"] = "require" if os.getenv("NODE_ENV") == "production" else "disable"
    return kwargs


async def _configure(conn: AsyncConnection):
    _register_loaders(conn.adapters)
    print("✅ PostgreSQL connected")


pool = AsyncConnectionPool(
    conninfo=os.getenv("DATABASE_URL") or "",
    kwargs=_connect_kwargs(),
    configure=_configure,
    min_size=1,
    max_size=10,
    timeout=10,
    open=False,
)


def _to_psycopg(sql: str, params):
    # Keep the $1..$n placeholders of the original queries; a reused $n maps to
    # the same bound parameter, as in node-pg
    converted = re.sub(r"\$(\d+)", lambda m: f"%(p{m.group(1)})s", sql.replace("%", "%%"))
    return converted, {f"p{i + 1}": to_pg(v) for i, v in enumerate(params)}


async def query(sql: str, params=()):
    """pool.query(sql, params) → object with `.rows` (list of dicts)."""
    text, args = _to_psycopg(sql, params)
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(text, args if args else None)
            rows = await cur.fetchall() if cur.description else []
    return SimpleNamespace(rows=rows)


async def connect() -> AsyncConnection:
    """A standalone connection (used by migrations)."""
    conn = await AsyncConnection.connect(os.getenv("DATABASE_URL") or "", **_connect_kwargs())
    _register_loaders(conn.adapters)
    print("✅ PostgreSQL connected")
    return conn
