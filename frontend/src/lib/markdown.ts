/**
 * A deliberately small markdown reader for the Common Paper standard terms.
 *
 * This is not a general markdown parser and should not become one. The standard
 * terms use exactly four constructs, so we handle those four and nothing else:
 *
 *   - a single `# ` title
 *   - numbered clauses, `1. **Introduction**. body...`
 *   - `**bold**` runs
 *   - `[text](url)` links and `<span class="coverpage_link">Name</span>` refs
 *
 * Pulling in a full markdown pipeline (remark/rehype) would add dependencies and
 * an AST we would still have to translate twice -- once for HTML, once for PDF.
 */
import type { Block, Inline } from "./document";

const CLAUSE = /^(\d+)\.\s+(.*)$/;
const COVERPAGE_REF = /<span class="coverpage_link">(.*?)<\/span>/g;
const STRONG = /\*\*(.+?)\*\*/g;
const LINK = /\[([^\]]+)\]\(([^)]+)\)/g;

type Token = { start: number; end: number; run: Inline };

/**
 * Parses inline markup. Each pattern is matched independently over the raw
 * string, then the resulting tokens are sorted and stitched together with the
 * plain text between them. Overlapping matches are resolved first-wins, which
 * is safe here because the four patterns cannot legally overlap.
 */
export function parseInline(source: string): Inline[] {
  const tokens: Token[] = [];

  const collect = (
    pattern: RegExp,
    build: (match: RegExpExecArray) => Inline,
  ) => {
    // Each call gets a fresh regex so the shared /g lastIndex never leaks.
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(source)) !== null) {
      tokens.push({ start: match.index, end: regex.lastIndex, run: build(match) });
    }
  };

  collect(COVERPAGE_REF, (m) => ({ kind: "reference", text: m[1] }));
  collect(LINK, (m) => ({ kind: "link", text: m[1], href: m[2] }));
  collect(STRONG, (m) => ({ kind: "strong", text: m[1] }));

  tokens.sort((a, b) => a.start - b.start);

  const runs: Inline[] = [];
  let cursor = 0;
  for (const token of tokens) {
    if (token.start < cursor) continue; // overlapped by an earlier token
    if (token.start > cursor) {
      runs.push({ kind: "text", text: source.slice(cursor, token.start) });
    }
    runs.push(token.run);
    cursor = token.end;
  }
  if (cursor < source.length) {
    runs.push({ kind: "text", text: source.slice(cursor) });
  }

  return runs.filter((run) => run.kind !== "text" || run.text.length > 0);
}

/**
 * Parses the standard terms into blocks. The terms are reproduced verbatim --
 * user values are never substituted into them, because Common Paper directs
 * that modifications belong on the cover page.
 */
export function parseStandardTerms(markdown: string): Block[] {
  const blocks: Block[] = [];

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0) continue;

    if (line.startsWith("# ")) {
      blocks.push({ kind: "title", text: line.slice(2).trim() });
      continue;
    }

    const clause = CLAUSE.exec(line);
    if (clause) {
      blocks.push({
        kind: "clause",
        number: Number(clause[1]),
        content: parseInline(clause[2]),
      });
      continue;
    }

    // The only remaining line in this template is the CC BY attribution.
    blocks.push({ kind: "footnote", content: parseInline(line) });
  }

  return blocks;
}
