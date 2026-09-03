# Prelegal frontend

The Next.js app. Two routes:

| Route | What it is |
| --- | --- |
| `/` | Sign-in — a **placeholder**. See below. |
| `/app` | The signed-in shell, hosting the agreement drafter |

## Running it

```bash
npm install
npm run dev      # http://localhost:3000
```

```bash
npm run build    # static export to out/
npm run lint
npm test
```

`predev`, `prebuild` and `pretest` run `scripts/build-documents.mjs`
automatically, so the app always picks up the current agreement text and field
list.

In production nothing runs this: `npm run build` writes plain static files to
`out/`, and the backend serves them. `trailingSlash: true` is what makes `/app`
land as `out/app/index.html`, which is the shape FastAPI's static mount
resolves — see [`../backend/README.md`](../backend/README.md).

## Sign-in is fake

`src/lib/session.ts` is the whole of it. The login screen takes a name and an
email, keeps them in `localStorage`, and lets the user through; no password is
checked, no request is made, and no account exists. The guard in
`src/components/AppShell.tsx` is a convenience for the person using the app, not
a security boundary — the whole frontend is static files, so anything that
genuinely needs protecting has to be enforced by the backend.

That is deliberate for now (PL-4) and confined to one module: `useSession`,
`startSession` and `endSession` are what every component calls, so real
authentication replaces the inside of that file and nothing else.

## The agreement drafter

The user fills an agreement in by talking to an assistant (`DocumentChat`), not
by completing a form — PL-5 replaced the cover-page form with a conversation and
PL-6 widened it from the Mutual NDA to all eleven Common Paper agreements. Each
turn posts the transcript and the current values to `/api/chat` and gets back a
reply plus the updated values, so the preview fills in as the conversation goes.

**Which document to draft is part of the conversation.** The assistant works it
out from what the user says, and says plainly when we cannot draft what they
asked for — offering the closest agreement we do have. `DocumentPicker` lists
all eleven beside the chat for anyone who already knows what they want; both
routes set the same `documentType`.

**Chat needs the backend.** The request is same-origin, so `npm run dev` alone
has no `/api` to call and the chat reports that it cannot reach the assistant.
Run the full stack (`scripts/start-*`) to use it.

### How it works

Everything downstream of the values is unchanged, and still entirely
client-side: the assembled agreement and the PDF are built in the browser, and
the only thing that ever leaves it is the conversation itself.

```
templates/*.md + catalog.json + hints.json   (repository, source of truth)
        │
        │  scripts/build-documents.mjs  -- reads each template's own
        │                                  <span class="..._link"> variables,
        │                                  joins them to hints.json
        ├─────────────────────────────────────────┐
        ▼                                         ▼
src/generated/documents.ts              backend/app/chat/documents.json
  (generated, git-ignored)                (generated, committed -- the
        │                                  runtime image has no Node)
        │  src/lib/markdown.ts          -- markdown -> blocks
        │  src/lib/assemble.ts          -- + cover page values from the chat
        ▼
   document model  (src/lib/document.ts)
        │
        ├──> src/components/AgreementPreview.tsx  -- renders to HTML
        └──> src/pdf/AgreementDocument.tsx        -- renders to PDF
```

**The field list is read out of the agreements, not written by hand.** Common
Paper's templates name every value a user must supply — `<span
class="keyterms_link">Governing Law</span>` and its four siblings — so adding a
template to `templates/` and a row to `catalog.json` is all it takes to support
a new document. `hints.json` supplies the human half: the plain-language
question to ask for each field. A field with no hint still works; it just reads
like a form until someone writes a line for it.

One script does that parsing, once, for both halves of the app. A second parser
in Python would drift, and the failure mode of that drift is the assistant
filling in a field name nothing renders.

**One model, two renderers.** The preview and the PDF walk the same document
model, so what you see on screen is what lands in the file. Each renderer's
`switch` ends in `assertNever(block)`, so adding a block kind produces a
compile error in whichever renderer you forget to update.

That guard is doing real work. TypeScript alone does *not* catch a missing
case here: a component that falls off the end of a switch returns `undefined`,
which is a valid `ReactNode`, so the block would be dropped from the document
with no error anywhere. Verified by adding an unhandled variant and confirming
`tsc --noEmit` now reports an error in both renderers.

#### Notable decisions

- **The PDF contains real text, not a screenshot.** `@react-pdf/renderer`
  paginates automatically and emits selectable, searchable, accessible text.
  Rasterizing the preview with `html2canvas` would have been less code but would
  produce a document you cannot search, copy from, or read with a screen reader —
  a poor property for something people sign.
- **The standard terms are reproduced verbatim.** Clauses reference cover-page
  values (*"the laws of the State of Governing Law"*), and those references are
  rendered as styled cross-references rather than having values substituted into
  them. Common Paper directs that modifications belong on the cover page, and
  substitution also produces broken prose. The cover page carries the values.
- **`src/lib/markdown.ts` is not a general markdown parser** and should not
  become one. The standard terms use four constructs; it handles those four. If
  the templates ever need more, reach for a real parser rather than growing this.
- **The template is inlined at build time**, not fetched at runtime, because a
  static export has no server to read from `templates/` and we want the app to
  work offline.

## Licensing

The agreement text is © Common Paper, licensed
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). See
[`templates/LICENSE.txt`](../templates/LICENSE.txt).

**CC BY attribution carries over to generated documents.** A PDF produced by
this app is a derivative work and must credit Common Paper with a link to the
license. The on-screen footer does this; the generated PDF currently carries
only the attribution line inherited from the template. Anything that ships to
real users should make that credit explicit in the PDF itself.

This tool does not provide legal advice.
