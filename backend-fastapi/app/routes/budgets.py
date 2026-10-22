from urllib.parse import unquote

from fastapi import APIRouter, Depends, Request
from starlette.exceptions import HTTPException

from app.controllers.budget_controller import delete_budget, get_budgets, upsert_budget
from app.middleware.auth import auth_middleware

PREFIX = "/api/budgets"

router = APIRouter(prefix=PREFIX, dependencies=[Depends(auth_middleware)])


async def _delete_budget(request: Request):
    # Express matches `/:category` on the raw path and then decodes it, so an
    # encoded slash ("Food%2FDrinks") is part of the category but a literal one
    # is a different route. The ASGI path is already decoded, so use raw_path.
    raw = (request.scope.get("raw_path") or request.url.path.encode()).decode("latin-1").split("?")[0]
    segment = raw[len(PREFIX) + 1:]
    if not segment or "/" in segment:
        raise HTTPException(404)
    category = unquote(segment, errors="strict")  # malformed escapes fail like decodeURIComponent
    return await delete_budget(request, category)


router.add_api_route("", get_budgets, methods=["GET"])
router.add_api_route("", upsert_budget, methods=["POST"])
router.add_api_route("/{category:path}", _delete_budget, methods=["DELETE"])
