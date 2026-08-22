/**
 * Reads the Mutual NDA markdown from the repository's `templates/` directory
 * and emits it as a typed TypeScript module.
 *
 * The templates directory (populated by PL-2) is the single source of truth for
 * agreement text. Because the app is a static client-side export, the text has
 * to be inlined into the bundle at build time rather than read from disk at
 * runtime -- this script is what does that.
 *
 * Runs automatically via the `predev` and `prebuild` npm scripts.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const templatesDir = resolve(repoRoot, "templates");
const outFile = resolve(here, "..", "src", "generated", "mnda-template.ts");

/** Files pulled into the bundle, keyed by the export name they receive. */
const SOURCES = {
  standardTerms: "mutual-nda.md",
  coverPage: "mutual-nda-coverpage.md",
};

function read(filename) {
  const path = resolve(templatesDir, filename);
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (cause) {
    throw new Error(
      `Could not read template "${filename}" from ${templatesDir}. ` +
        `The front-end build depends on the repository's templates/ directory ` +
        `(see PL-2). Original error: ${cause.message}`,
    );
  }
  if (raw.trim().length === 0) {
    throw new Error(`Template "${filename}" is empty -- refusing to build.`);
  }
  return raw.replace(/\r\n/g, "\n");
}

const banner = `// GENERATED FILE -- DO NOT EDIT.
// Produced by scripts/build-template.mjs from the repository's templates/ directory.
// Edit the markdown in templates/ and re-run \`npm run dev\` or \`npm run build\`.
`;

const body = Object.entries(SOURCES)
  .map(([exportName, filename]) => {
    const text = read(filename);
    return (
      `/** Verbatim contents of templates/${filename}. */\n` +
      `export const ${exportName} = ${JSON.stringify(text)};`
    );
  })
  .join("\n\n");

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, `${banner}\n${body}\n`, "utf8");

const names = Object.values(SOURCES).join(", ");
console.log(`build-template: inlined ${names} -> src/generated/mnda-template.ts`);
