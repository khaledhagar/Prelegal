/**
 * Derives the supported document set from the repository's `templates/`
 * directory and emits it for both halves of the app.
 *
 * The Common Paper templates are self-describing: every value a user has to
 * supply appears in the markdown as `<span class="keyterms_link">Governing
 * Law</span>` or one of its siblings. That means the field list for an
 * agreement does not have to be written by hand -- it can be read out of the
 * agreement itself, which is why adding a template to templates/ and an entry
 * to catalog.json is all it takes to support a new document.
 *
 * This script is the *only* place that parsing happens. It writes two
 * artifacts:
 *
 *   - `frontend/src/generated/documents.ts` -- text plus fields, for the UI.
 *   - `backend/app/chat/documents.json`     -- fields only, for the LLM schema.
 *
 * Field *names* come from the templates; how to ask about each one comes from
 * the repository's hints.json. The two are joined here, once, so the browser
 * and the assistant cannot disagree about what a field is called or how it
 * should be described.
 *
 * The backend deliberately loads a generated file rather than parsing the
 * markdown itself. A second parser in Python would drift from this one, and the
 * failure mode of that drift is the assistant filling in a field name nothing
 * renders -- exactly the silent breakage CLAUDE.md warns about.
 *
 * Runs automatically via the `predev` / `prebuild` / `pretest` npm scripts.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const templatesDir = resolve(repoRoot, "templates");
const catalogFile = resolve(repoRoot, "catalog.json");
const hintsFile = resolve(repoRoot, "hints.json");
const frontendOut = resolve(here, "..", "src", "generated", "documents.ts");
const backendOut = resolve(repoRoot, "backend", "app", "chat", "documents.json");

/**
 * A variable reference in the standard terms.
 *
 * The class name says which document the value lives on -- Common Paper splits
 * the fill-in half of an agreement across a Cover Page, an Order Form, Key
 * Terms, Business Terms or a Statement of Work depending on the agreement. We
 * keep the distinction because it is how the cover page gets sensible section
 * headings, but every group is filled in the same conversation.
 */
const VARIABLE = /<span class="([a-z]+)_link"[^>]*>(.*?)<\/span>/g;

/** Group ordering on the rendered cover page: who the parties are, then terms. */
const GROUP_ORDER = ["coverpage", "businessterms", "orderform", "sow", "keyterms"];

const GROUP_LABELS = {
  coverpage: "Cover Page",
  keyterms: "Key Terms",
  orderform: "Order Form",
  businessterms: "Business Terms",
  sow: "Statement of Work",
};

/**
 * Variable names that name a *party* rather than a value to write.
 *
 * Common Paper writes the parties into the standard terms as variables like
 * `Customer` and `Provider`, but they are not one-line answers: each needs a
 * legal entity name, a signatory, a title and a notice address. Recognising
 * them here is what lets one signature block serve all eleven agreements.
 */
const PARTY_ROLES = new Set(["Customer", "Provider", "Company", "Partner"]);

/** The Mutual NDA names its parties on the cover page, not in the terms. */
const DEFAULT_PARTY_ROLES = ["Party 1", "Party 2"];

/**
 * Values the Mutual NDA's cover page collects that never appear as a variable
 * in its standard terms. Every other agreement declares all of its fields in
 * its own markdown; the MNDA is the one template with a hand-written cover
 * page, and this is the only concession made to it.
 */
const EXTRA_FIELDS = {
  "mutual-nda": [{ label: "MNDA Modifications", group: "coverpage" }],
};

function read(filename) {
  const path = resolve(templatesDir, filename);
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (cause) {
    throw new Error(
      `Could not read template "${filename}" from ${templatesDir}. ` +
        `The build depends on the repository's templates/ directory (see PL-2). ` +
        `Original error: ${cause.message}`,
    );
  }
  if (raw.trim().length === 0) {
    throw new Error(`Template "${filename}" is empty -- refusing to build.`);
  }
  return raw.replace(/\r\n/g, "\n");
}

/** "Target Uptime" -> "targetUptime"; the key the LLM and the UI both use. */
function toKey(label) {
  const words = label
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index === 0) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

/**
 * Strips the possessive so `Customer’s` and `Customer` are one field.
 * Both the straight and curly apostrophe appear across the templates.
 */
function depossess(label) {
  return label.replace(/[’']s$/, "");
}

/**
 * Collapses a plural back to its singular, but only when the singular is also
 * used in the same agreement.
 *
 * `Subscription Periods` and `Subscription Period` are one field; `Chosen
 * Courts` and `Additional Warranties` are simply plural nouns and have no
 * singular form anywhere in the text. Checking against the document's own
 * vocabulary is what tells the two cases apart without a word list.
 */
function singularize(label, vocabulary) {
  if (!label.endsWith("s")) return label;
  const singular = label.slice(0, -1);
  return vocabulary.has(singular) ? singular : label;
}

const hints = JSON.parse(readFileSync(hintsFile, "utf8"));

/**
 * Joins a derived field to its hand-written hint.
 *
 * Per-document hints win over shared ones: `Term` on a Design Partner
 * Agreement is a length of time, while a shared entry of the same name may mean
 * something broader. A field with no hint at all falls back to its label and a
 * generic question, so a template added tomorrow works today.
 */
function resolveHint(slug, field) {
  const hint = {
    ...(hints.shared?.[field.key] ?? {}),
    ...(hints.documents?.[slug]?.[field.key] ?? {}),
  };

  return {
    ...field,
    ask: hint.ask ?? `What should the ${field.label} be?`,
    ...(hint.caption ? { caption: hint.caption } : {}),
    type: hint.type ?? "text",
    ...(hint.options ? { options: hint.options } : {}),
    required: hint.required ?? false,
  };
}

/** Pulls every variable reference out of one template's markdown. */
function extractVariables(markdown) {
  const found = [];
  const regex = new RegExp(VARIABLE.source, VARIABLE.flags);
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    found.push({ group: match[1], label: depossess(match[2].trim()) });
  }
  return found;
}

/**
 * Turns raw variable hits into the ordered, de-duplicated field list for a
 * document, and separates the two party roles from the rest.
 */
function buildFields(slug, markdown) {
  const raw = extractVariables(markdown);
  const vocabulary = new Set(raw.map((item) => item.label));

  const parties = [];
  const fields = [];
  const seen = new Set();

  for (const item of raw) {
    const label = singularize(item.label, vocabulary);

    if (PARTY_ROLES.has(label)) {
      if (!parties.includes(label)) parties.push(label);
      continue;
    }

    const key = toKey(label);
    if (seen.has(key)) continue;
    seen.add(key);
    fields.push({ key, label, group: item.group });
  }

  for (const extra of EXTRA_FIELDS[slug] ?? []) {
    const key = toKey(extra.label);
    if (seen.has(key)) continue;
    seen.add(key);
    fields.push({ key, label: extra.label, group: extra.group });
  }

  fields.sort(
    (a, b) =>
      GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) ||
      a.label.localeCompare(b.label),
  );

  return {
    parties: parties.length === 2 ? parties : DEFAULT_PARTY_ROLES,
    fields: fields.map((field) => resolveHint(slug, field)),
  };
}

/** "Mutual Non-Disclosure Agreement (Standard Terms)" -> "mutual-nda". */
function slugFromFilename(filename) {
  return filename.replace(/-coverpage\.md$/, "").replace(/\.md$/, "");
}

/**
 * Folds catalog.json into one entry per agreement.
 *
 * The catalog lists twelve templates but describes eleven agreements: the
 * Mutual NDA is split into standard terms and a cover page, and both rows point
 * at the same document.
 */
function loadCatalog() {
  const catalog = JSON.parse(readFileSync(catalogFile, "utf8"));
  const documents = new Map();

  for (const entry of catalog.templates) {
    const slug = slugFromFilename(entry.filename);
    const isCoverPage = entry.filename.endsWith("-coverpage.md");

    if (!documents.has(slug)) {
      documents.set(slug, {
        slug,
        name: entry.name.replace(/\s*\((Standard Terms|Cover Page)\)$/, ""),
        description: entry.description,
        standardTermsFile: null,
        coverPageFile: null,
      });
    }

    const document = documents.get(slug);
    if (isCoverPage) {
      document.coverPageFile = entry.filename;
    } else {
      document.standardTermsFile = entry.filename;
      document.description = entry.description;
    }
  }

  return [...documents.values()];
}

const documents = loadCatalog().map((document) => {
  const standardTerms = read(document.standardTermsFile);
  const { parties, fields } = buildFields(document.slug, standardTerms);

  const groups = GROUP_ORDER.filter((group) =>
    fields.some((field) => field.group === group),
  );

  return {
    ...document,
    standardTerms,
    coverPage: document.coverPageFile ? read(document.coverPageFile) : null,
    parties,
    fields,
    groups,
    ...(hints.limitations?.[document.slug]
      ? { limitation: hints.limitations[document.slug] }
      : {}),
  };
});

if (documents.length === 0) {
  throw new Error("catalog.json produced no documents -- refusing to build.");
}

for (const document of documents) {
  if (document.fields.length === 0) {
    throw new Error(
      `Template "${document.standardTermsFile}" declares no fill-in variables. ` +
        `Either it is not a Common Paper standard-terms document or the ` +
        `<span class="..._link"> convention has changed.`,
    );
  }
}

// --- frontend artifact -----------------------------------------------------

const banner = `// GENERATED FILE -- DO NOT EDIT.
// Produced by scripts/build-documents.mjs from templates/ and catalog.json.
// Edit the markdown in templates/ and re-run \`npm run build:documents\`.
`;

const frontendBody = `import type { DocumentDefinition } from "@/lib/documents/types";

/** Every agreement the product can draft, derived from the templates. */
export const documents: DocumentDefinition[] = ${JSON.stringify(documents, null, 2)};

/** Section headings for the field groups, by group name. */
export const groupLabels: Record<string, string> = ${JSON.stringify(GROUP_LABELS, null, 2)};
`;

mkdirSync(dirname(frontendOut), { recursive: true });
writeFileSync(frontendOut, `${banner}\n${frontendBody}`, "utf8");

// --- backend artifact ------------------------------------------------------

// Fields only: the backend builds the LLM's schema and prompt from these, and
// has no use for the agreement text -- the browser renders that.
const backendPayload = {
  _generated: "by frontend/scripts/build-documents.mjs -- do not edit",
  documents: documents.map(
    ({ slug, name, description, parties, fields, groups, limitation }) => ({
      slug,
      name,
      description,
      parties,
      fields,
      groups,
      ...(limitation ? { limitation } : {}),
    }),
  ),
  groupLabels: GROUP_LABELS,
};

mkdirSync(dirname(backendOut), { recursive: true });
writeFileSync(backendOut, `${JSON.stringify(backendPayload, null, 2)}\n`, "utf8");

const summary = documents
  .map((document) => `${document.slug}(${document.fields.length})`)
  .join(", ");
console.log(
  `build-documents: ${documents.length} documents -> src/generated/documents.ts, ` +
    `backend/app/chat/documents.json\n  ${summary}`,
);
