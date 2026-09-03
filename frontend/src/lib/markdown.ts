/**
 * A deliberately small markdown reader for the Common Paper standard terms.
 *
 * This is still not a general markdown parser and should not become one. It
 * handles the closed set of constructs the eleven templates in templates/
 * actually use, and nothing else:
 *
 *   - a single `# ` title
 *   - numbered clauses, flat (`1. **Introduction**. body`) or nested three
 *     deep (`1.` / `1.1` / `a.`), indented four spaces per level
 *   - `<span class="header_2">`/`header_3` section headings, and bare
 *     `<span id="...">` wrappers, which carry no meaning we render
 *   - `**bold**` runs
 *   - `[text](url)` links
 *   - variable references: `<span class="keyterms_link">Governing Law</span>`
 *     and its four siblings, which name a value from the cover page
 *
 * PL-6 widened this from the Mutual NDA's flat clauses to the nested numbering
 * the other ten agreements use. Pulling in remark/rehype would still add an AST
 * we would have to translate twice, once for HTML and once for PDF.
 */
import type { Block, Inline } from "./document";

/**
 * The five namespaces a variable can belong to.
 *
 * Common Paper splits the fill-in half of an agreement across a Cover Page, an
 * Order Form, Key Terms, Business Terms or a Statement of Work; which one a
 * value lives on is encoded in the span's class. We render them identically --
 * the distinction matters when building the cover page, not when reading the
 * terms.
 */
const VARIABLE_REF = /<span class="[a-z]+_link"[^>]*>(.*?)<\/span>/g;
const STRONG = /\*\*(.+?)\*\*/g;
const LINK = /\[([^\]]+)\]\(([^)]+)\)/g;

const SPAN_OPEN = /^<span\b([^>]*)>/;
const SPAN_CLOSE = "</span>";
/** `<span class="header_2" id="1">Uptime</span>` -- a heading, rendered bold. */
const HEADER_ATTRS = /class="header_\d"/;
const VARIABLE_ATTRS = /class="[a-z]+_link"/;

/** A clause marker: `1.`, `a.` or `iv.`, followed by its text. */
const CLAUSE = /^(\d+|[a-z]|[ivx]+)\.\s+(.*)$/;

/** Four spaces of indent per level of nesting, as the templates are written. */
const INDENT_WIDTH = 4;
const MAX_DEPTH = 2;

/**
 * A matched span of the source and the runs it produces.
 *
 * A token yields several runs rather than one because emphasis can wrap a
 * variable reference -- "**If there are <span ...>Increased Claims</span>, ...**"
 * appears in the liability sections of half the templates. The bold run is
 * parsed again and its inner references survive as references.
 */
type Token = { start: number; end: number; runs: Inline[] };

/**
 * Removes the spans that carry structure rather than content.
 *
 * Header spans become `**bold**`, because that is how the Mutual NDA already
 * writes a clause's lead-in, so both styles render through one path. Bare
 * `<span id="4.1">` wrappers are unwrapped, their contents kept as-is: those
 * contents are usually already bold, and re-emphasising them would produce
 * `****term****`.
 *
 * This walks the tags rather than pairing them with a regex because the spans
 * nest -- the CSA's definition of "Variable" wraps two variable references
 * inside one `<span id>`. A non-greedy pattern closes such a wrapper on the
 * first `</span>` it meets, which is the inner one, and leaves the outer
 * closing tag behind as visible markup.
 */
function stripStructuralSpans(source: string): string {
  /** What to emit when each currently-open span closes. */
  const open: Array<"keep" | "drop" | "strong"> = [];
  let out = "";
  let index = 0;

  while (index < source.length) {
    if (source.startsWith(SPAN_CLOSE, index)) {
      // A close with nothing open is stray markup, not content: the Cloud
      // Service Agreement's definition of "Variable" carries a doubled
      // `</span>`. Dropping it beats printing it into the agreement.
      const kind = open.pop() ?? "drop";
      if (kind === "keep") out += SPAN_CLOSE;
      if (kind === "strong") out += "**";
      index += SPAN_CLOSE.length;
      continue;
    }

    const tag = SPAN_OPEN.exec(source.slice(index));
    if (tag) {
      if (VARIABLE_ATTRS.test(tag[1])) {
        open.push("keep");
        out += tag[0];
      } else if (HEADER_ATTRS.test(tag[1])) {
        open.push("strong");
        out += "**";
      } else {
        open.push("drop");
      }
      index += tag[0].length;
      continue;
    }

    out += source[index];
    index += 1;
  }

  return out;
}

/**
 * Parses inline markup. Each pattern is matched independently over the raw
 * string, then the resulting tokens are sorted and stitched together with the
 * plain text between them. Overlapping matches are resolved first-wins, which
 * is safe here because the patterns cannot legally overlap.
 */
export function parseInline(source: string): Inline[] {
  const text = stripStructuralSpans(source);
  const tokens: Token[] = [];

  const collect = (
    pattern: RegExp,
    build: (match: RegExpExecArray) => Inline[],
  ) => {
    // Each call gets a fresh regex so the shared /g lastIndex never leaks.
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      tokens.push({ start: match.index, end: regex.lastIndex, runs: build(match) });
    }
  };

  collect(VARIABLE_REF, (m) => [{ kind: "reference", text: m[1] }]);
  collect(LINK, (m) => [{ kind: "link", text: m[1], href: m[2] }]);
  // Emphasis is parsed again so a reference inside it stays a reference. The
  // inner text cannot contain `**` -- the pattern is non-greedy -- so this
  // recurses exactly one level.
  collect(STRONG, (m) =>
    parseInline(m[1]).map((run) =>
      run.kind === "text" ? { kind: "strong", text: run.text } : run,
    ),
  );

  tokens.sort((a, b) => a.start - b.start);

  const runs: Inline[] = [];
  let cursor = 0;
  for (const token of tokens) {
    if (token.start < cursor) continue; // overlapped by an earlier token
    if (token.start > cursor) {
      runs.push({ kind: "text", text: text.slice(cursor, token.start) });
    }
    runs.push(...token.runs);
    cursor = token.end;
  }
  if (cursor < text.length) {
    runs.push({ kind: "text", text: text.slice(cursor) });
  }

  return runs.filter((run) => run.kind !== "text" || run.text.length > 0);
}

/** How many levels in a line sits, from its leading whitespace. */
function depthOf(rawLine: string): number {
  const indent = rawLine.length - rawLine.trimStart().length;
  return Math.min(Math.floor(indent / INDENT_WIDTH), MAX_DEPTH);
}

/** a, b, c ... for the third level, matching how the templates letter them. */
function letter(index: number): string {
  return String.fromCharCode("a".charCodeAt(0) + index - 1);
}

/**
 * Numbers a clause from its position rather than from the digit in the source.
 *
 * The templates restart at `1.` inside each nested list, the way markdown
 * expects, so the literal marker is not the number a reader should see. Section
 * 3's second sub-clause is "3.2" however the source writes it.
 */
function markerFor(counters: number[], depth: number): string {
  if (depth === 0) return `${counters[0]}.`;
  if (depth === 1) return `${counters[0]}.${counters[1]}`;
  return `${letter(counters[2])}.`;
}

/**
 * True when a clause is only a section heading -- a numbered line whose whole
 * content was a header span, with no body after it.
 */
function isSectionHeading(original: string, content: Inline[]): boolean {
  return (
    /^<span class="header_\d"[^>]*>[^<]*<\/span>\s*$/.test(original.trim()) &&
    content.length === 1 &&
    content[0].kind === "strong"
  );
}

/**
 * Parses the standard terms into blocks. The terms are reproduced verbatim --
 * user values are never substituted into them, because Common Paper directs
 * that modifications belong on the cover page.
 */
export function parseStandardTerms(markdown: string): Block[] {
  const blocks: Block[] = [];
  const counters = [0, 0, 0];

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0) continue;

    if (line.startsWith("# ")) {
      blocks.push({ kind: "title", text: line.slice(2).trim() });
      continue;
    }

    const clause = CLAUSE.exec(line);
    if (clause) {
      const depth = depthOf(rawLine);
      counters[depth] += 1;
      for (let deeper = depth + 1; deeper < counters.length; deeper += 1) {
        counters[deeper] = 0;
      }

      const marker = markerFor(counters, depth);
      const content = parseInline(clause[2]);

      if (isSectionHeading(clause[2], content)) {
        blocks.push({ kind: "section", marker, text: content[0].text });
      } else {
        blocks.push({ kind: "clause", marker, depth, content });
      }
      continue;
    }

    // Anything else is fine print -- in practice the CC BY attribution line.
    blocks.push({ kind: "footnote", content: parseInline(line) });
  }

  return blocks;
}
