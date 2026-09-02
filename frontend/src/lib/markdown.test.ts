import { describe, expect, it } from "vitest";
import { parseInline, parseStandardTerms } from "./markdown";
import { standardTerms } from "@/generated/mnda-template";
import { inlineToPlainText } from "./document";

describe("parseInline", () => {
  it("returns a single text run for plain prose", () => {
    expect(parseInline("hello world")).toEqual([
      { kind: "text", text: "hello world" },
    ]);
  });

  it("extracts a bold run and keeps the text around it", () => {
    expect(parseInline("a **bold** b")).toEqual([
      { kind: "text", text: "a " },
      { kind: "strong", text: "bold" },
      { kind: "text", text: " b" },
    ]);
  });

  it("handles a bold run at the very start and end", () => {
    expect(parseInline("**only**")).toEqual([{ kind: "strong", text: "only" }]);
  });

  it("extracts multiple bold runs in one line", () => {
    const runs = parseInline("**one** and **two**");
    expect(runs.filter((r) => r.kind === "strong").map((r) => r.text)).toEqual([
      "one",
      "two",
    ]);
  });

  it("extracts a cover-page cross-reference", () => {
    expect(parseInline('for the <span class="coverpage_link">Purpose</span>.')).toEqual([
      { kind: "text", text: "for the " },
      { kind: "reference", text: "Purpose" },
      { kind: "text", text: "." },
    ]);
  });

  it("extracts a link with its href", () => {
    expect(parseInline("see [CC BY 4.0](https://example.com/by)")).toEqual([
      { kind: "text", text: "see " },
      { kind: "link", text: "CC BY 4.0", href: "https://example.com/by" },
    ]);
  });

  it("handles bold, reference, and link in the same line", () => {
    const runs = parseInline(
      '**Governing Law**. laws of <span class="coverpage_link">Governing Law</span> see [x](https://y.z)',
    );
    expect(runs.map((r) => r.kind)).toEqual([
      "strong",
      "text",
      "reference",
      "text",
      "link",
    ]);
  });

  it("never drops characters -- plain text round-trips", () => {
    const source =
      '1. **Term**. Ends on the <span class="coverpage_link">Effective Date</span> per [terms](https://a.b).';
    const expected = source
      .replace(/\*\*/g, "")
      .replace(/<span class="coverpage_link">(.*?)<\/span>/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    expect(inlineToPlainText(parseInline(source))).toBe(expected);
  });

  it("emits no empty text runs", () => {
    const runs = parseInline("**a****b**");
    expect(runs.every((r) => r.text.length > 0)).toBe(true);
  });

  it("returns an empty array for an empty string", () => {
    expect(parseInline("")).toEqual([]);
  });

  it("leaves an unterminated bold marker as literal text", () => {
    expect(parseInline("**unclosed")).toEqual([
      { kind: "text", text: "**unclosed" },
    ]);
  });

  it("preserves curly quotes and other non-ASCII characters", () => {
    const runs = parseInline("the “MNDA” — party’s rights");
    expect(inlineToPlainText(runs)).toBe(
      "the “MNDA” — party’s rights",
    );
  });

  it("does not share regex state between calls", () => {
    // A leaked /g lastIndex would make the second call miss the match.
    const first = parseInline("**a**");
    const second = parseInline("**a**");
    expect(second).toEqual(first);
  });
});

describe("parseStandardTerms", () => {
  const blocks = parseStandardTerms(standardTerms);

  it("produces exactly one title", () => {
    const titles = blocks.filter((b) => b.kind === "title");
    expect(titles).toHaveLength(1);
    expect(titles[0]).toMatchObject({ text: "Standard Terms" });
  });

  it("finds all 11 clauses of the Common Paper MNDA", () => {
    const clauses = blocks.filter((b) => b.kind === "clause");
    expect(clauses).toHaveLength(11);
  });

  it("numbers clauses 1..11 in order", () => {
    const numbers = blocks
      .filter((b) => b.kind === "clause")
      .map((b) => (b.kind === "clause" ? b.number : -1));
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("keeps the CC BY attribution line as a footnote", () => {
    const footnotes = blocks.filter((b) => b.kind === "footnote");
    expect(footnotes).toHaveLength(1);
    const text = inlineToPlainText(
      footnotes[0].kind === "footnote" ? footnotes[0].content : [],
    );
    expect(text).toContain("CC BY 4.0");
    expect(text).toContain("Common Paper");
  });

  it("preserves every cover-page cross-reference in the source", () => {
    const sourceRefs = (
      standardTerms.match(/<span class="coverpage_link">/g) || []
    ).length;
    const parsedRefs = blocks
      .flatMap((b) =>
        b.kind === "clause" || b.kind === "footnote" ? b.content : [],
      )
      .filter((run) => run.kind === "reference").length;
    expect(parsedRefs).toBe(sourceRefs);
    expect(parsedRefs).toBeGreaterThan(0);
  });

  it("leaves no raw markup in the parsed output", () => {
    const text = blocks
      .flatMap((b) =>
        b.kind === "clause" || b.kind === "footnote" ? b.content : [],
      )
      .map((run) => run.text)
      .join("");
    expect(text).not.toContain("<span");
    expect(text).not.toContain("**");
    expect(text).not.toContain("](");
  });

  it("starts clause 1 with the Introduction heading", () => {
    const first = blocks.find((b) => b.kind === "clause");
    expect(first?.kind === "clause" && first.content[0]).toMatchObject({
      kind: "strong",
      text: "Introduction",
    });
  });

  it("ignores blank lines", () => {
    expect(parseStandardTerms("\n\n   \n")).toEqual([]);
  });

  it("is stable across repeated parses", () => {
    expect(parseStandardTerms(standardTerms)).toEqual(blocks);
  });
});
