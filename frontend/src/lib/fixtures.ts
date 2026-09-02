/**
 * Shared test fixture.
 *
 * Lives outside *.test.ts so the vitest glob does not treat it as a suite.
 * Keeping one definition means a new field on NdaFormValues needs a default in
 * one place rather than in every suite that builds a populated form.
 */
import { emptyFormValues, type NdaFormValues } from "./form";

/** A fully-populated form, so tests can vary a single field at a time. */
export function filledFormValues(
  overrides: Partial<NdaFormValues> = {},
): NdaFormValues {
  return {
    ...emptyFormValues(),
    purpose:
      "Evaluating whether to enter into a business relationship with the other party.",
    effectiveDate: "2026-03-08",
    mndaTermYears: "1",
    confidentialityYears: "1",
    governingLaw: "Delaware",
    jurisdiction: "courts located in New Castle, DE",
    partyOne: {
      printName: "Jordan Lee",
      title: "Chief Executive Officer",
      company: "Acme, Inc.",
      noticeAddress: "legal@acme.com",
    },
    partyTwo: {
      printName: "Sam Rivera",
      title: "General Counsel",
      company: "Globex Corporation",
      noticeAddress: "notices@globex.com",
    },
    ...overrides,
  };
}
