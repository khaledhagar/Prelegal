/**
 * The Prelegal wordmark, shared by the login screen and the signed-in shell so
 * the two cannot drift apart.
 *
 * The mark is set in the brand navy with a yellow accent on the second
 * syllable; on dark chrome the navy is unreadable, so `tone="onDark"` flips the
 * base to white and keeps the accent.
 */
type Props = {
  tone?: "onLight" | "onDark";
  className?: string;
};

export function Wordmark({ tone = "onLight", className = "" }: Props) {
  const base = tone === "onDark" ? "text-white" : "text-brand-navy";
  return (
    <span
      className={`font-semibold tracking-tight ${base} ${className}`}
      // The wordmark is one word; the colour split is decorative and must not
      // reach a screen reader as two separate pieces of text.
      aria-label="Prelegal"
    >
      <span aria-hidden="true">
        Pre<span className="text-brand-yellow">legal</span>
      </span>
    </span>
  );
}
