"use client";

/**
 * The conversation that fills in the agreement.
 *
 * The transcript and the values both live in the parent: picking a document
 * from the list beside this panel also speaks into the conversation, so the
 * messages cannot belong to the chat alone. What is left here is the view and
 * the input -- everything this component owns is what the user is typing.
 */

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ChatMessage } from "@/lib/chat";
import { capturedFields } from "@/lib/values";
import type { DocumentDefinition, DocumentValues } from "@/lib/documents/types";

type Props = {
  messages: ChatMessage[];
  values: DocumentValues;
  /** Undefined until the assistant or the user settles on an agreement. */
  document: DocumentDefinition | undefined;
  pending: boolean;
  error: string | null;
  onSend: (message: string) => void;
};

function Bubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <p
        className={
          "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed " +
          (isUser
            ? "rounded-br-sm bg-brand-blue text-white"
            : "rounded-bl-sm bg-surface-sunken text-ink")
        }
      >
        <span className="sr-only">{isUser ? "You said: " : "Assistant said: "}</span>
        {message.content}
      </p>
    </div>
  );
}

function Captured({
  document,
  values,
}: {
  document: DocumentDefinition;
  values: DocumentValues;
}) {
  const rows = capturedFields(document, values);
  if (rows.length === 0) return null;

  return (
    <details className="rounded-lg border border-line bg-surface-sunken px-3 py-2">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-ink-soft">
        Captured so far ({rows.length})
      </summary>
      <dl className="mt-2 space-y-1.5">
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[9rem_minmax(0,1fr)] gap-2 text-xs"
          >
            <dt className="text-brand-gray">{row.label}</dt>
            <dd className="break-words text-ink">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export function DocumentChat({
  messages,
  values,
  document,
  pending,
  error,
  onSend,
}: Props) {
  const [draft, setDraft] = useState("");
  const endOfTranscript = useRef<HTMLDivElement>(null);

  // Keep the newest message in view. Without this the conversation grows off
  // the bottom of the panel and the user has to scroll after every turn.
  useEffect(() => {
    endOfTranscript.current?.scrollIntoView({ block: "end" });
  }, [messages, pending]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (content.length === 0 || pending) return;
    setDraft("");
    onSend(content);
  }

  return (
    <section
      aria-label="Drafting assistant"
      className="flex h-[32rem] flex-col rounded-xl border border-line bg-surface shadow-sm lg:h-[calc(100vh-24rem)]"
    >
      <div
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        aria-busy={pending}
        className="flex-1 space-y-3 overflow-y-auto p-4"
      >
        {messages.map((message, index) => (
          <Bubble key={index} message={message} />
        ))}

        {pending ? (
          <p className="text-xs italic text-brand-gray">The assistant is typing…</p>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-200"
          >
            {error}
          </p>
        ) : null}

        <div ref={endOfTranscript} />
      </div>

      <div className="space-y-2 border-t border-line p-3">
        {document ? <Captured document={document} values={values} /> : null}

        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <label htmlFor="chat-message" className="sr-only">
            Message the assistant
          </label>
          <input
            id="chat-message"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink shadow-sm outline-none transition placeholder:text-ink-faint focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/25"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Type your answer…"
            autoComplete="off"
            disabled={pending}
          />
          <button
            type="submit"
            disabled={pending || draft.trim().length === 0}
            className="shrink-0 rounded-lg bg-brand-purple px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </section>
  );
}
