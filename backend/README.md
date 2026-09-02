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
| `OPENROUTER_API_KEY` | — | Credentials for the chat assistant |

The Docker image sets the first two. The key is deliberately *not* baked in:
the start scripts pass it to the container at run time, and `load_settings()`
reads the repository's `.env` for local runs. Without it everything works
except `/api/chat`, which answers `503` and says what is missing.

## Layout

```
app/config.py        settings, resolved from the environment at startup
app/db.py            SQLite: connect, transaction, init_db
app/schema.sql       the schema, applied fresh on every startup
app/dependencies.py  request-scoped settings and database connections
app/api/             the /api routers
app/chat/            the drafting assistant (see below)
app/main.py          the app factory, lifespan and static mount
```

## The drafting assistant

`POST /api/chat` takes the whole transcript and the cover page so far, and
returns what to say next plus the cover page with the assistant's edits applied.

```
app/chat/models.py   the wire contract, which is also the LLM's output schema
app/chat/prompt.py   the system prompt and per-turn state
app/chat/agent.py    the LiteLLM call
app/chat/merge.py    applying the model's patch
```

**Stateless.** The browser keeps the conversation and sends it every turn. There
is no authenticated user to own a conversation and the database does not survive
a restart, so storing it here would be pretending.

**The model returns a patch, not a full record.** `null` means "I learned
nothing about this field", never "clear it" — `merge.py` also ignores blank
strings. Asking for the whole cover page each turn invites the model to re-emit
what it half-remembers and quietly blank a value the user already gave, which on
a legal document is a bad way to lose the governing law.

**Names cross the wire in camelCase.** The models are snake_case in Python and
serialise through pydantic aliases, so the JSON schema the model fills in and
the object the frontend adopts both match `frontend/src/lib/form.ts` exactly.

Tests replace the LLM entirely (`tests/test_chat_api.py`) — nothing in the suite
makes a network call.

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
