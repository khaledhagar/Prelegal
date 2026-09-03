"use client";

/**
 * The drafting workspace: pick or describe an agreement, talk it through, watch
 * it fill in, save it, download it.
 *
 * PL-6 widened this from the Mutual NDA to all eleven Common Paper agreements;
 * PL-7 gave it somewhere to keep the result. The values and the transcript both
 * live here because the document list, the conversation and the preview all
 * read or write them -- everything below is a view of this state.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DocumentChat } from "@/components/DocumentChat";
import { DocumentPicker } from "@/components/DocumentPicker";
import { AgreementPreview } from "@/components/AgreementPreview";
import { DownloadPdfButton } from "@/components/DownloadPdfButton";
import { assembleAgreement } from "@/lib/assemble";
import {
  ChatError,
  OPENING_MESSAGE,
  openingMessageFor,
  sendChat,
  type ChatMessage,
} from "@/lib/chat";
import { allDocuments, findDocument } from "@/lib/documents/registry";
import { readDraft, saveDraft, suggestedTitle } from "@/lib/drafts";
import { forgetSession, isSessionExpired } from "@/lib/session";
import { emptyValues } from "@/lib/values";

/** Whether the workspace was opened with `?draft=<id>` from "My documents". */
function requestedDraftId(): number | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("draft");
  const id = Number(raw);
  return raw !== null && Number.isInteger(id) && id > 0 ? id : null;
}

export function DocumentCreator() {
  const router = useRouter();

  const [values, setValues] = useState(emptyValues);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: OPENING_MESSAGE },
  ]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const document = findDocument(values.documentType);

  // Reassembled whenever the assistant reports new values. The agreement is a
  // few hundred small objects, so this is cheap and keeps the preview exactly
  // in step with the conversation.
  const agreement = useMemo(
    () => (document ? assembleAgreement(document, values) : null),
    [document, values],
  );

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

  // Opening a saved draft. Runs once: the id comes from the URL the user
  // arrived on, and reloading it afterwards would undo their edits.
  useEffect(() => {
    const id = requestedDraftId();
    if (id === null) return;

    let cancelled = false;
    readDraft(id)
      .then((draft) => {
        if (cancelled) return;
        setValues(draft.values);
        setMessages([
          {
            role: "assistant",
            content:
              `Picking up "${draft.title}". Tell me what to change, or ` +
              `download it as it stands.`,
          },
        ]);
      })
      .catch((caught) => {
        if (cancelled) return;
        if (isSessionExpired(caught)) {
          handleAuthLoss();
          return;
        }
        setError("That saved document could not be opened.");
      });

    return () => {
      cancelled = true;
    };
  }, [handleAuthLoss]);

  async function handleSend(content: string) {
    const next: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(next);
    setPending(true);
    setError(null);
    setSaved(null);

    try {
      const turn = await sendChat(next, values);
      setMessages([...next, { role: "assistant", content: turn.reply }]);
      setValues(turn.values);
    } catch (caught) {
      if (isSessionExpired(caught)) {
        handleAuthLoss();
        return;
      }
      // The user's message stays in the transcript so they can see what was
      // sent; the error sits beside it rather than impersonating the assistant.
      setError(
        caught instanceof ChatError
          ? caught.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }

  /**
   * Choosing from the list speaks into the conversation rather than silently
   * switching context, so the transcript still reads as one exchange and the
   * assistant's next turn is sent the document the user actually picked.
   */
  function handleSelect(slug: string) {
    if (slug === values.documentType || pending) return;
    const picked = findDocument(slug);
    if (!picked) return;

    setValues({ ...values, documentType: slug });
    setMessages((current) => [
      ...current,
      { role: "assistant", content: openingMessageFor(picked.name) },
    ]);
    setError(null);
    setSaved(null);
  }

  async function handleSave() {
    if (!document || saving) return;

    setSaving(true);
    setError(null);
    try {
      const title = suggestedTitle(document.name, values);
      await saveDraft(document.slug, title, values);
      setSaved(title);
    } catch (caught) {
      if (isSessionExpired(caught)) {
        handleAuthLoss();
        return;
      }
      setError(
        caught instanceof Error ? caught.message : "Could not save the document.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto max-w-7xl px-6 py-6">
          <h1 className="text-xl font-semibold tracking-tight text-brand-navy dark:text-white">
            {document ? document.name : "Agreement drafter"}
          </h1>
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-ink-soft">
            {document
              ? document.description
              : `Tell the assistant what you need, or pick from the ${allDocuments.length} agreements on the left. ` +
                "The conversation is the only thing that leaves your browser."}
          </p>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-8 px-6 py-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        {/*
          The column is sticky, so it must never be taller than the space it
          sticks in: anything past the bottom edge cannot be scrolled to, and
          the two buttons below the chat are the last things in it. Bounding the
          height here and letting the chat flex into what is left keeps them
          reachable without anyone having to keep a magic number in step with
          the picker and the actions. `overflow-y-auto` is the backstop for a
          viewport too short even for the chat's minimum.
        */}
        <div className="space-y-5 lg:sticky lg:top-20 lg:flex lg:max-h-[calc(100vh-6rem)] lg:flex-col lg:self-start lg:overflow-y-auto">
          <DocumentPicker selected={values.documentType} onSelect={handleSelect} />

          <DocumentChat
            messages={messages}
            values={values}
            document={document}
            pending={pending}
            error={error}
            onSend={handleSend}
          />

          {document && agreement ? (
            <div className="space-y-3 rounded-xl border border-line bg-surface p-4 shadow-sm">
              <DownloadPdfButton
                agreement={agreement}
                document={document}
                values={values}
              />

              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="w-full rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save to my documents"}
              </button>

              {saved ? (
                <p
                  role="status"
                  className="text-xs text-ink-soft"
                >
                  Saved “{saved}”.{" "}
                  <a
                    href="/app/documents"
                    className="font-medium text-brand-blue underline underline-offset-2"
                  >
                    View my documents
                  </a>
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <section aria-label="Agreement preview" className="min-w-0">
          {document && agreement ? (
            <>
              {/* The disclaimer sits above the document, not in fine print
                  below it: it is the thing someone most needs to know before
                  they take this to a counterparty. */}
              <p className="mb-4 rounded-lg border border-brand-yellow/50 bg-brand-yellow/10 px-4 py-3 text-sm leading-relaxed text-brand-navy dark:text-brand-yellow">
                <strong className="font-semibold">This is a draft.</strong> It
                is generated from a template and your answers, and is subject to
                review by a qualified lawyer before signing. Prelegal does not
                provide legal advice.
              </p>

              {document.limitation ? (
                <p className="mb-4 rounded-lg border border-line bg-surface-sunken px-4 py-3 text-xs leading-relaxed text-ink-soft">
                  {document.limitation}
                </p>
              ) : null}

              <div className="overflow-hidden rounded-xl border border-line shadow-sm">
                <div className="bg-paper p-8 sm:p-10">
                  <AgreementPreview document={agreement} />
                </div>
              </div>

              <p className="mt-4 text-xs text-ink-faint">
                Based on the Common Paper {document.name}, free to use under{" "}
                <a
                  href="https://creativecommons.org/licenses/by/4.0/"
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2"
                >
                  CC BY 4.0
                </a>
                .
              </p>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-line-strong bg-surface p-10 text-sm text-ink-soft">
              <p className="text-base font-semibold text-brand-navy dark:text-white">
                No agreement chosen yet.
              </p>
              <p className="mt-2 max-w-prose leading-relaxed">
                Describe what you need in the chat and the assistant will work
                out which agreement fits — or choose one from the list. Your
                document will appear here as it fills in.
              </p>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
