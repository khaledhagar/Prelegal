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

*Last updated 2026-09-03, after PL-6. Keep this section honest — it is the only
place that says what exists rather than what is planned.*

### Built

| Area | State | Ticket |
| --- | --- | --- |
| `templates/` | 12 markdown files covering 11 agreements — the Mutual NDA is split into Standard Terms + Cover Page | PL-2 |
| `frontend/` | Next.js 16, static export. `/` placeholder sign-in, `/app` signed-in shell | PL-3, PL-4 |
| Agreement drafter | All 11 agreements. Freeform AI chat → live preview → downloadable PDF, plus a picker | PL-3, PL-5, PL-6 |
| Document registry | `scripts/build-documents.mjs` derives each agreement's fields from its own template, joins `hints.json`, emits both halves | PL-6 |
| AI chat | LiteLLM → OpenRouter → `gpt-oss-120b` on Cerebras, Structured Outputs. One call per turn, backend-only, stateless | PL-5, PL-6 |
| `backend/` | uv + FastAPI. `/api/health`, `/api/chat`, `/api/documents`; also serves the frontend export | PL-4, PL-5, PL-6 |
| Database | SQLite, `users` table only, deleted and rebuilt from `backend/app/schema.sql` on every startup | PL-4 |
| Packaging | One Docker image, `scripts/start-*` / `stop-*` for mac, linux and windows | PL-4 |
| Tests | 271 frontend (vitest) + 100 backend (pytest) | PL-3, PL-4, PL-5, PL-6 |

### Not built yet

- **Authentication.** Sign-in is a client-side placeholder living entirely in
  `frontend/src/lib/session.ts`: no password is checked, no request is made, and
  the `users` table is never written to. The route guard in `AppShell` is a
  convenience, not a security control — the frontend is static files, so
  anything that needs protecting must be enforced by the backend.
- **Document persistence.** Nothing is saved; the PDF is generated in the
  browser and the database does not survive a restart.
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
- The brand palette currently dresses the login screen, the shell and the
  drafter's chrome; the agreement preview inside still uses its original
  slate/sky styling.
- `frontend/src/pdf/AgreementDocument.tsx` positions its page-number footer with
  `top` (`FOOTER_FROM_TOP`), not `bottom`. A `fixed` element positioned with
  `bottom` makes @react-pdf 4.6.1 fail outright on the three longest
  agreements. The comment there says so; the PDF tests render all eleven.