# spendAI — AI-Powered Expense Tracker

Full-stack expense tracker with Gemini AI parsing, React frontend, FastAPI (Python) + PostgreSQL backend, and Google OAuth.

---

## Project Structure

```
spendai/
├── backend-fastapi/       # Python + FastAPI + PostgreSQL
│   ├── app/
│   │   ├── config/        # DB connection + migrations
│   │   ├── controllers/   # auth, expenses, budgets
│   │   ├── middleware/    # JWT auth guard, security headers, CORS, rate limits
│   │   └── routes/        # API route definitions
│   ├── .env.example
│   ├── Dockerfile
│   └── requirements.txt
│
└── frontend/              # React app
    ├── src/
    │   ├── api/           # Axios client
    │   ├── context/       # AuthContext (global state)
    │   ├── components/    # ProtectedRoute
    │   ├── pages/         # AuthPage, Dashboard, SettingsPage
    │   └── utils/         # Gemini parsing helpers
    ├── public/
    ├── .env.example
    └── package.json
```
<img width="1845" height="935" alt="image" src="https://github.com/user-attachments/assets/4c9fe27f-c5e9-42a2-9f00-5a70864e5cdc" />

---

## 1. PostgreSQL Setup

```bash
# Create the database
psql -U postgres
CREATE DATABASE spendai_db;
\q
```

---

## 2. Backend Setup

```bash
cd backend-fastapi

# Install dependencies (Python 3.10+)
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your values (see below)

# Run DB migrations (creates tables)
.venv/bin/python -m app.config.migrate

# Start development server (auto-reload)
.venv/bin/python -m app --reload
```

### Backend `.env` values

```env
PORT=5000
NODE_ENV=development
DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/spendai_db
JWT_SECRET=some_long_random_string_here
JWT_EXPIRES_IN=7d
GOOGLE_CLIENT_ID=your_google_client_id
CLIENT_URL=http://localhost:3000
```

---

## 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your values
```

### Frontend `.env` values

```env
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_GOOGLE_CLIENT_ID=your_google_client_id
```

```bash
# Start the React dev server
npm start
```

---

## 4. Google OAuth Setup

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or use existing)
3. Go to **APIs & Services → Credentials**
4. Click **Create Credentials → OAuth 2.0 Client ID**
5. Application type: **Web application**
6. Add Authorized JavaScript origins:
   - `http://localhost:3000`
7. Add Authorized redirect URIs:
   - `http://localhost:3000`
8. Copy the **Client ID** → paste into both `.env` files

---

## 5. Gemini API Key

1. Go to [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Create a free API key
3. After logging in to spendAI, go to **Settings** and paste your key
4. The key is saved to your user profile in the database

---

## API Endpoints

### Auth
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/auth/register` | Email/password register |
| POST | `/api/auth/login` | Email/password login |
| POST | `/api/auth/google` | Google OAuth login |
| GET | `/api/auth/me` | Get current user |
| PATCH | `/api/auth/api-key` | Save Gemini API key |

### Expenses (all require JWT)
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/expenses` | List expenses (filterable by month/category) |
| POST | `/api/expenses` | Create expense |
| PUT | `/api/expenses/:id` | Update expense |
| DELETE | `/api/expenses/:id` | Delete expense |
| GET | `/api/expenses/stats/summary` | Totals + category breakdown + daily trend |

### Budgets (all require JWT)
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/budgets` | Get all budgets |
| POST | `/api/budgets` | Create or update budget |
| DELETE | `/api/budgets/:category` | Remove budget limit |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, React Router v6, Chart.js, Axios |
| Auth UI | @react-oauth/google |
| Backend | Python, FastAPI, Uvicorn |
| Database | PostgreSQL (via `psycopg` 3) |
| Auth | JWT + bcrypt + Google OAuth |
| AI | Gemini 2.0 Flash (via REST API) |
| Security | Security headers, per-IP rate limiting, CORS |
