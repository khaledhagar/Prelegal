// @vitest-environment node
import { describe, expect, it } from "vitest";
import { allDocuments } from "./documents/registry";
import { assembleAgreement, buildCoverPage } from "./assemble";
import { documentFixture, filledValues } from "./fixtures";
import { emptyValues } from "./values";
import type { Block } from "./document";

const headings = (blocks: Block[]) =>
  blocks
    .filter((block): block is Extract<Block, { kind: "heading" }> =>
      block.kind === "heading",
    )
    .map((block) => block.text);

const options = (blocks: Block[]) =>
  blocks.filter((block): block is Extract<Block, { kind: "option" }> =>
    block.kind === "option",
  );

const plainText = (blocks: Block[]) =>
  blocks
    .flatMap((block) => ("content" in block ? block.content : []))
    .map((run) => run.text)
    .join(" ");

describe("buildCoverPage", () => {
  it("opens with the agreement's name and what it is made of", () => {
    const document = documentFixture("service-level-agreement");
    const blocks = buildCoverPage(document, emptyValues(document.slug));

    expect(blocks[0]).toEqual({ kind: "title", text: document.name });
    expect(plainText([blocks[1]])).toContain("consists of");
    expect(plainText([blocks[1]])).toContain("Standard Terms");
  });

  it("links to the published standard terms when the template names them", () => {
    const document = documentFixture("service-level-agreement");
    const blocks = buildCoverPage(document, emptyValues(document.slug));
    const links = blocks
      .flatMap((block) => ("content" in block ? block.content : []))
      .filter((run) => run.kind === "link");

    expect(links[0]?.text).toContain("commonpaper.com/standards");
  });

  it("shows required fields even when blank, so the gap is visible", () => {
    const document = documentFixture("service-level-agreement");
    const blocks = buildCoverPage(document, emptyValues(document.slug));

    expect(headings(blocks)).toContain("Target Uptime");
  });

  it("hides optional fields until they are answered", () => {
    // An empty optional heading on a signed agreement invites confusion about
    // whether it was negotiated and left out, or never discussed.
    const document = documentFixture("service-level-agreement");
    const blank = buildCoverPage(document, emptyValues(document.slug));
    expect(headings(blank)).not.toContain("Scheduled Downtime");

    const values = emptyValues(document.slug);
    values.fields.scheduledDowntime = "Sundays, 02:00-04:00 UTC, 7 days' notice.";
    expect(headings(buildCoverPage(document, values))).toContain("Scheduled Downtime");
  });

  it("groups fields under section headings when an agreement splits them", () => {
    // A PSA's terms live on Key Terms and a Statement of Work.
    const document = documentFixture("professional-services-agreement");
    const blocks = buildCoverPage(document, filledValues(document.slug));

    expect(headings(blocks)).toContain("Statement of Work");
    expect(headings(blocks)).toContain("Key Terms");
  });

  it("omits the group heading when everything sits in one place", () => {
    const document = documentFixture("mutual-nda");
    const blocks = buildCoverPage(document, filledValues(document.slug));

    expect(headings(blocks)).not.toContain("Cover Page");
  });

  it("renders a field's caption under its heading", () => {
    const document = documentFixture("mutual-nda");
    const blocks = buildCoverPage(document, emptyValues(document.slug));
    const labels = blocks.filter((block) => block.kind === "label");

    expect(labels.map((block) => block.text)).toContain(
      "How Confidential Information may be used",
    );
  });

  it("splits multi-line answers into separate paragraphs", () => {
    // HTML collapses whitespace and react-pdf ignores embedded newlines, so a
    // list typed on separate lines would otherwise run together.
    const document = documentFixture("mutual-nda");
    const values = emptyValues(document.slug);
    values.fields.purpose = "First line\nSecond line\nThird line";

    const blocks = buildCoverPage(document, values);
    const texts = blocks
      .filter((block) => block.kind === "paragraph")
      .map((block) => plainText([block]));

    expect(texts).toContain("First line");
    expect(texts).toContain("Second line");
    expect(texts).toContain("Third line");
  });

  it("ends with the signature block, named by the agreement's party roles", () => {
    const document = documentFixture("service-level-agreement");
    const blocks = buildCoverPage(document, emptyValues(document.slug));
    const last = blocks[blocks.length - 1];

    expect(last.kind).toBe("signatures");
    if (last.kind !== "signatures") throw new Error("expected signatures");
    expect(last.parties).toEqual(["Provider", "Customer"]);
    expect(last.rows.map((row) => row.label)).toEqual([
      "Signature",
      "Print Name",
      "Title",
      "Company",
      "Notice Address",
      "Date",
    ]);
  });

  it("puts the companies in the signature block once they are known", () => {
    const document = documentFixture("mutual-nda");
    const blocks = buildCoverPage(document, filledValues(document.slug));
    const last = blocks[blocks.length - 1];

    if (last.kind !== "signatures") throw new Error("expected signatures");
    expect(last.parties).toEqual([
      "Aardvark Industries, Inc.",
      "Bramble Analytics Ltd",
    ]);
  });
});

describe("either/or terms", () => {
  const document = documentFixture("mutual-nda");

  it("ticks the option the answer matches word for word", () => {
    const values = emptyValues(document.slug);
    values.fields.mndaTerm = "Expires 3 year(s) from Effective Date.";

    const blocks = buildCoverPage(document, values);
    const ticked = options(blocks).filter((block) => block.checked);

    expect(ticked).toHaveLength(1);
    expect(plainText(ticked)).toContain("Expires 3 year(s)");
  });

  it("ticks the numbered option when the assistant answers with just a number", () => {
    // The assistant is told to copy the phrase, but it is a language model and
    // will sometimes answer "2 years" to "how long should the NDA run?".
    const values = emptyValues(document.slug);
    values.fields.mndaTerm = "2 years";

    const ticked = options(buildCoverPage(document, values)).filter(
      (block) => block.checked,
    );

    expect(ticked).toHaveLength(1);
    expect(plainText(ticked)).toBe("Expires 2 year(s) from Effective Date.");
  });

  it("ticks the alternative when the answer is the other phrase", () => {
    const values = emptyValues(document.slug);
    values.fields.mndaTerm =
      "Continues until terminated in accordance with the terms of the MNDA.";

    const blocks = buildCoverPage(document, values);
    const ticked = options(blocks).filter((block) => block.checked);

    expect(ticked).toHaveLength(1);
    expect(plainText(ticked)).toContain("until terminated");
  });

  it("leaves every box empty while the term is unanswered", () => {
    const blocks = buildCoverPage(document, emptyValues(document.slug));
    const term = options(blocks);

    expect(term.length).toBeGreaterThan(0);
    expect(term.every((block) => !block.checked)).toBe(true);
  });

  it("shows an answer it cannot match rather than dropping it", () => {
    // Losing what someone actually said would be worse than an unticked box.
    const values = emptyValues(document.slug);
    values.fields.mndaTerm = "Whatever the parties later agree in writing";

    const text = plainText(buildCoverPage(document, values));
    expect(text).toContain("Whatever the parties later agree in writing");
  });
});

describe("assembleAgreement", () => {
  it("is the cover page followed by the verbatim standard terms", () => {
    const document = documentFixture("mutual-nda");
    const values = filledValues(document.slug);

    const cover = buildCoverPage(document, values);
    const whole = assembleAgreement(document, values);

    expect(whole.blocks.slice(0, cover.length)).toEqual(cover);
    expect(whole.blocks.length).toBeGreaterThan(cover.length);
  });

  it("never substitutes a user's value into the standard terms", () => {
    // Common Paper directs that modifications belong on the cover page; the
    // terms below the signature block must read the same for everyone.
    const document = documentFixture("mutual-nda");
    const values = filledValues(document.slug);
    const blocks = assembleAgreement(document, values).blocks;

    const signatureAt = blocks.findIndex((block) => block.kind === "signatures");
    const terms = plainText(blocks.slice(signatureAt + 1));

    expect(terms).not.toContain("Aardvark Industries");
    expect(terms).not.toContain("Delaware");
  });
});

describe("every agreement in the catalog", () => {
  it.each(allDocuments.map((document) => [document.slug, document] as const))(
    "%s assembles from nothing without throwing",
    (_slug, document) => {
      const blocks = assembleAgreement(document, emptyValues(document.slug)).blocks;
      expect(blocks.length).toBeGreaterThan(0);
      expect(blocks[0]).toEqual({ kind: "title", text: document.name });
    },
  );

  it.each(allDocuments.map((document) => [document.slug, document] as const))(
    "%s assembles fully filled in, with a signature block",
    (_slug, document) => {
      const blocks = assembleAgreement(document, filledValues(document.slug)).blocks;
      expect(blocks.filter((block) => block.kind === "signatures")).toHaveLength(1);
    },
  );

  it.each(allDocuments.map((document) => [document.slug, document] as const))(
    "%s shows every required field on its cover page",
    (_slug, document) => {
      const blocks = buildCoverPage(document, emptyValues(document.slug));
      const shown = headings(blocks);

      for (const field of document.fields.filter((candidate) => candidate.required)) {
        expect(shown, `${field.label} is required but never rendered`).toContain(
          field.label,
        );
      }
    },
  );
});
