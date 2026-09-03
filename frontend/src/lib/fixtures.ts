/**
 * Shared test fixtures.
 *
 * Lives outside `*.test.ts` so the vitest glob does not treat it as a suite.
 * The builders fill in whatever a document declares, so a test can vary one
 * field without restating the other twenty.
 */

import { findDocument } from "./documents/registry";
import type { DocumentDefinition, DocumentValues } from "./documents/types";
import { emptyValues } from "./values";

/** The document a test names, or a loud failure -- never undefined. */
export function documentFixture(slug: string): DocumentDefinition {
  const document = findDocument(slug);
  if (!document) {
    throw new Error(
      `No document "${slug}" in the registry. Available: ` +
        `see frontend/src/generated/documents.ts`,
    );
  }
  return document;
}

/**
 * A plausible answer for a field, chosen by its declared type.
 *
 * Option fields get their first option with `{n}` filled in, so the
 * either/or rendering has something real to match against.
 */
function sampleAnswer(document: DocumentDefinition, key: string): string {
  const field = document.fields.find((candidate) => candidate.key === key);
  if (!field) return "Sample value";

  if (field.options && field.options.length > 0) {
    return field.options[0].replace(/\{n\}/g, "3");
  }

  switch (field.type) {
    case "date":
      return "2026-03-08";
    case "money":
      return "$50,000";
    case "percent":
      return "99.9%";
    case "duration":
      return "12 months";
    default:
      return `A stated ${field.label}`;
  }
}

/** Every field of a document filled in, with both parties complete. */
export function filledValues(
  slug: string,
  overrides: Partial<DocumentValues> = {},
): DocumentValues {
  const document = documentFixture(slug);
  const fields = Object.fromEntries(
    document.fields.map((field) => [field.key, sampleAnswer(document, field.key)]),
  );

  return {
    ...emptyValues(slug),
    fields,
    parties: [
      {
        company: "Aardvark Industries, Inc.",
        printName: "Dana Reyes",
        title: "Chief Executive Officer",
        noticeAddress: "legal@aardvark.example",
      },
      {
        company: "Bramble Analytics Ltd",
        printName: "Kim Alvarez",
        title: "General Counsel",
        noticeAddress: "10 Bramble Way, London",
      },
    ],
    ...overrides,
  };
}
