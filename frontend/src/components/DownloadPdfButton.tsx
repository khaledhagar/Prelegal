"use client";

/**
 * Generates the PDF in the browser and hands it to the user as a download.
 *
 * @react-pdf/renderer is imported lazily inside the click handler: it is a large
 * dependency and is only needed once the user actually asks for a file, so
 * keeping it out of the initial bundle makes first load noticeably cheaper.
 */
import { useState } from "react";
import type { Agreement } from "@/lib/document";
import type { DocumentDefinition, DocumentValues } from "@/lib/documents/types";
import { missingRequiredFields, suggestedFileName } from "@/lib/values";

type Props = {
  /** The assembled document model, ready to render. */
  agreement: Agreement;
  /** Which agreement it is, for the file name and the PDF's title metadata. */
  document: DocumentDefinition;
  values: DocumentValues;
};

export function DownloadPdfButton({ agreement, document, values }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missing = missingRequiredFields(document, values);

  async function handleDownload() {
    setBusy(true);
    setError(null);
    let url: string | null = null;
    try {
      const [{ pdf }, { AgreementPdfDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/pdf/AgreementDocument"),
      ]);

      const blob = await pdf(
        <AgreementPdfDocument document={agreement} name={document.name} />,
      ).toBlob();

      url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = suggestedFileName(document, values);
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
        className="w-full rounded-lg bg-brand-purple px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Preparing PDF…" : "Download PDF"}
      </button>

      {missing.length > 0 ? (
        <p className="text-xs leading-relaxed text-ink-soft">
          Still blank: {missing.join(", ")}. You can download anyway and complete
          the document by hand.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
