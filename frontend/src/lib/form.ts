/**
 * The shape of the cover-page form, plus its defaults.
 *
 * Field names mirror the headings in templates/mutual-nda-coverpage.md so the
 * mapping between the form and the agreement stays obvious.
 */

export type TermChoice = "fixed" | "untilTerminated";
export type ConfidentialityChoice = "fixed" | "perpetual";

export type Party = {
  printName: string;
  title: string;
  company: string;
  /** Either an email or a postal address; the template accepts either. */
  noticeAddress: string;
};

export type NdaFormValues = {
  purpose: string;
  effectiveDate: string;
  mndaTerm: TermChoice;
  mndaTermYears: string;
  confidentiality: ConfidentialityChoice;
  confidentialityYears: string;
  governingLaw: string;
  jurisdiction: string;
  modifications: string;
  partyOne: Party;
  partyTwo: Party;
};

/** The template's own suggested Purpose, offered as the starting value. */
export const DEFAULT_PURPOSE =
  "Evaluating whether to enter into a business relationship with the other party.";

function emptyParty(): Party {
  return { printName: "", title: "", company: "", noticeAddress: "" };
}

/** Today in `YYYY-MM-DD`, using local time so the date matches the user's calendar. */
export function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function defaultFormValues(): NdaFormValues {
  return {
    purpose: DEFAULT_PURPOSE,
    effectiveDate: today(),
    mndaTerm: "fixed",
    mndaTermYears: "1",
    confidentiality: "fixed",
    confidentialityYears: "1",
    governingLaw: "",
    jurisdiction: "",
    modifications: "",
    partyOne: emptyParty(),
    partyTwo: emptyParty(),
  };
}

/**
 * Formats an ISO date for the agreement, e.g. "March 8, 2026".
 * Falls back to the raw string if it is not a complete date, so a
 * half-typed value never renders as "Invalid Date".
 */
export function formatEffectiveDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Pluralizes the year count shown in the term sections. */
export function formatYears(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "";
  return `${trimmed} ${trimmed === "1" ? "year" : "years"}`;
}

/** Fields that must be filled before the agreement is ready to sign. */
const REQUIRED: Array<{ label: string; get: (v: NdaFormValues) => string }> = [
  { label: "Purpose", get: (v) => v.purpose },
  { label: "Effective Date", get: (v) => v.effectiveDate },
  { label: "Governing Law", get: (v) => v.governingLaw },
  { label: "Jurisdiction", get: (v) => v.jurisdiction },
  { label: "Party 1 company", get: (v) => v.partyOne.company },
  { label: "Party 2 company", get: (v) => v.partyTwo.company },
];

/**
 * Returns the labels of required fields that are still blank.
 * Used to warn before download rather than to block it -- a user may
 * legitimately want to print a partly-filled draft to complete by hand.
 */
export function missingRequiredFields(values: NdaFormValues): string[] {
  const missing = REQUIRED.filter(
    (field) => field.get(values).trim().length === 0,
  ).map((field) => field.label);

  if (values.mndaTerm === "fixed" && values.mndaTermYears.trim().length === 0) {
    missing.push("MNDA Term length");
  }
  if (
    values.confidentiality === "fixed" &&
    values.confidentialityYears.trim().length === 0
  ) {
    missing.push("Term of Confidentiality length");
  }
  return missing;
}

/** A filename-safe slug for the download, derived from the two companies. */
export function suggestedFileName(values: NdaFormValues): string {
  const slug = (input: string) =>
    input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const parts = [slug(values.partyOne.company), slug(values.partyTwo.company)]
    .filter((part) => part.length > 0)
    .join("-and-");

  return parts.length > 0 ? `mutual-nda-${parts}.pdf` : "mutual-nda.pdf";
}
