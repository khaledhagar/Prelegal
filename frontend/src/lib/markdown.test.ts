// @vitest-environment node
import { describe, expect, it } from "vitest";
import { documents } from "@/generated/documents";
import { parseInline, parseStandardTerms } from "./markdown";
import type { Block } from "./document";

const clauses = (blocks: Block[]) =>
  blocks.filter((block): block is Extract<Block, { kind: "clause" }> =>
    block.kind === "clause",
  );

const sections = (blocks: Block[]) =>
  blocks.filter((block): block is Extract<Block, { kind: "section" }> =>
    block.kind === "section",
  );

describe("parseInline", () => {
  it("reads plain text as one run", () => {
    expect(parseInline("Just words.")).toEqual([
      { kind: "text", text: "Just words." },
    ]);
  });

  it("reads bold runs", () => {
    expect(parseInline("A **bold** word")).toEqual([
      { kind: "text", text: "A " },
      { kind: "strong", text: "bold" },
      { kind: "text", text: " word" },
    ]);
  });

  it("reads links", () => {
    expect(parseInline("see [CC BY 4.0](https://example.test/cc)")).toEqual([
      { kind: "text", text: "see " },
      { kind: "link", text: "CC BY 4.0", href: "https://example.test/cc" },
    ]);
  });

  it.each([
    ["coverpage_link", "Purpose"],
    ["keyterms_link", "Governing Law"],
    ["orderform_link", "Target Uptime"],
    ["businessterms_link", "Territory"],
    ["sow_link", "Deliverables"],
  ])("reads a %s reference", (className, name) => {
    // All five namespaces render identically; which fill-in document a value
    // lives on matters when building the cover page, not when reading terms.
    const runs = parseInline(`the <span class="${className}">${name}</span> applies`);
    expect(runs).toContainEqual({ kind: "reference", text: name });
  });

  it("turns a section-heading span into a bold run", () => {
    expect(
      parseInline('<span class="header_3" id="1.1">Target Uptime.</span>  If there'),
    ).toEqual([
      { kind: "strong", text: "Target Uptime." },
      { kind: "text", text: "  If there" },
    ]);
  });

  it("unwraps a bare id span without double-emphasising it", () => {
    // The definitions sections wrap already-bold terms in a plain anchor span.
    expect(parseInline('<span id="4.1">**"Available Minutes"**</span> means')).toEqual(
      [
        { kind: "strong", text: '"Available Minutes"' },
        { kind: "text", text: " means" },
      ],
    );
  });

  it("does not leak a regex lastIndex between calls", () => {
    const source = 'a <span class="keyterms_link">Fees</span> b';
    expect(parseInline(source)).toEqual(parseInline(source));
  });
});

describe("parseStandardTerms", () => {
  it("reads the title", () => {
    expect(parseStandardTerms("# Service Level Agreement")[0]).toEqual({
      kind: "title",
      text: "Service Level Agreement",
    });
  });

  it("reads flat clauses, as the Mutual NDA writes them", () => {
    const blocks = parseStandardTerms(
      "1. **Introduction**. This agreement.\n2. **Scope**. It covers things.",
    );

    expect(clauses(blocks).map((block) => [block.marker, block.depth])).toEqual([
      ["1.", 0],
      ["2.", 0],
    ]);
  });

  it("numbers nested clauses by position, not by the digit in the source", () => {
    // The templates restart at 1. inside every nested list, the way markdown
    // expects, so the literal marker is not the number a reader should see.
    const blocks = parseStandardTerms(
      [
        '1. <span class="header_2" id="1">Uptime</span>',
        "    1. First sub-clause.",
        "    2. Second sub-clause.",
        '2. <span class="header_2" id="2">Response Time</span>',
        "    1. Back to one inside a new section.",
      ].join("\n"),
    );

    expect(sections(blocks).map((block) => block.marker)).toEqual(["1.", "2."]);
    expect(clauses(blocks).map((block) => block.marker)).toEqual([
      "1.1",
      "1.2",
      "2.1",
    ]);
  });

  it("letters the third level", () => {
    const blocks = parseStandardTerms(
      [
        '1. <span class="header_2" id="1">Remedies</span>',
        "    1. Requesting a credit.",
        "        a. For uptime credit.",
        "        b. For response time credit.",
      ].join("\n"),
    );

    expect(clauses(blocks).map((block) => [block.marker, block.depth])).toEqual([
      ["1.1", 1],
      ["a.", 2],
      ["b.", 2],
    ]);
  });

  it("separates a bare section heading from a clause with a body", () => {
    const blocks = parseStandardTerms(
      [
        '1. <span class="header_2" id="1">Uptime</span>',
        '    1. <span class="header_3" id="1.1">Target Uptime.</span>  Provider will try.',
      ].join("\n"),
    );

    expect(blocks[0]).toEqual({ kind: "section", marker: "1.", text: "Uptime" });
    expect(blocks[1].kind).toBe("clause");
  });

  it("treats an unnumbered line as fine print", () => {
    const blocks = parseStandardTerms("Free to use under CC BY 4.0.");
    expect(blocks[0].kind).toBe("footnote");
  });

  it("skips blank lines", () => {
    expect(parseStandardTerms("\n\n# Title\n\n\n")).toHaveLength(1);
  });
});

describe("every template in the catalog", () => {
  it.each(documents.map((document) => [document.slug, document.standardTerms] as const))(
    "%s parses into real structure, not a wall of footnotes",
    (_slug, standardTerms) => {
      const blocks = parseStandardTerms(standardTerms);
      const footnotes = blocks.filter((block) => block.kind === "footnote");

      expect(clauses(blocks).length).toBeGreaterThan(0);
      // Before PL-6 the nested templates produced nothing but footnotes. One or
      // two is the CC BY line; a majority means the parser has stopped working.
      expect(footnotes.length).toBeLessThan(blocks.length / 2);
    },
  );

  it.each(documents.map((document) => [document.slug, document.standardTerms] as const))(
    "%s leaves no unrendered span markup",
    (_slug, standardTerms) => {
      const blocks = parseStandardTerms(standardTerms);
      const text = JSON.stringify(blocks);

      expect(text).not.toContain("<span");
      expect(text).not.toContain("</span>");
    },
  );

  it.each(documents.map((document) => [document.slug, document] as const))(
    "%s references values it actually declares",
    (_slug, document) => {
      // A reference the cover page never collects would render as a defined
      // term with nothing behind it.
      const blocks = parseStandardTerms(document.standardTerms);
      const referenced = new Set(
        blocks
          .flatMap((block) =>
            "content" in block ? block.content : [],
          )
          .filter((run) => run.kind === "reference")
          .map((run) => run.text),
      );

      const known = new Set([
        ...document.fields.map((field) => field.label),
        ...document.parties,
      ]);

      for (const reference of referenced) {
        // Possessives and plurals are folded into one field by the generator.
        const singular = reference.replace(/[’']s$/, "").replace(/s$/, "");
        const matches =
          known.has(reference) ||
          known.has(reference.replace(/[’']s$/, "")) ||
          known.has(singular);
        expect(matches, `${reference} is referenced but never collected`).toBe(true);
      }
    },
  );
});
