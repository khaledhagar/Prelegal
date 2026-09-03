/**
 * The answers captured for an agreement, and the helpers that read them.
 *
 * Values are a flat `Record<string, string>` keyed by the field keys the
 * templates declare, plus two parties. That shape is what lets one set of types
 * serve all eleven agreements: `backend/app/chat/models.py` builds the same
 * shape per document, and a response from /api/chat is adopted here as-is, so
 * the two must not drift.
 */

import type {
  DocumentDefinition,
  DocumentField,
  DocumentValues,
  PartyValues,
} from "./documents/types";

function emptyParty(): PartyValues {
  return { company: "", printName: "", title: "", noticeAddress: "" };
}

/**
 * A blank agreement: where every conversation starts.
 *
 * Nothing is pre-filled, deliberately. The assistant is sent these values on
 * every turn and asks about whatever is still empty, so a suggested term of
 * "1 year" sitting here would be silently adopted as the user's answer to a
 * question they were never asked.
 */
export function emptyValues(documentType = ""): DocumentValues {
  return {
    documentType,
    fields: {},
    parties: [emptyParty(), emptyParty()],
  };
}

/** Reads one field, treating an absent key and a blank string the same way. */
export function fieldValue(values: DocumentValues, key: string): string {
  return (values.fields[key] ?? "").trim();
}

/**
 * Formats an ISO date for the agreement, e.g. "March 8, 2026".
 * Falls back to the raw string if it is not a complete date, so a
 * half-typed value never renders as "Invalid Date" -- and so an answer the
 * assistant recorded as "the first Monday in June" survives intact.
 */
export function formatEffectiveDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return iso.trim();
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return iso.trim();
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Formats a value for display, applying the light typing the hints declare. */
export function displayValue(field: DocumentField, raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return "";
  return field.type === "date" ? formatEffectiveDate(trimmed) : trimmed;
}

/**
 * Returns the labels of required fields that are still blank.
 *
 * Used to warn before download rather than to block it -- a user may
 * legitimately want to print a partly-filled draft to complete by hand.
 */
export function missingRequiredFields(
  document: DocumentDefinition,
  values: DocumentValues,
): string[] {
  const missing = document.fields
    .filter((field) => field.required && fieldValue(values, field.key).length === 0)
    .map((field) => field.label);

  document.parties.forEach((role, index) => {
    if (values.parties[index].company.trim().length === 0) {
      missing.push(`${role} company`);
    }
  });

  return missing;
}

/**
 * What the assistant has captured so far, for the read-out beside the chat.
 *
 * Only filled fields appear: an empty row tells the user nothing they cannot
 * already see in the preview, and a wall of blanks would recreate the form this
 * product deliberately does not have.
 */
export function capturedFields(
  document: DocumentDefinition,
  values: DocumentValues,
): Array<{ label: string; value: string }> {
  const parties = document.parties.flatMap((role, index) => {
    const party = values.parties[index];
    return [
      { label: `${role} company`, value: party.company },
      { label: `${role} signatory`, value: party.printName },
      { label: `${role} title`, value: party.title },
      { label: `${role} notice address`, value: party.noticeAddress },
    ];
  });

  const fields = document.fields.map((field) => ({
    label: field.label,
    value: displayValue(field, values.fields[field.key] ?? ""),
  }));

  return [...parties, ...fields].filter((row) => row.value.trim().length > 0);
}

/** A filename-safe slug for the download, derived from the document and parties. */
export function suggestedFileName(
  document: DocumentDefinition,
  values: DocumentValues,
): string {
  const slug = (input: string) =>
    input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const companies = values.parties
    .map((party) => slug(party.company))
    .filter((part) => part.length > 0)
    .join("-and-");

  return companies.length > 0
    ? `${document.slug}-${companies}.pdf`
    : `${document.slug}.pdf`;
}
