/**
 * The cover page's values, and the helpers that read them.
 *
 * Field names mirror the headings in templates/mutual-nda-coverpage.md so the
 * mapping to the agreement stays obvious. They are also the names the chat
 * assistant fills in: `backend/app/chat/models.py` declares the same shape, and
 * a response from /api/chat is adopted here as-is, so the two must not drift.
 *
 * The `NdaFormValues` name predates PL-5, which replaced the form with a
 * conversation. The values outlived the form.
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

function emptyParty(): Party {
  return { printName: "", title: "", company: "", noticeAddress: "" };
}

/**
 * A blank cover page: where every conversation starts.
 *
 * Nothing is pre-filled, deliberately. The assistant is sent these values on
 * every turn and asks about whatever is still empty, so a suggested purpose or
 * a term of "1 year" sitting here would be silently adopted as the user's
 * answer to a question they were never asked. The choice fields have to hold
 * one of their two values, so they sit on the common option; the year counts
 * beside them stay blank, which is what the preview and the assistant both
 * read as "not answered yet".
 */
export function emptyFormValues(): NdaFormValues {
  return {
    purpose: "",
    effectiveDate: "",
    mndaTerm: "fixed",
    mndaTermYears: "",
    confidentiality: "fixed",
    confidentialityYears: "",
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

/**
 * What the assistant has captured so far, for the read-out beside the chat.
 *
 * Only filled fields appear: an empty row tells the user nothing they cannot
 * already see in the agreement preview, and a wall of blanks would recreate the
 * form this feature replaced.
 */
export function capturedFields(
  values: NdaFormValues,
): Array<{ label: string; value: string }> {
  const party = (label: string, p: Party) =>
    [
      { label: `${label} company`, value: p.company },
      { label: `${label} signatory`, value: p.printName },
      { label: `${label} title`, value: p.title },
      { label: `${label} notice address`, value: p.noticeAddress },
    ] as const;

  const term =
    values.mndaTerm === "fixed"
      ? formatYears(values.mndaTermYears)
      : "Until terminated";
  const confidentiality =
    values.confidentiality === "fixed"
      ? formatYears(values.confidentialityYears)
      : "In perpetuity";

  return [
    { label: "Purpose", value: values.purpose },
    { label: "Effective date", value: formatEffectiveDate(values.effectiveDate) },
    { label: "Term", value: term },
    { label: "Confidentiality", value: confidentiality },
    { label: "Governing law", value: values.governingLaw },
    { label: "Jurisdiction", value: values.jurisdiction },
    ...party("Party 1", values.partyOne),
    ...party("Party 2", values.partyTwo),
    { label: "Modifications", value: values.modifications },
  ].filter((row) => row.value.trim().length > 0);
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
