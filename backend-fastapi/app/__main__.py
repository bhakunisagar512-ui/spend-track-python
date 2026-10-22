"""Start the server: `python -m app` (production) or `python -m app --reload` (dev)."""
import os
import sys

import uvicorn

from app.config import env  # noqa: F401


def main():
    uvicorn.run(
        "app.main:app",
        host=os.getenv("HOST") or "0.0.0.0",
        port=int(os.getenv("PORT") or 5000),
        reload="--reload" in sys.argv,
        reload_dirs=["app"],
        # psycopg's async mode cannot run on Windows' default ProactorEventLoop
        loop="asyncio:SelectorEventLoop" if sys.platform == "win32" else "auto",
        proxy_headers=False,  # rate limiting keys on the socket IP, like Express without `trust proxy`
        server_header=False,
    )


if __name__ == "__main__":
    main()
