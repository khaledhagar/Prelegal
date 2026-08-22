"use client";

import { useMemo, useState } from "react";
import { NdaForm } from "@/components/NdaForm";
import { NdaPreview } from "@/components/NdaPreview";
import { DownloadPdfButton } from "@/components/DownloadPdfButton";
import { assembleDocument } from "@/lib/assemble";
import { defaultFormValues } from "@/lib/form";

export default function Home() {
  const [values, setValues] = useState(defaultFormValues);

  // Reassembled on each keystroke. The document is a few dozen small objects,
  // so this is cheap and keeps the preview exactly in step with the form.
  const document = useMemo(() => assembleDocument(values), [values]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto max-w-7xl px-6 py-5">
          <h1 className="text-lg font-semibold tracking-tight">
            Mutual NDA creator
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Fill in the cover page and download a complete Mutual
            Non-Disclosure Agreement. Everything stays in your browser — nothing
            is uploaded.
          </p>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-8 px-6 py-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="space-y-5">
          <NdaForm values={values} onChange={setValues} />
          {/*
            Sticky action bar. `bottom` positioning lifts this out of its
            natural place at the end of the column, so it floats over whatever
            form field is at the bottom of the viewport -- it needs an opaque
            background and a border to read as a deliberate toolbar rather than
            as text bleeding through.
          */}
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-800 dark:bg-slate-900 lg:sticky lg:bottom-4 lg:z-10">
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
    </div>
  );
}
