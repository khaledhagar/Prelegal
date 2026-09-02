// @vitest-environment node
/**
 * Renders real PDFs through @react-pdf/renderer and inspects the bytes.
 *
 * This is the closest thing to an end-to-end test of the download path without
 * a browser: if a block kind is unhandled, a style is invalid, or text fails to
 * reach the page, rendering throws or the text is absent from the output.
 */
import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import zlib from "node:zlib";
import { NdaPdfDocument } from "./NdaDocument";
import { assembleDocument } from "@/lib/assemble";
import { defaultFormValues, type NdaFormValues } from "@/lib/form";
import { filledFormValues as filled } from "@/lib/fixtures";

function render(values: NdaFormValues) {
  return renderToBuffer(<NdaPdfDocument document={assembleDocument(values)} />);
}

/**
 * Extracts drawn text. react-pdf emits TJ arrays of hex strings against the
 * standard-14 fonts with WinAnsiEncoding, so each byte is a character code.
 */
function extractText(pdf: Buffer): string {
  let streams = "";
  const marker = Buffer.from("stream");
  let i = 0;
  while ((i = pdf.indexOf(marker, i)) !== -1) {
    let start = i + marker.length;
    if (pdf[start] === 0x0d) start++;
    if (pdf[start] === 0x0a) start++;
    const end = pdf.indexOf(Buffer.from("endstream"), start);
    if (end === -1) break;
    try {
      streams += zlib.inflateSync(pdf.subarray(start, end)).toString("latin1");
    } catch {
      /* not a compressed stream */
    }
    i = end + "endstream".length; // never re-match inside "endstream"
  }

  const winAnsi: Record<number, string> = {
    0x91: "‘", 0x92: "’", 0x93: "“", 0x94: "”", 0x95: "•", 0x96: "–", 0x97: "—",
  };
  let text = "";
  for (const token of streams.match(/<[0-9A-Fa-f]+>/g) || []) {
    const hex = token.slice(1, -1);
    for (let n = 0; n + 1 < hex.length; n += 2) {
      const code = parseInt(hex.slice(n, n + 2), 16);
      text += winAnsi[code] ?? String.fromCharCode(code);
    }
  }
  return text;
}

const countPages = (pdf: Buffer) =>
  (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;

describe("NdaPdfDocument", () => {
  it("produces a structurally valid PDF", async () => {
    const pdf = await render(filled());
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.toString("latin1")).toContain("%%EOF");
    expect(pdf.length).toBeGreaterThan(5000);
  }, 30_000);

  it("spans multiple pages for the full agreement", async () => {
    expect(countPages(await render(filled()))).toBeGreaterThan(1);
  }, 30_000);

  it("embeds fonts and no raster images", async () => {
    // 0 images is the guarantee that the text is vector, not a screenshot.
    const raw = (await render(filled())).toString("latin1");
    expect((raw.match(/\/Type\s*\/Font/g) || []).length).toBeGreaterThan(0);
    expect((raw.match(/\/Subtype\s*\/Image/g) || []).length).toBe(0);
  }, 30_000);

  it("contains every value the user entered", async () => {
    const text = extractText(await render(filled()));
    for (const expected of [
      "Delaware",
      "New Castle",
      "Acme",
      "Globex",
      "Jordan Lee",
      "Sam Rivera",
      "Chief Executive Officer",
      "General Counsel",
      "legal@acme.com",
      "notices@globex.com",
      "March 8, 2026",
    ]) {
      expect(text).toContain(expected);
    }
  }, 30_000);

  it("contains the standard terms and the CC BY attribution", async () => {
    const text = extractText(await render(filled()));
    expect(text).toContain("Standard Terms");
    expect(text).toContain("Confidential Information");
    expect(text).toContain("CC BY 4.0");
  }, 30_000);

  // These two paths had never been rendered to PDF before this suite existed.
  it("renders the until-terminated MNDA term", async () => {
    const text = extractText(await render(filled({ mndaTerm: "untilTerminated" })));
    expect(text).toContain("Continues until terminated");
  }, 30_000);

  it("renders the perpetual confidentiality term", async () => {
    const text = extractText(await render(filled({ confidentiality: "perpetual" })));
    expect(text).toContain("In perpetuity");
  }, 30_000);

  it("renders the modifications section when provided", async () => {
    const text = extractText(
      await render(filled({ modifications: "Section 5 is deleted in its entirety." })),
    );
    expect(text).toContain("Section 5 is deleted in its entirety.");
  }, 30_000);

  it("renders an entirely blank form without throwing", async () => {
    const pdf = await render(defaultFormValues());
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  }, 30_000);

  it("renders a very long purpose without throwing", async () => {
    const pdf = await render(filled({ purpose: "Lorem ipsum dolor sit amet. ".repeat(200) }));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(countPages(pdf)).toBeGreaterThan(1);
  }, 60_000);

  it("renders curly quotes from the template without corruption", async () => {
    const text = extractText(await render(filled()));
    expect(text).toContain("“MNDA”");
  }, 30_000);
});
