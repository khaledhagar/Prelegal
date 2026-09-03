"use client";

/**
 * The catalogue of agreements, for someone who already knows what they want.
 *
 * The assistant can work out the document from conversation, and has to be able
 * to -- that is how "I need an employment contract" gets a useful answer rather
 * than a shrug. But making a user negotiate their way to a Service Level
 * Agreement they could have pointed at would be a worse tool, so both routes
 * exist and they set the same value.
 */

import { allDocuments } from "@/lib/documents/registry";

type Props = {
  /** The chosen document's slug, or "" while the assistant is still asking. */
  selected: string;
  onSelect: (slug: string) => void;
};

export function DocumentPicker({ selected, onSelect }: Props) {
  return (
    <section
      aria-label="Choose a document"
      className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
    >
      <h2 className="border-b border-slate-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-brand-gray dark:border-slate-800">
        Documents
      </h2>
      <ul className="max-h-64 overflow-y-auto p-1.5">
        {allDocuments.map((document) => {
          const isSelected = document.slug === selected;
          return (
            <li key={document.slug}>
              <button
                type="button"
                onClick={() => onSelect(document.slug)}
                aria-current={isSelected ? "true" : undefined}
                title={document.description}
                className={
                  "w-full rounded-md px-2.5 py-1.5 text-left text-sm transition " +
                  (isSelected
                    ? "bg-brand-blue font-semibold text-white"
                    : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800")
                }
              >
                {document.name}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
