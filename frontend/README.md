# Prelegal frontend

The Next.js app. Two routes:

| Route | What it is |
| --- | --- |
| `/` | Sign-in — a **placeholder**. See below. |
| `/app` | The signed-in shell, hosting the Mutual NDA creator |

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

`predev`, `prebuild` and `pretest` run `scripts/build-template.mjs`
automatically, so the app always picks up the current agreement text.

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

## The Mutual NDA creator

### How it works

The tool is entirely client-side. Form data never leaves the browser — which
matters, because the inputs are the terms of a confidential agreement.

```
templates/mutual-nda.md              (repository, single source of truth)
        │
        │  scripts/build-template.mjs   -- inlines markdown at build time
        ▼
src/generated/mnda-template.ts       (generated, git-ignored)
        │
        │  src/lib/markdown.ts          -- markdown -> blocks
        │  src/lib/assemble.ts          -- + user's cover page values
        ▼
   document model  (src/lib/document.ts)
        │
        ├──> src/components/NdaPreview.tsx   -- renders to HTML
        └──> src/pdf/NdaDocument.tsx         -- renders to PDF
```

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
