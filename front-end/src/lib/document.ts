/**
 * The shared document model.
 *
 * Both the on-screen preview and the downloadable PDF render from this model,
 * so the two can never drift apart: whatever you see is what you download.
 * Nothing in here knows about React or PDFs.
 */

/** A run of text with optional emphasis. */
export type Inline =
  | { kind: "text"; text: string }
  | { kind: "strong"; text: string }
  /** A cross-reference to a value defined on the cover page, e.g. "Purpose". */
  | { kind: "reference"; text: string }
  | { kind: "link"; text: string; href: string }
  /** A value supplied by the user, highlighted so gaps are obvious. */
  | { kind: "value"; text: string; filled: boolean };

export type Block =
  | { kind: "title"; text: string }
  | { kind: "heading"; text: string }
  /** A short caption under a heading, from the template's <label> elements. */
  | { kind: "label"; text: string }
  | { kind: "paragraph"; content: Inline[] }
  /** A numbered clause: "1. **Introduction**. ..." */
  | { kind: "clause"; number: number; content: Inline[] }
  /** A checkbox option, used by the term-selection sections. */
  | { kind: "option"; checked: boolean; content: Inline[] }
  /** The two-party signature block. */
  | { kind: "signatures"; rows: SignatureRow[]; parties: [string, string] }
  /** Fine print rendered smaller, e.g. the CC BY attribution. */
  | { kind: "footnote"; content: Inline[] };

export type SignatureRow = {
  label: string;
  /** Empty strings render as a blank line to sign or write on. */
  values: [string, string];
};

export type NdaDocument = {
  blocks: Block[];
};

/** Convenience for the common case of a plain-text paragraph. */
export function paragraph(text: string): Block {
  return { kind: "paragraph", content: [{ kind: "text", text }] };
}

/** Flattens inline content back to plain text (used for accessibility labels). */
export function inlineToPlainText(content: Inline[]): string {
  return content.map((run) => run.text).join("");
}
