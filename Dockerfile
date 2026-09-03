# syntax=docker/dockerfile:1
#
# Prelegal ships as a single image: the frontend is built to static files and
# handed to FastAPI, which serves them alongside /api on one port. Two stages,
# because Node is needed to build the frontend and has no business in the image
# that runs in production.

# ---------------------------------------------------------------------------
# Stage 1 -- build the frontend to static files.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS frontend

WORKDIR /build

# Dependencies first: this layer is reused on every build that does not change
# the lockfile, which is nearly all of them.
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci

# `scripts/build-documents.mjs` reads the agreements and their fields from the
# repository's templates/, catalog.json and hints.json, resolved as siblings of
# frontend/. The build fails loudly if any is missing, so the layout here is not
# incidental.
COPY templates/ ./templates/
COPY catalog.json hints.json ./
COPY frontend/ ./frontend/
RUN cd frontend && npm run build

# ---------------------------------------------------------------------------
# Stage 2 -- the backend, plus the files stage 1 produced.
# ---------------------------------------------------------------------------
FROM python:3.13-slim AS runtime

COPY --from=ghcr.io/astral-sh/uv:0.11.6 /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1

WORKDIR /app/backend

# Same trick as above: resolve and install dependencies before the source is
# copied in, so editing the backend does not reinstall the world.
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev

COPY backend/ ./
COPY --from=frontend /build/frontend/out /app/frontend/out

ENV PRELEGAL_DATABASE_PATH=/data/prelegal.db \
    PRELEGAL_STATIC_DIR=/app/frontend/out

# The database is rebuilt on every startup, so /data holds nothing that needs to
# outlive the container -- it just has to be writable by a non-root user.
RUN useradd --system --create-home prelegal \
    && mkdir -p /data \
    && chown -R prelegal:prelegal /data
USER prelegal

EXPOSE 8000

# Reports unhealthy until the schema is in place, not merely until the port is
# open -- /api/health reads the database to answer.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health').read()"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
