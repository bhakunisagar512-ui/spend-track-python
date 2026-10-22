import asyncio
import re
import traceback
from datetime import datetime

from fastapi import Request

from app.config import db
from app.utils import js
from app.utils.http import body, send


def _log_error(label: str):
    print(f"{label}:", traceback.format_exc())


async def get_expenses(request: Request):
    q = request.query_params
    month, category = q.get("month"), q.get("category")
    limit, offset = q.get("limit", 100), q.get("offset", 0)
    try:
        query = "SELECT * FROM expenses WHERE user_id = $1"
        params = [request.state.user["id"]]
        idx = 2

        if month:
            query += f" AND TO_CHAR(date, 'YYYY-MM') = ${idx}"
            idx += 1
            params.append(month)
        if category:
            query += f" AND category = ${idx}"
            idx += 1
            params.append(category)

        query += f" ORDER BY date DESC LIMIT ${idx} OFFSET ${idx + 1}"
        params += [js.parse_int(limit), js.parse_int(offset)]

        result = await db.query(query, params)
        return send(200, {"expenses": result.rows})
    except Exception:
        _log_error("Get expenses error")
        return send(500, {"error": "Failed to fetch expenses"})


async def create_expense(request: Request):
    b = body(request)
    amount, description = b.get("amount"), b.get("description")
    category, emoji, date = b.get("category"), b.get("emoji"), b.get("date")
    if not js.truthy(amount) or not js.truthy(description):
        return send(400, {"error": "Amount and description are required"})
    if js.is_nan(amount) or js.to_number(amount) <= 0:
        return send(400, {"error": "Amount must be a positive number"})

    try:
        result = await db.query(
            """INSERT INTO expenses (user_id, amount, description, category, emoji, date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *""",
            [
                request.state.user["id"],
                js.parse_float(amount),
                js.trim(description),
                category if js.truthy(category) else "Other",
                emoji if js.truthy(emoji) else "📦",
                date if js.truthy(date) else datetime.now(),
            ],
        )
        return send(201, {"expense": result.rows[0]})
    except Exception:
        _log_error("Create expense error")
        return send(500, {"error": "Failed to create expense"})


async def update_expense(request: Request, id: str):
    b = body(request)
    try:
        result = await db.query(
            """UPDATE expenses SET amount = COALESCE($1, amount), description = COALESCE($2, description),
       category = COALESCE($3, category), emoji = COALESCE($4, emoji)
       WHERE id = $5 AND user_id = $6 RETURNING *""",
            [b.get("amount"), b.get("description"), b.get("category"), b.get("emoji"), id, request.state.user["id"]],
        )
        if not result.rows:
            return send(404, {"error": "Expense not found"})
        return send(200, {"expense": result.rows[0]})
    except Exception:
        return send(500, {"error": "Failed to update expense"})


async def delete_expense(request: Request, id: str):
    try:
        result = await db.query(
            "DELETE FROM expenses WHERE id = $1 AND user_id = $2 RETURNING id",
            [id, request.state.user["id"]],
        )
        if not result.rows:
            return send(404, {"error": "Expense not found"})
        return send(200, {"message": "Expense deleted"})
    except Exception:
        return send(500, {"error": "Failed to delete expense"})


async def get_stats(request: Request):
    month = request.query_params.get("month")
    user_id = request.state.user["id"]
    try:
        date_filter = ""
        params = [user_id]
        if month:
            date_filter = "AND TO_CHAR(date, 'YYYY-MM') = $2"
            params.append(month)

        totals, by_category, daily, overview, months = await asyncio.gather(
            db.query(f"SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as total, COUNT(DISTINCT date::date) as active_days FROM expenses WHERE user_id = $1 {date_filter}", params),
            db.query(f"SELECT category, MIN(emoji) as emoji, COALESCE(SUM(amount),0) as total, COUNT(*) as count FROM expenses WHERE user_id = $1 {date_filter} GROUP BY category ORDER BY total DESC", params),
            db.query("SELECT TO_CHAR(date,'YYYY-MM-DD') as day, SUM(amount) as total FROM expenses WHERE user_id = $1 AND date >= NOW() - INTERVAL '14 days' GROUP BY day ORDER BY day", [user_id]),
            db.query("SELECT COALESCE(SUM(amount),0) as this_month FROM expenses WHERE user_id = $1 AND TO_CHAR(date, 'YYYY-MM') = TO_CHAR(NOW(), 'YYYY-MM')", [user_id]),
            db.query("SELECT DISTINCT TO_CHAR(date, 'YYYY-MM') as month FROM expenses WHERE user_id = $1 ORDER BY month DESC", [user_id]),
        )

        return send(200, {
            "total": js.parse_float(totals.rows[0]["total"]),
            "count": js.parse_int(totals.rows[0]["count"]),
            "byCategory": by_category.rows,
            "daily": daily.rows,
            "activeDays": js.parse_int(totals.rows[0]["active_days"]),
            "thisMonth": js.parse_float(overview.rows[0]["this_month"]),
            "months": [r["month"] for r in months.rows],
        })
    except Exception:
        _log_error("Stats error")
        return send(500, {"error": "Failed to fetch stats"})


_DAY_RE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")


# Daily totals for an inclusive date range (YYYY-MM-DD), used by the trend chart
async def get_daily(request: Request):
    frm, to = request.query_params.get("from"), request.query_params.get("to")

    def is_day(v):
        return bool(_DAY_RE.fullmatch(v or ""))

    if not is_day(frm) or not is_day(to) or frm > to:
        return send(400, {"error": "Valid from and to dates (YYYY-MM-DD) are required"})
    try:
        result = await db.query(
            """SELECT TO_CHAR(date,'YYYY-MM-DD') as day, SUM(amount) as total FROM expenses
       WHERE user_id = $1 AND date >= $2::date AND date < $3::date + INTERVAL '1 day'
       GROUP BY day ORDER BY day""",
            [request.state.user["id"], frm, to],
        )
        return send(200, {"daily": result.rows})
    except Exception:
        _log_error("Daily stats error")
        return send(500, {"error": "Failed to fetch daily totals"})
