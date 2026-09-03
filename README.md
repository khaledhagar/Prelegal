# Prelegal

A platform for drafting common legal agreements.

## Status: 🚧 In Progress

This project is under active development and is **not yet ready for use**.

- **Current phase:** In progress
- **Target completion:** 2026-08-29 (approximately one week from 2026-08-22)

Expect the codebase, APIs, and documentation to change without notice until the
first stable release. Contributions and issues are welcome in the meantime.

> **There is no authentication yet.** The sign-in screen is a placeholder: it
> asks for a name and an email, checks nothing, and keeps the answer in the
> browser. Do not put anything sensitive behind it.

## Running it

Docker is the only prerequisite. The AI chat also needs an
`OPENROUTER_API_KEY` in a `.env` at the repository root; the start scripts pass
it to the container at run time and it is never baked into the image. Without
it everything works except the chat, which says so plainly.

```bash
scripts/start-mac.sh       scripts/stop-mac.sh        # macOS
scripts/start-linux.sh     scripts/stop-linux.sh      # Linux
pwsh -File scripts/start-windows.ps1                  # Windows
pwsh -File scripts/stop-windows.ps1
```

The start scripts build the image, run it, and wait until the app answers before
reporting <http://localhost:8000>. Set `PRELEGAL_PORT` to use another port.

## How it fits together

One container, one port. The frontend builds to static files that FastAPI serves
alongside the API, so the browser never makes a cross-origin request and there is
no CORS configuration to get wrong.

```
                    ┌──────────────── prelegal:local ────────────────┐
                    │                                                │
 localhost:8000 ───▶│  FastAPI  ──  /api/chat  ─▶  LiteLLM ─────────────▶ OpenRouter
                    │      │                        │                │    (Cerebras)
                    │      │        /api/health ─▶  SQLite (rebuilt  │
                    │      │                        from schema.sql  │
                    │      │                        on every startup) │
                    │      ▼                                         │
                    │  everything else  ──▶  frontend/out            │
                    │                        (next build --export)   │
                    └────────────────────────────────────────────────┘
```

**You fill the agreement in by talking to it.** The assistant asks what it still
needs, and each answer updates the document on the right. The conversation lives
in the browser and is sent whole with each turn; the backend stores none of it.

| Path | What lives there |
| --- | --- |
| [`frontend/`](frontend) | Next.js app: sign-in, the signed-in shell, the agreement drafter |
| [`backend/`](backend) | FastAPI app: `/api`, the drafting assistant, the database, and serving the above |
| [`templates/`](templates) | Common Paper agreement text — the source of truth for document content |
| [`scripts/`](scripts) | Start and stop, per platform |
| `catalog.json` | The document types the product intends to support |

**The database is durable.** `backend/app/schema.sql` is applied on every
start and creates only what is missing, so accounts and saved documents survive
a restart. In Docker it lives on the `prelegal-data` named volume, which the
start scripts mount and which outlives the container; `docker volume rm
prelegal-data` is how you deliberately throw it away.

There is still no migration tool. The schema can add tables and indexes to a
database that already exists, but it cannot alter or drop what is already
there -- the first change that needs to is where real migrations begin.

## Developing

Each side runs on its own when you are working on it:

```bash
cd frontend && npm install && npm run dev     # http://localhost:3000
cd backend  && uv sync --group dev && uv run uvicorn app.main:app --reload
```

Tests:

```bash
cd frontend && npm test      # vitest
cd backend  && uv run pytest
```

See [`frontend/README.md`](frontend/README.md) and
[`backend/README.md`](backend/README.md) for the details of each.

## License

Released under the [MIT License](LICENSE).

Agreement text in `templates/` is © Common Paper, used under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
