import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { StorySection } from "@/lib/content/sections";

/**
 * Renders whatever sections the access layer handed over. Never fetches, and
 * never receives text the reader is not entitled to.
 *
 * Markdown goes through react-markdown, which builds React elements directly
 * and never calls `dangerouslySetInnerHTML`. Raw HTML inside story text is
 * therefore inert by construction rather than by sanitiser configuration:
 * `rehype-raw` is deliberately not installed, so there is no switch to leave
 * flipped the wrong way. Link and image URLs are filtered by react-markdown's
 * default transform, which drops `javascript:` and other executable schemes.
 */
export default function StoryContent({ sections }: { sections: StorySection[] }) {
  return (
    <>
      {sections.map((section) => (
        <section
          key={section.id}
          id={section.id}
          className="myth-part"
          aria-labelledby={section.heading ? `part-${section.id}` : undefined}
        >
          {section.heading && <h2 id={`part-${section.id}`}>{section.heading}</h2>}

          <Markdown remarkPlugins={[remarkGfm]}>{section.body}</Markdown>
        </section>
      ))}
    </>
  );
}
