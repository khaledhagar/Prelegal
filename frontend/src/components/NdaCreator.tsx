"use client";

/**
 * The Mutual NDA creator: a conversation with the drafting assistant on the
 * left, the agreement it is building on the right, PDF download beneath.
 *
 * The chat replaced a cover-page form in PL-5. Everything downstream of the
 * values is untouched -- `assembleDocument` still turns them into one document
 * model, and the preview and the PDF still render from it -- so the assistant
 * simply became a second way to produce the same values.
 */

import { useMemo, useState } from "react";
import { NdaChat } from "@/components/NdaChat";
import { NdaPreview } from "@/components/NdaPreview";
import { DownloadPdfButton } from "@/components/DownloadPdfButton";
import { assembleDocument } from "@/lib/assemble";
import { emptyFormValues } from "@/lib/form";

export function NdaCreator() {
  const [values, setValues] = useState(emptyFormValues);

  // Reassembled whenever the assistant reports new values. The document is a
  // few dozen small objects, so this is cheap and keeps the preview exactly in
  // step with the conversation.
  const document = useMemo(() => assembleDocument(values), [values]);

  return (
    <>
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto max-w-7xl px-6 py-5">
          <h1 className="text-lg font-semibold tracking-tight">
            Mutual NDA creator
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Answer the assistant&apos;s questions and watch your Mutual
            Non-Disclosure Agreement fill in, then download it as a PDF.
            Everything stays in your browser — nothing is uploaded.
          </p>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-8 px-6 py-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="space-y-5 lg:sticky lg:top-4 lg:self-start">
          <NdaChat values={values} onValuesChange={setValues} />
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-800 dark:bg-slate-900">
            <DownloadPdfButton document={document} values={values} />
          </div>
        </div>

        <section aria-label="Agreement preview" className="min-w-0">
          <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <NdaPreview document={document} />
          </div>
          <p className="mt-4 text-xs text-slate-500 dark:text-slate-500">
            Based on the Common Paper Mutual Non-Disclosure Agreement
            (Version 1.0), free to use under{" "}
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
        </section>
      </main>
    </>
  );
}
