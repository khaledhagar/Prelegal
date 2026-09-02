# Prelegal backend

FastAPI application. It owns `/api` and serves the frontend's static export for
everything else, so the whole product runs as one process on one port.

## Running it

Normally you do not run this directly — `scripts/start-*` builds the image and
starts the stack. For backend work:

```bash
uv sync --group dev
uv run uvicorn app.main:app --reload --port 8000
uv run pytest
```

With no frontend build present, `/` answers `503` with a note explaining how to
produce one; `/api` works regardless.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PRELEGAL_DATABASE_PATH` | `backend/var/prelegal.db` | SQLite file |
| `PRELEGAL_STATIC_DIR` | `frontend/out` | The frontend's `next build` output |

The Docker image sets both.

## Layout

```
app/config.py        settings, resolved from the environment at startup
app/db.py            SQLite: connect, transaction, init_db
app/schema.sql       the schema, applied fresh on every startup
app/dependencies.py  request-scoped settings and database connections
app/api/             the /api routers
app/main.py          the app factory, lifespan and static mount
```

## Two things worth knowing

**The database is thrown away and rebuilt on every startup.** That is the
technical design's instruction while there is nothing worth keeping, and it is
why there is no ORM and no migration tool here — neither earns its weight
against a file that never survives a restart. `app/db.py` is the seam to replace
when the data becomes durable; `app/schema.sql` is where migrations would start.

**Route order is load-bearing.** The static mount sits at `/`, so it matches
anything the API did not claim first. `/api/{path:path}` is registered ahead of
it specifically so an unknown API route returns JSON rather than the frontend's
404 page. `tests/test_frontend_serving.py` covers this.

## Sign-in

There is none. PL-4 ships a placeholder login that lives entirely in the
browser (`frontend/src/lib/session.ts`); nothing here authenticates anybody and
nothing writes to the `users` table yet. The table exists so the first real
authentication ticket has somewhere to land.
