-- ============================================================================
--  spend&Track (spendAI) — PostgreSQL database script
--  Target: PostgreSQL 13+ (gen_random_uuid() is built in from 13; pgcrypto
--  is enabled below so older versions work too).
--
--  This file is the standalone equivalent of backend-fastapi/app/config/migrate.py.
--  It is idempotent: running it again on an existing database changes nothing.
--
--  Usage:
--    createdb spendai_db                                   # once
--    psql "$DATABASE_URL" -f backend-fastapi/database/schema.sql
--  or with the docker-compose database:
--    docker exec -i spendai-fastapi-db-1 psql -U username -d spendai_db < backend-fastapi/database/schema.sql
-- ============================================================================

-- CREATE DATABASE spendai_db;   -- run separately as a superuser if the DB does not exist

CREATE EXTENSION IF NOT EXISTS pgcrypto;

BEGIN;

-- ── users ───────────────────────────────────────────────────────────────────
-- One row per account. Email/password users have password_hash; Google users
-- have google_id (an account can have both once Google is linked by email).
CREATE TABLE IF NOT EXISTS users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           VARCHAR(255) NOT NULL,
  email          VARCHAR(255) UNIQUE NOT NULL,          -- stored lower-cased by the API
  password_hash  VARCHAR(255),                          -- bcrypt $2a$, cost 12; NULL for Google-only accounts
  google_id      VARCHAR(255) UNIQUE,                   -- Google "sub" claim
  avatar_url     TEXT,                                  -- Google profile picture
  gemini_api_key TEXT,                                  -- optional per-user key (PATCH /api/auth/api-key)
  created_at     TIMESTAMP DEFAULT NOW(),
  updated_at     TIMESTAMP DEFAULT NOW()
);

-- ── expenses ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount      DECIMAL(12,2) NOT NULL,                   -- API rejects amount <= 0
  description VARCHAR(500) NOT NULL,
  category    VARCHAR(100) NOT NULL DEFAULT 'Other',
  emoji       VARCHAR(10) DEFAULT '📦',
  date        TIMESTAMP DEFAULT NOW(),                  -- when the money was spent
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ── budgets ─────────────────────────────────────────────────────────────────
-- One monthly limit per (user, category); POST /api/budgets upserts on this key.
CREATE TABLE IF NOT EXISTS budgets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category   VARCHAR(100) NOT NULL,
  amount     DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (user_id, category)
);

-- ── indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date    ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_budgets_user_id  ON budgets(user_id);

COMMIT;

-- ============================================================================
--  Reset (DANGER: deletes all data). Uncomment only when you mean it.
-- ============================================================================
-- DROP TABLE IF EXISTS budgets;
-- DROP TABLE IF EXISTS expenses;
-- DROP TABLE IF EXISTS users;
