import type { DiffLine } from "@/lib/cms/diff";

/** Renders a line diff. Word-level marks appear on lines that were rewritten. */
export default function DiffView({ lines }: { lines: DiffLine[] }) {
  const changed = lines.some((line) => line.op !== "equal");

  if (!changed) {
    return <p className="cms-field__hint">The story text is identical in these two revisions.</p>;
  }

  return (
    <pre className="cms-diff">
      {lines.map((line, index) => (
        <div key={index} data-op={line.op === "equal" ? undefined : line.op}>
          {line.words
            ? line.words.map((word, wordIndex) =>
                word.op === "equal" ? (
                  <span key={wordIndex}>{word.text}</span>
                ) : (
                  <mark key={wordIndex}>{word.text}</mark>
                ),
              )
            : line.text || " "}
        </div>
      ))}
    </pre>
  );
}
