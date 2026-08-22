import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PURPOSE,
  defaultFormValues,
  formatEffectiveDate,
  formatYears,
  missingRequiredFields,
  suggestedFileName,
  today,
  type NdaFormValues,
} from "./form";

function complete(overrides: Partial<NdaFormValues> = {}): NdaFormValues {
  return {
    ...defaultFormValues(),
    governingLaw: "Delaware",
    jurisdiction: "New Castle, DE",
    partyOne: {
      printName: "Jordan Lee",
      title: "CEO",
      company: "Acme, Inc.",
      noticeAddress: "legal@acme.com",
    },
    partyTwo: {
      printName: "Sam Rivera",
      title: "GC",
      company: "Globex Corporation",
      noticeAddress: "notices@globex.com",
    },
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("defaultFormValues", () => {
  it("starts from the template's suggested purpose", () => {
    expect(defaultFormValues().purpose).toBe(DEFAULT_PURPOSE);
  });

  it("defaults both term choices to the fixed one-year option", () => {
    const values = defaultFormValues();
    expect(values.mndaTerm).toBe("fixed");
    expect(values.mndaTermYears).toBe("1");
    expect(values.confidentiality).toBe("fixed");
    expect(values.confidentialityYears).toBe("1");
  });

  it("leaves both parties blank", () => {
    const values = defaultFormValues();
    expect(values.partyOne).toEqual({
      printName: "",
      title: "",
      company: "",
      noticeAddress: "",
    });
    expect(values.partyTwo).toEqual(values.partyOne);
  });

  it("returns a fresh object each call, not a shared reference", () => {
    const a = defaultFormValues();
    const b = defaultFormValues();
    a.partyOne.company = "mutated";
    expect(b.partyOne.company).toBe("");
  });
});

describe("today", () => {
  it("formats as YYYY-MM-DD with zero padding", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 8, 12, 0, 0)); // 8 March 2026, local
    expect(today()).toBe("2026-03-08");
  });

  it("uses local date, not UTC, so late-evening entries are not off by one", () => {
    vi.useFakeTimers();
    // 23:30 local on the 31st would be the 1st of the next month in UTC
    // for positive offsets; the local calendar date is what users expect.
    vi.setSystemTime(new Date(2026, 11, 31, 23, 30, 0));
    expect(today()).toBe("2026-12-31");
  });
});

describe("formatEffectiveDate", () => {
  it("renders an ISO date as long-form US prose", () => {
    expect(formatEffectiveDate("2026-03-08")).toBe("March 8, 2026");
  });

  it("does not shift the day across time zones", () => {
    // Parsed as local components rather than UTC, so the day never slips.
    expect(formatEffectiveDate("2026-01-01")).toBe("January 1, 2026");
    expect(formatEffectiveDate("2026-12-31")).toBe("December 31, 2026");
  });

  it("passes through a partially-typed date rather than showing Invalid Date", () => {
    expect(formatEffectiveDate("2026-03")).toBe("2026-03");
    expect(formatEffectiveDate("")).toBe("");
  });

  it("passes through a structurally valid but nonsense date", () => {
    // Guards against rendering something misleading for impossible input.
    expect(formatEffectiveDate("not-a-date")).toBe("not-a-date");
  });
});

describe("formatYears", () => {
  it("uses the singular for one", () => {
    expect(formatYears("1")).toBe("1 year");
  });

  it("uses the plural for anything else", () => {
    expect(formatYears("2")).toBe("2 years");
    expect(formatYears("10")).toBe("10 years");
    expect(formatYears("0")).toBe("0 years");
  });

  it("returns an empty string for blank input", () => {
    expect(formatYears("")).toBe("");
    expect(formatYears("   ")).toBe("");
  });

  it("trims surrounding whitespace", () => {
    expect(formatYears("  3  ")).toBe("3 years");
  });
});

describe("missingRequiredFields", () => {
  it("reports nothing when every required field is filled", () => {
    expect(missingRequiredFields(complete())).toEqual([]);
  });

  it("reports a blank governing law", () => {
    expect(missingRequiredFields(complete({ governingLaw: "" }))).toContain(
      "Governing Law",
    );
  });

  it("treats whitespace-only input as blank", () => {
    expect(missingRequiredFields(complete({ jurisdiction: "   " }))).toContain(
      "Jurisdiction",
    );
  });

  it("reports each party's company separately", () => {
    const values = complete();
    values.partyOne = { ...values.partyOne, company: "" };
    values.partyTwo = { ...values.partyTwo, company: "" };
    const missing = missingRequiredFields(values);
    expect(missing).toContain("Party 1 company");
    expect(missing).toContain("Party 2 company");
  });

  it("requires a term length only when the fixed option is selected", () => {
    const fixed = complete({ mndaTerm: "fixed", mndaTermYears: "" });
    expect(missingRequiredFields(fixed)).toContain("MNDA Term length");

    const untilTerminated = complete({
      mndaTerm: "untilTerminated",
      mndaTermYears: "",
    });
    expect(missingRequiredFields(untilTerminated)).not.toContain("MNDA Term length");
  });

  it("requires a confidentiality length only when fixed is selected", () => {
    const fixed = complete({ confidentiality: "fixed", confidentialityYears: "" });
    expect(missingRequiredFields(fixed)).toContain("Term of Confidentiality length");

    const perpetual = complete({
      confidentiality: "perpetual",
      confidentialityYears: "",
    });
    expect(missingRequiredFields(perpetual)).not.toContain(
      "Term of Confidentiality length",
    );
  });

  it("lists everything missing on a fresh form", () => {
    const missing = missingRequiredFields(defaultFormValues());
    expect(missing).toEqual(
      expect.arrayContaining([
        "Governing Law",
        "Jurisdiction",
        "Party 1 company",
        "Party 2 company",
      ]),
    );
  });

  it("does not mutate the values it inspects", () => {
    const values = complete({ mndaTermYears: "" });
    const snapshot = structuredClone(values);
    missingRequiredFields(values);
    expect(values).toEqual(snapshot);
  });
});

describe("suggestedFileName", () => {
  it("combines both company names", () => {
    expect(suggestedFileName(complete())).toBe(
      "mutual-nda-acme-inc-and-globex-corporation.pdf",
    );
  });

  it("falls back to a generic name when both companies are blank", () => {
    expect(suggestedFileName(defaultFormValues())).toBe("mutual-nda.pdf");
  });

  it("uses whichever single company is present", () => {
    const values = complete();
    values.partyTwo = { ...values.partyTwo, company: "" };
    expect(suggestedFileName(values)).toBe("mutual-nda-acme-inc.pdf");
  });

  it("strips characters that are unsafe in a filename", () => {
    const values = complete();
    values.partyOne = { ...values.partyOne, company: 'A/B\\C:*?"<>|D' };
    values.partyTwo = { ...values.partyTwo, company: "E" };
    const name = suggestedFileName(values);
    expect(name).toMatch(/^[a-z0-9.-]+$/);
    expect(name.endsWith(".pdf")).toBe(true);
  });

  it("does not leave leading or trailing separators", () => {
    const values = complete();
    values.partyOne = { ...values.partyOne, company: "!!!" };
    values.partyTwo = { ...values.partyTwo, company: "Globex" };
    expect(suggestedFileName(values)).toBe("mutual-nda-globex.pdf");
  });

  it("collapses runs of separators into one hyphen", () => {
    const values = complete();
    values.partyOne = { ...values.partyOne, company: "Acme   &&&   Co" };
    values.partyTwo = { ...values.partyTwo, company: "Globex" };
    expect(suggestedFileName(values)).toBe("mutual-nda-acme-co-and-globex.pdf");
  });

  it("falls back to the generic name when names have no usable characters", () => {
    const values = complete();
    values.partyOne = { ...values.partyOne, company: "!!!" };
    values.partyTwo = { ...values.partyTwo, company: "???" };
    expect(suggestedFileName(values)).toBe("mutual-nda.pdf");
  });
});
