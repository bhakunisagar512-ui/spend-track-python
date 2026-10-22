from fastapi import APIRouter, Depends

from app.controllers.expense_controller import (
    create_expense,
    delete_expense,
    get_daily,
    get_expenses,
    get_stats,
    update_expense,
)
from app.middleware.auth import auth_middleware

PREFIX = "/api/expenses"

router = APIRouter(prefix=PREFIX, dependencies=[Depends(auth_middleware)])

router.add_api_route("", get_expenses, methods=["GET"])
router.add_api_route("", create_expense, methods=["POST"])
router.add_api_route("/{id}", update_expense, methods=["PUT"])
router.add_api_route("/{id}", delete_expense, methods=["DELETE"])
router.add_api_route("/stats/summary", get_stats, methods=["GET"])
router.add_api_route("/stats/daily", get_daily, methods=["GET"])
