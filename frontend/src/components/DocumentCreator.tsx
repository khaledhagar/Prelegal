"use client";

/**
 * The drafting workspace: pick or describe an agreement, talk it through, watch
 * it fill in, download it.
 *
 * PL-6 widened this from the Mutual NDA to all eleven Common Paper agreements.
 * The values and the transcript both live here because the document list, the
 * conversation and the preview all read or write them -- everything below is a
 * view of this state.
 */

import { useMemo, useState } from "react";
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
import { emptyValues } from "@/lib/values";

export function DocumentCreator() {
  const [values, setValues] = useState(emptyValues);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: OPENING_MESSAGE },
  ]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const document = findDocument(values.documentType);

  // Reassembled whenever the assistant reports new values. The agreement is a
  // few hundred small objects, so this is cheap and keeps the preview exactly
  // in step with the conversation.
  const agreement = useMemo(
    () => (document ? assembleAgreement(document, values) : null),
    [document, values],
  );

  async function handleSend(content: string) {
    const next: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(next);
    setPending(true);
    setError(null);

    try {
      const turn = await sendChat(next, values);
      setMessages([...next, { role: "assistant", content: turn.reply }]);
      setValues(turn.values);
    } catch (caught) {
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
  }

  return (
    <>
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto max-w-7xl px-6 py-5">
          <h1 className="text-lg font-semibold tracking-tight text-brand-navy dark:text-slate-100">
            {document ? document.name : "Agreement drafter"}
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {document
              ? document.description
              : `Tell the assistant what you need, or pick from the ${allDocuments.length} agreements on the left. ` +
                "Everything stays in your browser — nothing is uploaded."}
          </p>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-8 px-6 py-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="space-y-5 lg:sticky lg:top-4 lg:self-start">
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
            <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-800 dark:bg-slate-900">
              <DownloadPdfButton
                agreement={agreement}
                document={document}
                values={values}
              />
            </div>
          ) : null}
        </div>

        <section aria-label="Agreement preview" className="min-w-0">
          {document && agreement ? (
            <>
              {document.limitation ? (
                <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  {document.limitation}
                </p>
              ) : null}

              <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <AgreementPreview document={agreement} />
              </div>

              <p className="mt-4 text-xs text-slate-500 dark:text-slate-500">
                Based on the Common Paper {document.name}, free to use under{" "}
                <a
                  href="https://creativecommons.org/licenses/by/4.0/"
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2"
                >
                  CC BY 4.0
                </a>
                . This tool does not provide legal advice.
              </p>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
              <p className="font-medium text-brand-navy dark:text-slate-200">
                No agreement chosen yet.
              </p>
              <p className="mt-2">
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
