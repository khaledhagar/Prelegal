"use client";

/**
 * Generates the PDF in the browser and hands it to the user as a download.
 *
 * @react-pdf/renderer is imported lazily inside the click handler: it is a large
 * dependency and is only needed once the user actually asks for a file, so
 * keeping it out of the initial bundle makes first load noticeably cheaper.
 */
import { useState } from "react";
import type { NdaDocument } from "@/lib/document";
import { type NdaFormValues, missingRequiredFields, suggestedFileName } from "@/lib/form";

type Props = {
  document: NdaDocument;
  values: NdaFormValues;
};

export function DownloadPdfButton({ document: model, values }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missing = missingRequiredFields(values);

  async function handleDownload() {
    setBusy(true);
    setError(null);
    let url: string | null = null;
    try {
      const [{ pdf }, { NdaPdfDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/pdf/NdaDocument"),
      ]);

      const blob = await pdf(<NdaPdfDocument document={model} />).toBlob();

      url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = suggestedFileName(values);
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Could not generate the PDF: ${cause.message}`
          : "Could not generate the PDF.",
      );
    } finally {
      // Revoking immediately can cancel the download in some browsers, so give
      // the click a moment to be picked up first.
      if (url !== null) {
        const objectUrl = url;
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
      }
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleDownload}
        disabled={busy}
        className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
      >
        {busy ? "Preparing PDF…" : "Download PDF"}
      </button>

      {missing.length > 0 ? (
        <p className="text-xs text-amber-700 dark:text-amber-500">
          Still blank: {missing.join(", ")}. You can download anyway and complete
          the document by hand.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
