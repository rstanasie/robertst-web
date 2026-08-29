import type { StoryPart } from "@/lib/content/types";

/** Renders whatever parts the access layer handed over. Never fetches. */
export default function StoryBody({ parts }: { parts: StoryPart[] }) {
  return (
    <>
      {parts.map((part) => (
        <section key={part.id} className="myth-part" aria-labelledby={`part-${part.id}`}>
          <h2 id={`part-${part.id}`}>{part.heading}</h2>

          {part.paragraphs.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </section>
      ))}
    </>
  );
}
