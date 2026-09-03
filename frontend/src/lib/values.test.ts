// @vitest-environment node
import { describe, expect, it } from "vitest";
import { documentFixture, filledValues } from "./fixtures";
import {
  capturedFields,
  emptyValues,
  fieldValue,
  formatEffectiveDate,
  missingRequiredFields,
  suggestedFileName,
} from "./values";

describe("emptyValues", () => {
  it("starts with nothing chosen and nothing filled in", () => {
    const values = emptyValues();
    expect(values.documentType).toBe("");
    expect(values.fields).toEqual({});
    expect(values.parties).toHaveLength(2);
  });

  it("pre-fills no answers, so the assistant never adopts one silently", () => {
    // The assistant is sent these values every turn and asks about whatever is
    // empty. A default sitting here would become the user's answer to a
    // question they were never asked.
    const values = emptyValues("service-level-agreement");
    expect(Object.values(values.fields)).toHaveLength(0);
    expect(values.parties.every((party) => party.company === "")).toBe(true);
  });

  it("can start on a chosen document", () => {
    expect(emptyValues("mutual-nda").documentType).toBe("mutual-nda");
  });
});

describe("fieldValue", () => {
  it("treats an absent key and a blank string the same way", () => {
    const values = emptyValues("mutual-nda");
    expect(fieldValue(values, "purpose")).toBe("");

    values.fields.purpose = "   ";
    expect(fieldValue(values, "purpose")).toBe("");
  });

  it("trims what it returns", () => {
    const values = emptyValues("mutual-nda");
    values.fields.governingLaw = "  Delaware  ";
    expect(fieldValue(values, "governingLaw")).toBe("Delaware");
  });
});

describe("formatEffectiveDate", () => {
  it("formats a complete ISO date", () => {
    expect(formatEffectiveDate("2026-03-08")).toBe("March 8, 2026");
  });

  it.each(["", "2026-03", "not a date", "the first Monday in June"])(
    "leaves %o alone rather than rendering Invalid Date",
    (input) => {
      // The assistant records what the user said. A half-typed or narrative
      // answer must survive to the page instead of becoming an error string.
      expect(formatEffectiveDate(input)).toBe(input);
    },
  );
});

describe("missingRequiredFields", () => {
  it("is empty once everything required is answered", () => {
    const document = documentFixture("service-level-agreement");
    expect(missingRequiredFields(document, filledValues(document.slug))).toEqual([]);
  });

  it("names the required fields still blank", () => {
    const document = documentFixture("service-level-agreement");
    const missing = missingRequiredFields(document, emptyValues(document.slug));

    expect(missing).toContain("Target Uptime");
    expect(missing).toContain("Support Channel");
  });

  it("ignores optional fields", () => {
    const document = documentFixture("service-level-agreement");
    const missing = missingRequiredFields(document, emptyValues(document.slug));

    expect(missing).not.toContain("Scheduled Downtime");
  });

  it("names a missing company by the role the agreement uses", () => {
    const document = documentFixture("service-level-agreement");
    const missing = missingRequiredFields(document, emptyValues(document.slug));

    expect(missing).toContain("Provider company");
    expect(missing).toContain("Customer company");
  });
});

describe("capturedFields", () => {
  it("lists nothing for a blank agreement", () => {
    // A wall of empty rows would recreate the form this product does not have.
    const document = documentFixture("mutual-nda");
    expect(capturedFields(document, emptyValues(document.slug))).toEqual([]);
  });

  it("shows only what has been answered", () => {
    const document = documentFixture("mutual-nda");
    const values = emptyValues(document.slug);
    values.fields.governingLaw = "Delaware";
    values.parties[0].company = "Aardvark Industries, Inc.";

    expect(capturedFields(document, values)).toEqual([
      { label: "Party 1 company", value: "Aardvark Industries, Inc." },
      { label: "Governing Law", value: "Delaware" },
    ]);
  });

  it("formats a date field for reading", () => {
    const document = documentFixture("mutual-nda");
    const values = emptyValues(document.slug);
    values.fields.effectiveDate = "2026-03-08";

    expect(capturedFields(document, values)).toContainEqual({
      label: "Effective Date",
      value: "March 8, 2026",
    });
  });
});

describe("suggestedFileName", () => {
  it("names the file after the document and both companies", () => {
    const document = documentFixture("mutual-nda");
    expect(suggestedFileName(document, filledValues(document.slug))).toBe(
      "mutual-nda-aardvark-industries-inc-and-bramble-analytics-ltd.pdf",
    );
  });

  it("falls back to the document alone when no company is known", () => {
    const document = documentFixture("service-level-agreement");
    expect(suggestedFileName(document, emptyValues(document.slug))).toBe(
      "service-level-agreement.pdf",
    );
  });

  it("uses whichever company is known", () => {
    const document = documentFixture("pilot-agreement");
    const values = emptyValues(document.slug);
    values.parties[1].company = "Bramble Analytics Ltd";

    expect(suggestedFileName(document, values)).toBe(
      "pilot-agreement-bramble-analytics-ltd.pdf",
    );
  });
});
