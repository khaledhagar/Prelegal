/**
 * The document registry.
 *
 * This is the only module the rest of the app asks about documents. Nothing
 * else imports the generated file, so where a document's shape comes from --
 * templates/ for the field names, hints.json for how to ask about them, joined
 * by scripts/build-documents.mjs -- stays a detail of this folder.
 */

import { documents as generated, groupLabels } from "@/generated/documents";
import type { DocumentDefinition, DocumentField, FieldGroup } from "./types";

/** Every agreement the product can draft, in catalog order. */
export const allDocuments: DocumentDefinition[] = generated;

const bySlug = new Map(allDocuments.map((document) => [document.slug, document]));

/** Looks up a document, or returns undefined for an unknown slug. */
export function findDocument(slug: string): DocumentDefinition | undefined {
  return bySlug.get(slug);
}

/** The heading a group of fields sits under on the cover page. */
export function groupLabel(group: FieldGroup): string {
  return groupLabels[group] ?? "Terms";
}

/** A field's definition within a document, if the document declares it. */
export function findField(
  document: DocumentDefinition,
  key: string,
): DocumentField | undefined {
  return document.fields.find((field) => field.key === key);
}
