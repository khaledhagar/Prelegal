/**
 * Renders the shared document model to HTML.
 *
 * The colours here are paper and ink, not the brand palette: an agreement
 * printed in corporate purple reads as marketing rather than as something
 * anyone would sign. The tokens come from globals.css so both colour schemes
 * are handled without a `dark:` twin on every rule.
 *
 * The PDF renderer in src/pdf/AgreementDocument.tsx walks the same model, so the two
 * outputs stay in step. When you add a block kind, both renderers must handle
 * it: the assertNever call in each switch's default branch fails to compile
 * until you do. That guard is load-bearing -- without it a missing case just
 * returns undefined, which React accepts, and the content vanishes silently.
 */
import { assertNever, type Agreement, type Block, type Inline } from "@/lib/document";

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
                className="font-medium underline decoration-paper-line underline-offset-2"
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
                className="underline underline-offset-2 decoration-paper-soft hover:decoration-paper-ink"
              >
                {run.text}
              </a>
            );
          case "value":
            return run.filled ? (
              <span key={index} className="bg-paper-mark px-0.5">
                {run.text}
              </span>
            ) : (
              <span
                key={index}
                className="rounded border border-dashed border-paper-line px-1 text-paper-soft"
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
        <h2 className="mt-8 border-b border-paper-line pb-2 text-xl font-semibold tracking-tight first:mt-0">
          {block.text}
        </h2>
      );

    case "heading":
      return (
        <h3 className="mt-6 text-xs font-semibold uppercase tracking-[0.08em] text-paper-soft">
          {block.text}
        </h3>
      );

    case "label":
      return (
        <p className="text-xs italic text-paper-soft">
          {block.text}
        </p>
      );

    case "paragraph":
      return (
        <p className="mt-2 leading-relaxed">
          <InlineRuns content={block.content} />
        </p>
      );

    case "section":
      return (
        <h3 className="mt-7 text-sm font-semibold text-paper-ink">
          {block.marker} {block.text}
        </h3>
      );

    case "clause":
      // Nested clauses indent one step per level; the agreements that use them
      // go three deep at most, so a fixed scale covers every template.
      return (
        <p
          className="mt-4 leading-relaxed"
          style={{ marginLeft: `${block.depth * 1.25}rem` }}
        >
          <span className="mr-1 font-semibold">{block.marker}</span>
          <InlineRuns content={block.content} />
        </p>
      );

    case "option":
      return (
        <p className="mt-1 flex gap-2 leading-relaxed">
          <span aria-hidden className="select-none font-mono">
            {block.checked ? "[x]" : "[ ]"}
          </span>
          <span className={block.checked ? "" : "text-paper-soft"}>
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
                <th className="w-40 border border-paper-line bg-paper-mark/30 p-2 text-left font-semibold" />
                {block.parties.map((party, index) => (
                  <th
                    key={index}
                    className="border border-paper-line bg-paper-mark/30 p-2 text-left font-semibold"
                  >
                    {party}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row) => (
                <tr key={row.label}>
                  <th className="border border-paper-line p-2 text-left font-medium">
                    {row.label}
                  </th>
                  {row.values.map((cell, index) => (
                    <td
                      key={index}
                      className="border border-paper-line p-2 align-top"
                    >
                      {cell.trim().length > 0 ? (
                        <span className="whitespace-pre-wrap">{cell}</span>
                      ) : (
                        <span className="text-paper-line">&nbsp;</span>
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
        <p className="mt-8 border-t border-paper-line pt-3 text-xs text-paper-soft">
          <InlineRuns content={block.content} />
        </p>
      );

    default:
      // Forces this switch to stay exhaustive. Without it an unhandled kind
      // would return undefined -- a legal ReactNode -- and silently disappear.
      return assertNever(block);
  }
}

export function AgreementPreview({ document }: { document: Agreement }) {
  return (
    <article className="font-serif text-[0.9375rem] leading-relaxed text-paper-ink">
      {document.blocks.map((block, index) => (
        <BlockView key={index} block={block} />
      ))}
    </article>
  );
}
