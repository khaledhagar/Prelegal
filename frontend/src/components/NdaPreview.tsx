/**
 * Renders the shared document model to HTML.
 *
 * The PDF renderer in src/pdf/NdaDocument.tsx walks the same model, so the two
 * outputs stay in step. When you add a block kind, both renderers must handle
 * it: the assertNever call in each switch's default branch fails to compile
 * until you do. That guard is load-bearing -- without it a missing case just
 * returns undefined, which React accepts, and the content vanishes silently.
 */
import { assertNever, type Block, type Inline, type NdaDocument } from "@/lib/document";

function InlineRuns({ content }: { content: Inline[] }) {
  return (
    <>
      {content.map((run, index) => {
        switch (run.kind) {
          case "strong":
            return (
              <strong key={index} className="font-semibold">
                {run.text}
              </strong>
            );
          case "reference":
            // A pointer to a value defined on the cover page, not a value itself.
            return (
              <span
                key={index}
                className="font-medium text-slate-700 underline decoration-slate-300 underline-offset-2 dark:text-slate-300 dark:decoration-slate-600"
                title="Defined on the cover page"
              >
                {run.text}
              </span>
            );
          case "link":
            return (
              <a
                key={index}
                href={run.href}
                target="_blank"
                rel="noreferrer"
                className="text-sky-700 underline underline-offset-2 dark:text-sky-400"
              >
                {run.text}
              </a>
            );
          case "value":
            return run.filled ? (
              <span key={index} className="bg-amber-100/70 px-0.5 dark:bg-amber-400/20">
                {run.text}
              </span>
            ) : (
              <span
                key={index}
                className="rounded bg-slate-200 px-1 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
              >
                {run.text}
              </span>
            );
          default:
            return <span key={index}>{run.text}</span>;
        }
      })}
    </>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "title":
      return (
        <h2 className="mt-8 border-b border-slate-300 pb-2 text-xl font-semibold tracking-tight first:mt-0 dark:border-slate-700">
          {block.text}
        </h2>
      );

    case "heading":
      return (
        <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
          {block.text}
        </h3>
      );

    case "label":
      return (
        <p className="text-xs italic text-slate-500 dark:text-slate-500">
          {block.text}
        </p>
      );

    case "paragraph":
      return (
        <p className="mt-2 leading-relaxed">
          <InlineRuns content={block.content} />
        </p>
      );

    case "clause":
      return (
        <p className="mt-4 leading-relaxed">
          <span className="mr-1 font-semibold">{block.number}.</span>
          <InlineRuns content={block.content} />
        </p>
      );

    case "option":
      return (
        <p className="mt-1 flex gap-2 leading-relaxed">
          <span aria-hidden className="select-none font-mono">
            {block.checked ? "[x]" : "[ ]"}
          </span>
          <span className={block.checked ? "" : "text-slate-400 dark:text-slate-600"}>
            <InlineRuns content={block.content} />
          </span>
        </p>
      );

    case "signatures":
      return (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[32rem] border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-40 border border-slate-300 bg-slate-50 p-2 text-left font-semibold dark:border-slate-700 dark:bg-slate-800" />
                {block.parties.map((party, index) => (
                  <th
                    key={index}
                    className="border border-slate-300 bg-slate-50 p-2 text-left font-semibold dark:border-slate-700 dark:bg-slate-800"
                  >
                    {party}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row) => (
                <tr key={row.label}>
                  <th className="border border-slate-300 p-2 text-left font-medium dark:border-slate-700">
                    {row.label}
                  </th>
                  {row.values.map((cell, index) => (
                    <td
                      key={index}
                      className="border border-slate-300 p-2 align-top dark:border-slate-700"
                    >
                      {cell.trim().length > 0 ? (
                        <span className="whitespace-pre-wrap">{cell}</span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-700">&nbsp;</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "footnote":
      return (
        <p className="mt-8 border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-500">
          <InlineRuns content={block.content} />
        </p>
      );

    default:
      // Forces this switch to stay exhaustive. Without it an unhandled kind
      // would return undefined -- a legal ReactNode -- and silently disappear.
      return assertNever(block);
  }
}

export function NdaPreview({ document }: { document: NdaDocument }) {
  return (
    <article className="text-sm text-slate-900 dark:text-slate-100">
      {document.blocks.map((block, index) => (
        <BlockView key={index} block={block} />
      ))}
    </article>
  );
}
