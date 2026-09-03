# Prelegal Project

## Overview

This is a SaaS product to allow users to draft legal agreements based on templates in the templates directory.
The user can carry out AI chat in order to establish what document they want and how to fill in the fields.
The available documents are covered in the catalog.json file in the project root, included here:

@catalog.json

The sections below describe the product as intended. For what is actually built
today, see [Implementation status](#implementation-status) at the end — the two
are still a long way apart.

## Development process

When instructed to build a feature:

1. Use your Atlassian tools to read the feature instructions from Jira
2. Develop the feature - do not skip any step from the feature-dev 7 step process
3. Thoroughly test the feature with unit tests and integration tests and fix any issues
4. Submit a PR using your github tools

## AI design

When writing code to make calls to LLMs, use your Cerebras skill to use LiteLLM via OpenRouter to the `openrouter/openai/gpt-oss-120b` model with Cerebras as the inference provider. You should use Structured Outputs so that you can interpret the results and populate fields in the legal document.

There is an OPENROUTER\_API\_KEY in the .env file in the project root.

## Technical design

The entire project should be packaged into a Docker container.  
The backend should be in backend/ and be a uv project, using FastAPI.  
The frontend should be in frontend/  
The database should use SQLite and be created from scratch each time the Docker container is brought up, allowing for a users table with sign up and sign in.  
The frontend is statically built and served by FastAPI — this was tried in PL-4 and works, so the whole product runs as one container on one port.  
There should be scripts in scripts/ for:

```bash
# Mac
scripts/start-mac.sh    # Start
scripts/stop-mac.sh     # Stop

# Linux
scripts/start-linux.sh
scripts/stop-linux.sh

# Windows
scripts/start-windows.ps1
scripts/stop-windows.ps1
```

Backend available at http://localhost:8000 — and, because it serves the built
frontend too, that is the whole app.

## Color Scheme

* Accent Yellow: `#ecad0a`
* Blue Primary: `#209dd7`
* Purple Secondary: `#753991` (submit buttons)
* Dark Navy: `#032147` (headings)
* Gray Text: `#888888`

Defined once as Tailwind theme tokens in `frontend/src/app/globals.css`. Use the
tokens (`bg-brand-navy`, `text-brand-gray`, …), not raw hex.

## Implementation status

*Last updated 2026-09-03, after PL-7. Keep this section honest — it is the only
place that says what exists rather than what is planned.*

Verified at the close of PL-7, against both `uv run uvicorn` and the built
image: `docker build` succeeds and the container serves the whole app on one
port; a real chat turn reaches the model and comes back with the document type
and the fields together; `/api/chat` and `/api/drafts` answer 401 to anonymous
callers; another user's draft is 404 to read *and* to delete; login gives one
answer for an unknown email and a wrong password; the session cookie is
`HttpOnly; Path=/; SameSite=lax` and signing out makes a replayed token 401;
the database holds only scrypt hashes and SHA-256 session fingerprints. A
`<script>` in a saved draft's title is stored verbatim and rendered as text —
there is no `dangerouslySetInnerHTML` anywhere in `frontend/src`, and adding
one is how that would stop being true.

Two layout faults came out of that browser pass, both invisible to the test
suite and both fixed: `Download PDF` and `Save to my documents` sat below the
bottom edge of a sticky column and could not be clicked at all, and the app
header ran 8px past the right edge of a phone and scrolled every page sideways.
All three routes are now checked clean from 320px to 1440px.

### Built

| Area | State | Ticket |
| --- | --- | --- |
| `templates/` | 12 markdown files covering 11 agreements — the Mutual NDA is split into Standard Terms + Cover Page | PL-2 |
| `frontend/` | Next.js 16, static export. `/` sign-in & sign-up, `/app` drafter, `/app/documents` saved work | PL-3, PL-4, PL-7 |
| Accounts | Real registration and sign-in. scrypt password hashing, httpOnly session cookie, server-side sessions | PL-7 |
| Saved documents | Explicit "Save to my documents"; reopen a draft back into the workspace | PL-7 |
| Agreement drafter | All 11 agreements. Freeform AI chat → live preview → downloadable PDF, plus a picker | PL-3, PL-5, PL-6 |
| Document registry | `scripts/build-documents.mjs` derives each agreement's fields from its own template, joins `hints.json`, emits both halves | PL-6 |
| AI chat | LiteLLM → OpenRouter → `gpt-oss-120b` on Cerebras, Structured Outputs. One call per turn, backend-only, stateless | PL-5, PL-6 |
| `backend/` | uv + FastAPI. `/api/health`, `/api/chat`, `/api/documents`, `/api/auth/*`, `/api/drafts`; also serves the frontend export | PL-4, PL-5, PL-6, PL-7 |
| Database | SQLite: `users`, `sessions`, `drafts`. Durable — `backend/app/schema.sql` is applied on every start and creates only what is missing. On the `prelegal-data` Docker volume | PL-4, PL-7, durable-storage |
| Packaging | One Docker image, `scripts/start-*` / `stop-*` for mac, linux and windows | PL-4 |
| Tests | 334 frontend (vitest) + 154 backend (pytest) | PL-3, PL-4, PL-5, PL-6, PL-7 |

### Not built yet

- **Schema migrations.** `schema.sql` can add a table or an index to a database
  that already exists, but it cannot alter or drop one — SQLite skips the
  `CREATE TABLE` and the old shape survives. Nothing warns you. The first change
  that has to alter an existing table is where this needs a real migration tool.
- **Password reset, email verification, rate limiting.** None exist. There is
  nothing to stop repeated sign-in attempts against a known address — and now
  that accounts persist, that matters more than it did.
- **Editing fields by hand.** PL-5 removed the cover-page form; the only way to
  change a value is to tell the assistant.
- **Several statements of work on one PSA.** A Professional Services Agreement
  can carry many in practice; only one is supported. Stated in `hints.json` and
  shown in the UI.
- **Configuring the DPA's Standard Contractual Clauses.** The annexes fill in
  from the conversation; the SCCs themselves are reproduced as written.
- **Cover pages of our own.** Only the Mutual NDA ships one in `templates/`.
  The other ten are generated from the field list, grouped the way each
  agreement groups its own variables (Order Form, Key Terms, SOW, …).

### Things not to break

- `frontend/next.config.ts` sets `trailingSlash: true` so `/app` exports as
  `out/app/index.html`, which is the shape FastAPI's `StaticFiles(html=True)`
  resolves. Removing it breaks serving.
- In `backend/app/main.py` the static mount sits at `/` and must stay registered
  *after* the API, or unknown `/api` routes return the frontend's 404 page.
- New API routers go in `backend/app/api/` and are registered in its
  `__init__.py`.
- Field names are camelCase and derived, not written: they come from each
  template's own `<span class="..._link">` variables via
  `frontend/scripts/build-documents.mjs`, and travel unchanged through the LLM
  schema, the API and `frontend/src/lib/values.ts`. That script is the *only*
  parser — do not add a second one in Python. If the two halves disagree the
  assistant fills in a field nothing renders, and nothing errors.
- `backend/app/chat/documents.json` is generated but **committed**: the runtime
  image has no Node. Regenerate it with `npm run build:documents` whenever
  `templates/`, `catalog.json` or `hints.json` changes.
- `backend/app/chat/models.py` builds the Structured Outputs schema per document
  with `create_model`. One completion per turn carries the reply, the chosen
  `documentType` and the field updates together — do not add a second call to
  classify the document.
- `merge.py` treats null *and* blank as "no change", so the assistant can fill a
  field but never erase one. Do not "fix" this into a plain overwrite.
- `OPENROUTER_API_KEY` is never baked into the image. The start scripts pass it
  at run time; without it everything works except `/api/chat`.
- Colours come from the tokens in `frontend/src/app/globals.css`, not from
  Tailwind's default palette. `bg-surface` / `text-ink` / `border-line` already
  answer to the colour scheme, so they need no `dark:` twin; the `paper-*`
  tokens dress the agreement itself and are deliberately *not* brand colours —
  a contract in corporate purple reads as marketing.
- `/api/chat` and `/api/drafts` require a session (`CurrentUser` in
  `backend/app/dependencies.py`). The route guard in `AppShell` is a
  convenience; the backend is the access control. A chat turn spends real money
  on the deployment's key, which is why it is not open.
- Sessions are stored as a SHA-256 of the token, never the token, and passwords
  as scrypt hashes — both so that reading the database yields nothing usable.
  `/api/auth/login` gives the same answer for an unknown email and a wrong
  password; `/api/drafts/{id}` answers 404, not 403, for someone else's
  document. Do not "improve" either into a more specific message.
- A component that calls `useRouter()` must not put the router in a
  `useCallback`/`useEffect` dependency list: it is a fresh object every render,
  so the effect re-runs forever. `DocumentCreator` and `SavedDocuments` hold it
  in a ref synced by an effect.
- The drafter's left column in `DocumentCreator` is `lg:sticky`, and a sticky
  element taller than the space it sticks in traps whatever hangs past the
  bottom edge — no scroll position can reach it. `Download PDF` and `Save to my
  documents` sit at the very bottom of that column, so it is bounded with
  `lg:max-h-[calc(100vh-6rem)]` and `DocumentChat` flexes into what is left
  rather than claiming a fixed `calc(100vh - …)` of its own. Giving the chat a
  fixed height again is how both buttons became unclickable on any window
  shorter than about 1145px. jsdom has no layout, so the 334 frontend tests
  cannot catch this — it only shows up in a real browser.

- `init_db` runs on every startup and must never delete. It used to unlink the
  database and its `-wal`/`-shm` siblings; the WAL in particular holds committed
  rows SQLite has not yet folded into the main file, so removing it discards
  exactly the writes made just before the process stopped. Every statement in
  `schema.sql` is `IF NOT EXISTS` so re-applying it is a no-op — adding a plain
  `CREATE TABLE` breaks startup on any existing database.

- The Docker image keeps the database at `/data/prelegal.db`, and the start
  scripts mount the `prelegal-data` **named** volume over it. Named, because
  `start` removes the previous container before it runs a new one — an
  anonymous volume or a bare container directory would be thrown away every
  time. The Dockerfile deliberately does *not* declare `VOLUME /data`: that
  would hand anyone running the image without `--volume` a fresh anonymous
  volume that looks like persistence until they wonder where their account
  went. `scripts/lib/prelegal.sh` and `scripts/lib/Prelegal.ps1` both do this
  and have to stay in step.

- The header bar in `AppShell` carries `flex-wrap`, and the account block is
  allowed to drop to a second line. The wordmark, both nav links and that block
  want about 423px; a 390px phone has 375px to give. Held in one rigid row the
  sign-out button crossed the right edge and took the whole document with it,
  so every page scrolled sideways. The tighter `px-4` and `gap-4` below `sm`
  are what usually avoid the wrap; the wrap is what makes overflow impossible
  regardless, which is the property to keep when adding a nav item. The avatar
  and the sign-out button are `shrink-0` — without it flexbox squeezed the
  avatar from 32px to 23px and served an oval.

- `frontend/src/pdf/AgreementDocument.tsx` positions its page-number footer with
  `top` (`FOOTER_FROM_TOP`), not `bottom`. A `fixed` element positioned with
  `bottom` makes @react-pdf 4.6.1 fail outright on the three longest
  agreements. The comment there says so; the PDF tests render all eleven.