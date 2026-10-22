from fastapi import Request

from app.config import db
from app.utils import js
from app.utils.http import body, send


async def get_budgets(request: Request):
    try:
        result = await db.query(
            "SELECT * FROM budgets WHERE user_id = $1 ORDER BY category", [request.state.user["id"]]
        )
        return send(200, {"budgets": result.rows})
    except Exception:
        return send(500, {"error": "Failed to fetch budgets"})


async def upsert_budget(request: Request):
    b = body(request)
    category, amount = b.get("category"), b.get("amount")
    if not js.truthy(category) or not js.truthy(amount) or js.is_nan(amount) or js.to_number(amount) <= 0:
        return send(400, {"error": "Valid category and amount required"})
    try:
        result = await db.query(
            """INSERT INTO budgets (user_id, category, amount)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, category)
       DO UPDATE SET amount = $3, updated_at = NOW()
       RETURNING *""",
            [request.state.user["id"], category, js.parse_float(amount)],
        )
        return send(200, {"budget": result.rows[0]})
    except Exception:
        return send(500, {"error": "Failed to save budget"})


async def delete_budget(request: Request, category: str):
    try:
        await db.query(
            "DELETE FROM budgets WHERE user_id = $1 AND category = $2", [request.state.user["id"], category]
        )
        return send(200, {"message": "Budget removed"})
    except Exception:
        return send(500, {"error": "Failed to delete budget"})
