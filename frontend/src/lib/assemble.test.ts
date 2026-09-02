import { describe, expect, it } from "vitest";
import { assembleDocument, buildCoverPage } from "./assemble";
import { emptyFormValues } from "./form";
import { inlineToPlainText, type Block } from "./document";
import { filledFormValues as filled } from "./fixtures";

/** All rendered text of a block list, for substring assertions. */
function textOf(blocks: Block[]): string {
  return blocks
    .map((block) => {
      switch (block.kind) {
        case "title":
        case "heading":
        case "label":
          return block.text;
        case "paragraph":
        case "clause":
        case "option":
        case "footnote":
          return inlineToPlainText(block.content);
        case "signatures":
          return [
            ...block.parties,
            ...block.rows.flatMap((row) => [row.label, ...row.values]),
          ].join(" ");
      }
    })
    .join("\n");
}

function optionsUnder(blocks: Block[], heading: string) {
  const start = blocks.findIndex((b) => b.kind === "heading" && b.text === heading);
  expect(start).toBeGreaterThanOrEqual(0);
  const options: Extract<Block, { kind: "option" }>[] = [];
  for (let i = start + 1; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.kind === "heading") break;
    if (block.kind === "option") options.push(block);
  }
  return options;
}

describe("buildCoverPage", () => {
  it("opens with the agreement title", () => {
    const [first] = buildCoverPage(filled());
    expect(first).toEqual({
      kind: "title",
      text: "Mutual Non-Disclosure Agreement",
    });
  });

  it("includes every user-entered value", () => {
    const text = textOf(buildCoverPage(filled()));
    for (const expected of [
      "Delaware",
      "courts located in New Castle, DE",
      "Acme, Inc.",
      "Globex Corporation",
      "Jordan Lee",
      "Sam Rivera",
      "Chief Executive Officer",
      "General Counsel",
      "legal@acme.com",
      "notices@globex.com",
    ]) {
      expect(text).toContain(expected);
    }
  });

  it("formats the effective date as long-form prose", () => {
    expect(textOf(buildCoverPage(filled()))).toContain("March 8, 2026");
  });

  it("marks blank required values as unfilled placeholders", () => {
    const blocks = buildCoverPage(filled({ governingLaw: "  " }));
    const values = blocks
      .filter((b) => b.kind === "paragraph")
      .flatMap((b) => (b.kind === "paragraph" ? b.content : []))
      .filter((run) => run.kind === "value");
    const unfilled = values.filter((run) => run.kind === "value" && !run.filled);
    expect(unfilled.some((run) => run.text === "[State]")).toBe(true);
  });

  it("trims surrounding whitespace from entered values", () => {
    const blocks = buildCoverPage(filled({ governingLaw: "  Delaware  " }));
    const values = blocks
      .flatMap((b) => (b.kind === "paragraph" ? b.content : []))
      .filter((run) => run.kind === "value" && run.filled);
    expect(values.some((run) => run.text === "Delaware")).toBe(true);
  });

  describe("MNDA term", () => {
    it("checks the fixed option and pluralizes multiple years", () => {
      const options = optionsUnder(
        buildCoverPage(filled({ mndaTerm: "fixed", mndaTermYears: "3" })),
        "MNDA Term",
      );
      expect(options).toHaveLength(2);
      expect(options[0].checked).toBe(true);
      expect(options[1].checked).toBe(false);
      expect(inlineToPlainText(options[0].content)).toContain("3 years");
    });

    it("uses the singular for exactly one year", () => {
      const options = optionsUnder(
        buildCoverPage(filled({ mndaTerm: "fixed", mndaTermYears: "1" })),
        "MNDA Term",
      );
      expect(inlineToPlainText(options[0].content)).toContain("1 year");
      expect(inlineToPlainText(options[0].content)).not.toContain("1 years");
    });

    // This path was never exercised before these tests existed.
    it("checks the until-terminated option instead", () => {
      const options = optionsUnder(
        buildCoverPage(filled({ mndaTerm: "untilTerminated" })),
        "MNDA Term",
      );
      expect(options[0].checked).toBe(false);
      expect(options[1].checked).toBe(true);
      expect(inlineToPlainText(options[1].content)).toContain(
        "Continues until terminated",
      );
    });

    it("still renders both options when the year field is blank", () => {
      const options = optionsUnder(
        buildCoverPage(filled({ mndaTerm: "fixed", mndaTermYears: "" })),
        "MNDA Term",
      );
      expect(options).toHaveLength(2);
      expect(inlineToPlainText(options[0].content)).toContain("___");
    });
  });

  describe("term of confidentiality", () => {
    it("checks the fixed option by default", () => {
      const options = optionsUnder(
        buildCoverPage(filled({ confidentiality: "fixed", confidentialityYears: "5" })),
        "Term of Confidentiality",
      );
      expect(options[0].checked).toBe(true);
      expect(inlineToPlainText(options[0].content)).toContain("5 years");
      expect(inlineToPlainText(options[0].content)).toContain("trade secret");
    });

    // Likewise never exercised before.
    it("checks the perpetual option instead", () => {
      const options = optionsUnder(
        buildCoverPage(filled({ confidentiality: "perpetual" })),
        "Term of Confidentiality",
      );
      expect(options[0].checked).toBe(false);
      expect(options[1].checked).toBe(true);
      expect(inlineToPlainText(options[1].content)).toBe("In perpetuity.");
    });
  });

  describe("modifications", () => {
    it("omits the section entirely when blank", () => {
      const blocks = buildCoverPage(filled({ modifications: "" }));
      expect(blocks.some((b) => b.kind === "heading" && b.text === "MNDA Modifications")).toBe(
        false,
      );
    });

    it("omits the section when only whitespace", () => {
      const blocks = buildCoverPage(filled({ modifications: "   \n  " }));
      expect(blocks.some((b) => b.kind === "heading" && b.text === "MNDA Modifications")).toBe(
        false,
      );
    });

    it("includes the section and its text when provided", () => {
      const blocks = buildCoverPage(
        filled({ modifications: "Section 5 is replaced in its entirety." }),
      );
      expect(blocks.some((b) => b.kind === "heading" && b.text === "MNDA Modifications")).toBe(
        true,
      );
      expect(textOf(blocks)).toContain("Section 5 is replaced in its entirety.");
    });
  });

  describe("signature block", () => {
    it("labels columns with the two company names", () => {
      const signatures = buildCoverPage(filled()).find((b) => b.kind === "signatures");
      expect(signatures?.kind === "signatures" && signatures.parties).toEqual([
        "Acme, Inc.",
        "Globex Corporation",
      ]);
    });

    it("falls back to generic party labels when a company is blank", () => {
      const values = filled();
      values.partyTwo = { ...values.partyTwo, company: "" };
      const signatures = buildCoverPage(values).find((b) => b.kind === "signatures");
      expect(signatures?.kind === "signatures" && signatures.parties).toEqual([
        "Acme, Inc.",
        "Party 2",
      ]);
    });

    it("leaves signature and date rows blank for wet ink", () => {
      const signatures = buildCoverPage(filled()).find((b) => b.kind === "signatures");
      if (signatures?.kind !== "signatures") throw new Error("no signature block");
      const byLabel = Object.fromEntries(
        signatures.rows.map((row) => [row.label, row.values]),
      );
      expect(byLabel["Signature"]).toEqual(["", ""]);
      expect(byLabel["Date"]).toEqual(["", ""]);
      expect(byLabel["Print Name"]).toEqual(["Jordan Lee", "Sam Rivera"]);
    });

    it("has exactly the six rows the template defines", () => {
      const signatures = buildCoverPage(filled()).find((b) => b.kind === "signatures");
      expect(signatures?.kind === "signatures" && signatures.rows.map((r) => r.label)).toEqual([
        "Signature",
        "Print Name",
        "Title",
        "Company",
        "Notice Address",
        "Date",
      ]);
    });
  });
});

describe("assembleDocument", () => {
  it("puts the cover page before the standard terms", () => {
    const { blocks } = assembleDocument(filled());
    const coverIndex = blocks.findIndex(
      (b) => b.kind === "title" && b.text === "Mutual Non-Disclosure Agreement",
    );
    const termsIndex = blocks.findIndex(
      (b) => b.kind === "title" && b.text === "Standard Terms",
    );
    expect(coverIndex).toBe(0);
    expect(termsIndex).toBeGreaterThan(coverIndex);
  });

  it("includes all 11 standard-terms clauses", () => {
    const { blocks } = assembleDocument(filled());
    expect(blocks.filter((b) => b.kind === "clause")).toHaveLength(11);
  });

  it("never substitutes user values into the standard terms", () => {
    // The terms must stay verbatim; values belong on the cover page only.
    const { blocks } = assembleDocument(filled());
    const termsStart = blocks.findIndex(
      (b) => b.kind === "title" && b.text === "Standard Terms",
    );
    const termsText = textOf(blocks.slice(termsStart));
    expect(termsText).not.toContain("Delaware");
    expect(termsText).not.toContain("Acme, Inc.");
    expect(termsText).not.toContain("Jordan Lee");
  });

  it("keeps cover-page references in the terms as references", () => {
    const { blocks } = assembleDocument(filled());
    const references = blocks
      .filter((b) => b.kind === "clause")
      .flatMap((b) => (b.kind === "clause" ? b.content : []))
      .filter((run) => run.kind === "reference");
    expect(references.length).toBeGreaterThan(0);
    expect(references.some((run) => run.text === "Governing Law")).toBe(true);
  });

  it("carries the CC BY attribution into the assembled document", () => {
    expect(textOf(assembleDocument(filled()).blocks)).toContain("CC BY 4.0");
  });

  it("produces a document for entirely default (mostly blank) values", () => {
    expect(() => assembleDocument(emptyFormValues())).not.toThrow();
    expect(assembleDocument(emptyFormValues()).blocks.length).toBeGreaterThan(10);
  });

  it("handles non-Latin company names without mangling them", () => {
    const values = filled();
    values.partyOne = { ...values.partyOne, company: "شركة الإسكندرية" };
    expect(textOf(assembleDocument(values).blocks)).toContain("شركة الإسكندرية");
  });

  it("handles a very long purpose without throwing", () => {
    const values = filled({ purpose: "x".repeat(5000) });
    expect(() => assembleDocument(values)).not.toThrow();
  });

  it("is deterministic for identical input", () => {
    expect(assembleDocument(filled())).toEqual(assembleDocument(filled()));
  });
});
