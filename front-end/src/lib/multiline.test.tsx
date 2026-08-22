// @vitest-environment node
/**
 * Regression tests for two defects found in code review.
 *
 * 1. Multi-line Purpose / Modifications collapsed into one run-on line.
 *    HTML collapses whitespace and @react-pdf/renderer ignores newlines inside
 *    a Text node, so a single block dropped the user's line structure in BOTH
 *    outputs. Confirmed before the fix: the PDF read "...is deleted.2. Con...".
 *
 * 2. The Block switches were not actually exhaustive. Without an assertNever
 *    guard, a renderer missing a case returns undefined -- a legal ReactNode --
 *    so the content silently vanished. `tsc --noEmit` passed with an entirely
 *    unhandled variant.
 */
import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import zlib from "node:zlib";
import { NdaPdfDocument } from "@/pdf/NdaDocument";
import { assembleDocument, buildCoverPage } from "./assemble";
import { assertNever, splitParagraphs } from "./document";
import { filledFormValues as filled } from "./fixtures";

const MULTILINE = "1. Section 5 is deleted.\n2. Confidentiality is 3 years.";

/** Inflates every FlateDecode stream in the PDF into one string. */
function inflateStreams(pdf: Buffer): string {
  let out = "";
  const marker = Buffer.from("stream");
  let i = 0;
  while ((i = pdf.indexOf(marker, i)) !== -1) {
    let start = i + marker.length;
    if (pdf[start] === 0x0d) start++;
    if (pdf[start] === 0x0a) start++;
    const end = pdf.indexOf(Buffer.from("endstream"), start);
    if (end === -1) break;
    try {
      out += zlib.inflateSync(pdf.subarray(start, end)).toString("latin1");
    } catch {
      /* not a compressed stream */
    }
    i = end + "endstream".length; // never re-match inside "endstream"
  }
  return out;
}

/** The text actually drawn on the page, decoded from hex TJ arrays. */
function extractText(pdf: Buffer): string {
  let text = "";
  for (const token of inflateStreams(pdf).match(/<[0-9A-Fa-f]+>/g) || []) {
    const hex = token.slice(1, -1);
    for (let n = 0; n + 1 < hex.length; n += 2) {
      text += String.fromCharCode(parseInt(hex.slice(n, n + 2), 16));
    }
  }
  return text;
}

/**
 * Counts text objects (BT ... ET). Each rendered <Text> emits its own, so this
 * distinguishes "two paragraphs" from "one paragraph containing a newline" --
 * which extracted text cannot, since extraction concatenates runs.
 */
function countTextObjects(pdf: Buffer): number {
  return (inflateStreams(pdf).match(/BT/g) || []).length;
}

describe("splitParagraphs", () => {
  it("splits on newlines", () => {
    expect(splitParagraphs("a\nb")).toEqual(["a", "b"]);
  });

  it("handles CRLF from Windows clipboards", () => {
    expect(splitParagraphs("a\r\nb")).toEqual(["a", "b"]);
  });

  it("drops blank lines and trims each line", () => {
    expect(splitParagraphs("  a  \n\n\n  b  \n")).toEqual(["a", "b"]);
  });

  it("returns an empty array for blank input", () => {
    expect(splitParagraphs("")).toEqual([]);
    expect(splitParagraphs("  \n \n ")).toEqual([]);
  });

  it("returns a single entry for single-line input", () => {
    expect(splitParagraphs("just one line")).toEqual(["just one line"]);
  });
});

describe("multi-line modifications", () => {
  it("becomes one block per line, not one run-on block", () => {
    const blocks = buildCoverPage(filled({ modifications: MULTILINE }));
    const index = blocks.findIndex(
      (b) => b.kind === "heading" && b.text === "MNDA Modifications",
    );
    expect(index).toBeGreaterThanOrEqual(0);
    expect(blocks[index + 1]).toMatchObject({
      kind: "paragraph",
      content: [{ text: "1. Section 5 is deleted." }],
    });
    expect(blocks[index + 2]).toMatchObject({
      kind: "paragraph",
      content: [{ text: "2. Confidentiality is 3 years." }],
    });
  });

  it("keeps the lines separated in the PDF", async () => {
    const pdf = await renderToBuffer(
      <NdaPdfDocument document={assembleDocument(filled({ modifications: MULTILINE }))} />,
    );
    const text = extractText(pdf);
    expect(text).toContain("1. Section 5 is deleted.");
    expect(text).toContain("2. Confidentiality is 3 years.");

    // Structural check: the split must draw strictly more text objects than
    // the same content on one line. Extracted text cannot show this, because
    // extraction concatenates runs with no separator. (BT counts drawn lines,
    // not paragraphs, so assert the direction rather than an exact delta.)
    const oneLine = await renderToBuffer(
      <NdaPdfDocument
        document={assembleDocument(filled({ modifications: "1. Section 5 is deleted." }))}
      />,
    );
    expect(countTextObjects(pdf)).toBeGreaterThan(countTextObjects(oneLine));
  }, 60_000);
});

describe("multi-line purpose", () => {
  it("becomes one block per line", () => {
    const blocks = buildCoverPage(filled({ purpose: "First reason.\nSecond reason." }));
    const index = blocks.findIndex((b) => b.kind === "heading" && b.text === "Purpose");
    expect(blocks[index + 2]).toMatchObject({
      kind: "paragraph",
      content: [{ text: "First reason." }],
    });
    expect(blocks[index + 3]).toMatchObject({
      kind: "paragraph",
      content: [{ text: "Second reason." }],
    });
  });

  it("still shows a placeholder when left blank", () => {
    const blocks = buildCoverPage(filled({ purpose: "   " }));
    const index = blocks.findIndex((b) => b.kind === "heading" && b.text === "Purpose");
    expect(blocks[index + 2]).toMatchObject({
      kind: "paragraph",
      content: [{ kind: "value", filled: false, text: "[Describe the purpose]" }],
    });
  });

  it("keeps the lines separated in the PDF", async () => {
    const twoLines = await renderToBuffer(
      <NdaPdfDocument
        document={assembleDocument(filled({ purpose: "First reason.\nSecond reason." }))}
      />,
    );
    const oneLine = await renderToBuffer(
      <NdaPdfDocument
        document={assembleDocument(filled({ purpose: "First reason. Second reason." }))}
      />,
    );
    expect(extractText(twoLines)).toContain("First reason.");
    expect(extractText(twoLines)).toContain("Second reason.");
    // Structural: the split draws strictly more text objects than the same
    // words on a single line.
    expect(countTextObjects(twoLines)).toBeGreaterThan(countTextObjects(oneLine));
  }, 60_000);
});

describe("assertNever", () => {
  it("throws when reached at runtime", () => {
    // Only reachable if a renderer is given a variant it does not handle.
    expect(() => assertNever("unexpected" as never)).toThrow(
      /Unhandled document variant/,
    );
  });
});
