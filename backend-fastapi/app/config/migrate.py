import asyncio
import sys
import traceback

from app.config import db
from app.config.loop import use_selector_loop_on_windows


async def migrate():
    conn = await db.connect()
    try:
        print("🔄 Running migrations...")

        await conn.execute("""
          CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255),
            google_id VARCHAR(255) UNIQUE,
            avatar_url TEXT,
            gemini_api_key TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          );
        """)

        await conn.execute("""
          CREATE TABLE IF NOT EXISTS expenses (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            amount DECIMAL(12,2) NOT NULL,
            description VARCHAR(500) NOT NULL,
            category VARCHAR(100) NOT NULL DEFAULT 'Other',
            emoji VARCHAR(10) DEFAULT '📦',
            date TIMESTAMP DEFAULT NOW(),
            created_at TIMESTAMP DEFAULT NOW()
          );
        """)

        await conn.execute("""
          CREATE TABLE IF NOT EXISTS budgets (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            category VARCHAR(100) NOT NULL,
            amount DECIMAL(12,2) NOT NULL,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(user_id, category)
          );
        """)

        await conn.execute("""
          CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id);
          CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
          CREATE INDEX IF NOT EXISTS idx_budgets_user_id ON budgets(user_id);
        """)

        print("✅ All migrations completed successfully")
    except Exception:
        print("❌ Migration failed:", traceback.format_exc(), file=sys.stderr)
        sys.exit(1)
    finally:
        await conn.close()


if __name__ == "__main__":
    use_selector_loop_on_windows()
    asyncio.run(migrate())
