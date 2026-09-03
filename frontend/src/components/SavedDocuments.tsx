"use client";

/**
 * Agreements the user has kept.
 *
 * The list is deliberately thin: a title, what kind of agreement it is, and
 * when it was saved. Everything else lives behind "Open", which loads the
 * saved answers back into the workspace so the assistant can carry on.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { findDocument } from "@/lib/documents/registry";
import {
  deleteDraft,
  formatSavedAt,
  listDrafts,
  type DraftSummary,
} from "@/lib/drafts";
import { forgetSession, isSessionExpired } from "@/lib/session";

export function SavedDocuments() {
  const router = useRouter();
  const [drafts, setDrafts] = useState<DraftSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);

  /*
   * The router is held in a ref rather than a dependency. `useRouter()` returns
   * a fresh object on every render, so a callback that depends on it changes
   * identity every render -- and an effect keyed on that callback re-runs
   * forever, refetching the list and undoing what the user just did.
   */
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  /** A lost session means it was signed out elsewhere, or the cookie expired. */
  const handleAuthLoss = useCallback(() => {
    forgetSession();
    routerRef.current.replace("/");
  }, []);

  const refresh = useCallback(() => {
    listDrafts()
      .then(setDrafts)
      .catch((caught) => {
        if (isSessionExpired(caught)) {
          handleAuthLoss();
          return;
        }
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load your documents.",
        );
        setDrafts([]);
      });
  }, [handleAuthLoss]);

  useEffect(refresh, [refresh]);

  async function handleDelete(id: number) {
    setRemoving(id);
    setError(null);
    try {
      await deleteDraft(id);
      setDrafts((current) =>
        (current ?? []).filter((draft) => draft.id !== id),
      );
    } catch (caught) {
      if (isSessionExpired(caught)) {
        handleAuthLoss();
        return;
      }
      setError(
        caught instanceof Error ? caught.message : "Could not delete that document.",
      );
    } finally {
      setRemoving(null);
    }
  }

  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto max-w-7xl px-6 py-6">
          <h1 className="text-xl font-semibold tracking-tight text-brand-navy dark:text-white">
            My documents
          </h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            Agreements you have saved. Open one to keep working on it, or
            download it again as a PDF.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        {error ? (
          <p
            role="alert"
            className="mb-5 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-200"
          >
            {error}
          </p>
        ) : null}

        {drafts === null ? (
          <p className="text-sm text-ink-soft">Loading your documents…</p>
        ) : drafts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-strong bg-surface p-10 text-center">
            <p className="text-base font-semibold text-brand-navy dark:text-white">
              Nothing saved yet.
            </p>
            <p className="mx-auto mt-2 max-w-prose text-sm leading-relaxed text-ink-soft">
              Draft an agreement and choose “Save to my documents” to keep it
              here.
            </p>
            <Link
              href="/app"
              className="mt-6 inline-block rounded-lg bg-brand-purple px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
            >
              Start a document
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {drafts.map((draft) => {
              const definition = findDocument(draft.documentType);
              return (
                <li
                  key={draft.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-surface p-4 shadow-sm transition hover:border-line-strong"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{draft.title}</p>
                    <p className="mt-0.5 text-xs text-ink-faint">
                      {definition?.name ?? draft.documentType} · saved{" "}
                      {formatSavedAt(draft.updatedAt)}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Link
                      href={`/app?draft=${draft.id}`}
                      className="rounded-lg bg-brand-purple px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
                    >
                      Open
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDelete(draft.id)}
                      disabled={removing === draft.id}
                      aria-label={`Delete ${draft.title}`}
                      className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink-soft transition hover:bg-surface-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {removing === draft.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-8 rounded-lg border border-brand-yellow/40 bg-brand-yellow/10 px-4 py-3 text-xs leading-relaxed text-brand-navy dark:text-brand-yellow">
          Saved documents are drafts and are subject to review by a qualified
          lawyer before anyone signs them.
        </p>
      </main>
    </>
  );
}
