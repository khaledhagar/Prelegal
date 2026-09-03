/**
 * Agreements the user has kept.
 *
 * A draft stores the captured answers rather than a rendered document, so
 * reopening one gives back a live agreement the assistant can carry on editing
 * -- and a change to the templates reaches work already saved.
 */

import { deleteJson, getJson, postJson } from "@/lib/api";
import type { DocumentValues } from "@/lib/documents/types";

const UNREACHABLE =
  "Could not reach the server. Check that the backend is running and try again.";

export type DraftSummary = {
  id: number;
  documentType: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type DraftDetail = DraftSummary & { values: DocumentValues };

export function listDrafts(): Promise<DraftSummary[]> {
  return getJson<DraftSummary[]>("/api/drafts", UNREACHABLE);
}

export function readDraft(id: number): Promise<DraftDetail> {
  return getJson<DraftDetail>(`/api/drafts/${id}`, UNREACHABLE);
}

export function saveDraft(
  documentType: string,
  title: string,
  values: DocumentValues,
): Promise<DraftSummary> {
  return postJson<DraftSummary>(
    "/api/drafts",
    { documentType, title, values },
    UNREACHABLE,
  );
}

export function deleteDraft(id: number): Promise<void> {
  return deleteJson<void>(`/api/drafts/${id}`, UNREACHABLE);
}

/**
 * A name for a saved agreement, from the parties if they are known.
 *
 * Someone with six saved drafts needs to tell them apart at a glance, and
 * "Mutual Non-Disclosure Agreement" six times over does not do that.
 */
export function suggestedTitle(
  documentName: string,
  values: DocumentValues,
): string {
  const companies = values.parties
    .map((party) => party.company.trim())
    .filter((company) => company.length > 0);

  return companies.length > 0
    ? `${documentName} — ${companies.join(" & ")}`
    : documentName;
}

/** "2026-09-03 10:45:48" from SQLite, rendered for a person. */
export function formatSavedAt(timestamp: string): string {
  // SQLite writes UTC without a zone marker; saying so stops the browser
  // reading it as local time and showing a draft saved hours in the future.
  const parsed = new Date(`${timestamp.replace(" ", "T")}Z`);
  if (Number.isNaN(parsed.getTime())) return timestamp;
  return parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
