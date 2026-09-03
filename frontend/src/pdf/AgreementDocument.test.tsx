// @vitest-environment node
/**
 * The PDF renderer, exercised for real rather than mocked.
 *
 * @react-pdf/renderer emits real text, so these tests read the words back out
 * of the generated file. That is the only way to catch a block kind that
 * renders to nothing: an unhandled variant returns undefined, which is a legal
 * ReactNode, so the content would silently vanish from the download while every
 * type check passed.
 */
import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import zlib from "node:zlib";
import { AgreementPdfDocument } from "./AgreementDocument";
import { assembleAgreement } from "@/lib/assemble";
import { documentFixture, filledValues } from "@/lib/fixtures";
import { emptyValues } from "@/lib/values";

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
    i = end + "endstream".length;
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

function renderFor(slug: string, filled = true) {
  const document = documentFixture(slug);
  const values = filled ? filledValues(slug) : emptyValues(slug);
  return renderToBuffer(
    <AgreementPdfDocument
      document={assembleAgreement(document, values)}
      name={document.name}
    />,
  );
}

describe("the rendered PDF", () => {
  it("carries the agreement's own name as its title", async () => {
    const pdf = await renderFor("service-level-agreement");
    expect(pdf.toString("latin1")).toContain("Service Level Agreement");
  }, 60_000);

  it("includes the captured values", async () => {
    const pdf = await renderFor("mutual-nda");
    const text = extractText(pdf);

    expect(text).toContain("Aardvark Industries, Inc.");
    expect(text).toContain("Bramble Analytics Ltd");
  }, 60_000);

  it("includes the standard terms below the cover page", async () => {
    const pdf = await renderFor("service-level-agreement");
    const text = extractText(pdf);

    expect(text).toContain("Uptime");
    expect(text).toContain("Available Minutes");
  }, 60_000);

  it("renders the nested clause numbering the templates use", async () => {
    // Before PL-6 these agreements had no numbering at all in the output.
    const pdf = await renderFor("service-level-agreement");
    const text = extractText(pdf);

    expect(text).toContain("1.1");
    expect(text).toContain("3.2");
  }, 60_000);

  it("numbers the pages of a long agreement", async () => {
    // The footer is the reason FOOTER_FROM_TOP exists: positioned with
    // `bottom`, this document does not render at all.
    const pdf = await renderFor("cloud-service-agreement");
    expect(extractText(pdf)).toMatch(/1 of \d+/);
  }, 60_000);

  it("shows placeholders for what is still blank", async () => {
    const pdf = await renderFor("service-level-agreement", false);
    expect(extractText(pdf)).toContain("[Target Uptime]");
  }, 60_000);
});

describe("every agreement", () => {
  // Rendering all eleven is the check that no template contains a construct
  // one of the two renderers cannot draw.
  it.each([
    "ai-addendum",
    "business-associate-agreement",
    "cloud-service-agreement",
    "data-processing-agreement",
    "design-partner-agreement",
    "mutual-nda",
    "partnership-agreement",
    "pilot-agreement",
    "professional-services-agreement",
    "service-level-agreement",
    "software-license-agreement",
  ])("%s renders to a non-trivial PDF", async (slug) => {
    const pdf = await renderFor(slug);
    const text = extractText(pdf);

    expect(pdf.length).toBeGreaterThan(1000);
    expect(text).toContain("Signature");
    // Unrendered markup would mean a block kind fell through to nothing.
    expect(text).not.toContain("<span");
  }, 120_000);
});
