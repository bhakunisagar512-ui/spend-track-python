# spendAI backend (FastAPI)

A drop-in Python/FastAPI port of the original Express backend (now removed). It keeps the same routes,
JSON shapes, status codes, error messages, DB schema, JWTs and password hashes,
so existing databases, user accounts and login sessions keep working.

## Run locally

```bash
cd backend-fastapi
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env

.venv/bin/python -m app.config.migrate   # = npm run db:migrate
.venv/bin/python -m app --reload         # = npm run dev   (port $PORT, default 5000)
.venv/bin/python -m app                  # = npm start
```

## Run with Docker

From the repo root (db + this backend + frontend; migrations run on start):

```bash
bin/build-and-run.sh     # build images and start everything
bin/start-dev.sh         # start without rebuilding
bin/stop-dev.sh          # stop (add --wipe-db to delete the database volume)
```

## Layout (mirrors the old Express `backend/src`)

| Node (old `backend/src`)             | FastAPI (`backend-fastapi/app`)          |
|--------------------------------------|------------------------------------------|
| `index.js`                           | `main.py`, `__main__.py`                 |
| `config/db.js`, `config/migrate.js`  | `config/db.py`, `config/migrate.py`      |
| `middleware/auth.js`                 | `middleware/auth.py`                     |
| helmet / cors / express.json / rate-limit | `middleware/express.py`             |
| `routes/*.js`                        | `routes/*.py`                            |
| `controllers/*.js`                   | `controllers/*_controller.py`            |

## Compatibility notes

- **Response types match node-pg**: `NUMERIC`/`COUNT` come back as strings,
  timestamps as ISO-8601 UTC strings (`…Z`), and UUIDs as strings (`config/db.py`).
- **Query parameters are sent untyped**, as node-pg sends them, so Postgres
  casts values such as dates the same way.
- **Request validation follows JavaScript semantics**: truthiness, `isNaN`,
  `parseFloat` and `parseInt` live in `utils/js.py`, so edge cases (`"0"`,
  `"1e2"`, `"12abc"`, …) give the same 400/500 responses.
- **Security and limits match the Express setup**: helmet headers, the
  `cors({ origin: CLIENT_URL, credentials: true })` behaviour, the 10 KB JSON
  body limit, and per-IP rate limits (100 req / 15 min on `/api`, 20 on `/api/auth`).
- **Express routing quirks are kept**: an optional trailing slash, HEAD handled
  by GET routes, unknown routes returning `{"error":"Route not found"}` (404),
  and unexpected errors returning `{"error":"Internal server error"}` (500).
- **JWTs and passwords are interchangeable**: JWTs are HS256 with
  `{ userId, iat, exp }`, and `JWT_EXPIRES_IN` uses the same `ms` syntax. Passwords
  use bcrypt `$2a$`, cost 12, like bcryptjs.
- **Interactive API docs are off**: `/docs` and `/openapi.json` are disabled so the
  route list matches the Express app. To turn them on, remove `docs_url=None`
  (and the related options) in `main.py`.
