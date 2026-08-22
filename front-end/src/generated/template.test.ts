// @vitest-environment node
/**
 * Guards the build-time bridge between the repository's templates/ directory
 * and the app bundle. If scripts/build-template.mjs ever drifts, silently
 * truncates, or picks up the wrong file, the app would ship a document that no
 * longer matches the source of truth -- these tests fail instead.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { coverPage, standardTerms } from "./mnda-template";

const templatesDir = resolve(import.meta.dirname, "..", "..", "..", "templates");

const readTemplate = (name: string) =>
  readFileSync(resolve(templatesDir, name), "utf8").replace(/\r\n/g, "\n");

describe("generated MNDA template", () => {
  it("matches templates/mutual-nda.md byte for byte", () => {
    expect(standardTerms).toBe(readTemplate("mutual-nda.md"));
  });

  it("matches templates/mutual-nda-coverpage.md byte for byte", () => {
    expect(coverPage).toBe(readTemplate("mutual-nda-coverpage.md"));
  });

  it("normalises CRLF so Windows checkouts produce identical output", () => {
    expect(standardTerms).not.toContain("\r");
    expect(coverPage).not.toContain("\r");
  });

  it("is not empty or truncated", () => {
    expect(standardTerms.length).toBeGreaterThan(5000);
    expect(coverPage.length).toBeGreaterThan(1000);
  });

  it("retains the clause structure the parser depends on", () => {
    expect(standardTerms).toMatch(/^# Standard Terms/);
    expect(standardTerms).toContain("11. **General**");
  });

  it("retains the CC BY attribution required by the licence", () => {
    expect(standardTerms).toContain("CC BY 4.0");
    expect(coverPage).toContain("CC BY 4.0");
  });
});
