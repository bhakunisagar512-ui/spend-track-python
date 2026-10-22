import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import env  # noqa: F401  (loads .env first, like require('dotenv').config())
from app.config import db
from app.middleware.auth import auth_middleware
from app.middleware.express import (
    BodyParserMiddleware,
    CORSMiddleware,
    ErrorHandlerMiddleware,
    ExpressRoutingMiddleware,
    HelmetMiddleware,
    RateLimitMiddleware,
    _mounted,
)
from app.routes import auth, budgets, expenses
from app.utils.http import ApiError, JsJSONResponse, send

PORT = os.getenv("PORT") or 5000


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await db.pool.open(wait=False)
    print(f"🚀 Server running on port {PORT}")
    yield
    await db.pool.close()


app = FastAPI(
    lifespan=lifespan,
    default_response_class=JsJSONResponse,
    redirect_slashes=False,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

# Starlette runs the last-added middleware first, so these are listed innermost
# → outermost. Request order matches index.js:
#   helmet → cors → express.json → /api limiter → /api/auth limiter → routes → error handler
app.add_middleware(ErrorHandlerMiddleware)
app.add_middleware(
    RateLimitMiddleware,
    limiters=[
        dict(prefix="/api", window_ms=15 * 60 * 1000, max_hits=100, message={"error": "Too many requests"}),
        dict(prefix="/api/auth", window_ms=15 * 60 * 1000, max_hits=20, message={"error": "Too many auth attempts"}),
    ],
)
app.add_middleware(BodyParserMiddleware)
app.add_middleware(ExpressRoutingMiddleware)
app.add_middleware(CORSMiddleware, origin=os.getenv("CLIENT_URL") or "http://localhost:3000")
app.add_middleware(HelmetMiddleware)


@app.exception_handler(ApiError)
async def api_error_handler(_request: Request, exc: ApiError):
    return send(exc.status, {"error": exc.message})


@app.exception_handler(StarletteHTTPException)
async def not_found_handler(request: Request, exc: StarletteHTTPException):
    if exc.status_code not in (404, 405):
        return send(exc.status_code, {"error": exc.detail})
    # router.use(authMiddleware) runs before route matching in Express, so unknown
    # paths under the protected routers still answer 401 without a valid token
    if any(_mounted(request.url.path, p) for p in (expenses.PREFIX, budgets.PREFIX)):
        try:
            await auth_middleware(request)
        except ApiError as err:
            return send(err.status, {"error": err.message})
    return send(404, {"error": "Route not found"})


@app.get("/health")
async def health():
    now = datetime.now(timezone.utc)
    return {"status": "ok", "timestamp": now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"}


app.include_router(auth.router)
app.include_router(expenses.router)
app.include_router(budgets.router)
