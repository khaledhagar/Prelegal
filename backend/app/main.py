"""The Prelegal application.

One process serves the whole product: `/api/*` is the backend, everything else
is the frontend's static export. That keeps deployment to a single container on
a single port, and means the browser never makes a cross-origin request, so
there is no CORS configuration to get wrong.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api import api_router
from app.config import Settings, load_settings
from app.db import init_db

logger = logging.getLogger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved = settings or load_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        # The database is rebuilt on every startup by design: it holds nothing
        # worth keeping yet, and starting from a known-empty schema means a
        # restart is always a clean slate.
        init_db(resolved.database_path)
        logger.info("database created at %s", resolved.database_path)
        yield

    app = FastAPI(
        title="Prelegal",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.state.settings = resolved

    app.include_router(api_router, prefix="/api")

    # An unmatched /api path must not fall through to the static mount below,
    # or an API client asking for a route that does not exist would get the
    # frontend's 404 page instead of a JSON error.
    @app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
    def api_not_found(path: str) -> JSONResponse:
        return JSONResponse({"detail": f"No API route /api/{path}"}, status_code=404)

    if resolved.serves_frontend:
        # Mounted last and at the root, so it only sees what the API did not
        # claim. `html=True` resolves /app/ to app/index.html and falls back to
        # the export's 404.html.
        app.mount(
            "/",
            StaticFiles(directory=resolved.static_dir, html=True),
            name="frontend",
        )
    else:
        logger.warning(
            "no frontend build at %s -- serving the API only. "
            "Run `npm run build` in frontend/ to produce it.",
            resolved.static_dir,
        )

        @app.get("/")
        def frontend_missing() -> JSONResponse:
            return JSONResponse(
                {
                    "detail": (
                        "The frontend has not been built. Run `npm run build` in "
                        "frontend/, or start the stack with scripts/start-*."
                    )
                },
                status_code=503,
            )

    return app


app = create_app()
