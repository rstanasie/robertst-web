import { slugify } from "@/lib/cms/slug";

/**
 * Story markdown, divided at its `##` headings.
 *
 * Sections are what the free-preview cutoff counts, so this parser is part of
 * the access model rather than a rendering detail: `previewUntil` names a
 * section id, and everything after that section is withheld. Ids may be pinned
 * explicitly as `## The Theft {#the-theft}` so that rewording a heading in a
 * later revision does not silently move the cutoff.
 *
 * Only the `##` level is structural. Everything else — emphasis, quotes, lists,
 * links, images, `###` — is left in the body for the markdown renderer.
 */

export type StorySection = {
  id: string;
  /** Empty for text that appears before the first `##`. */
  heading: string;
  /** Markdown, not HTML. */
  body: string;
};

const HEADING = /^##\s+(.*?)\s*(?:\{#([a-z0-9-]+)\})?\s*$/;
const FENCE = /^(?:```|~~~)/;

export function splitSections(markdown: string): StorySection[] {
  const sections: StorySection[] = [];
  let current: StorySection | null = null;
  let buffer: string[] = [];
  let fenced = false;

  const flush = () => {
    if (!current) {
      return;
    }
    current.body = buffer.join("\n").replace(/^\n+|\n+$/g, "");
    buffer = [];
    if (current.heading || current.body) {
      sections.push(current);
    }
  };

  for (const line of markdown.split(/\r?\n/)) {
    // A `##` inside a code fence is a shell comment, not a section.
    if (FENCE.test(line.trim())) {
      fenced = !fenced;
    }

    const heading = !fenced ? HEADING.exec(line) : null;

    if (heading) {
      flush();
      const text = heading[1].trim();
      current = { id: heading[2] ?? (slugify(text) || `section-${sections.length + 1}`), heading: text, body: "" };
      continue;
    }

    if (!current) {
      current = { id: "opening", heading: "", body: "" };
    }

    buffer.push(line);
  }

  flush();

  return dedupeIds(sections);
}

/**
 * Two sections that slugify to the same id would make `previewUntil` ambiguous,
 * so later collisions are suffixed. Explicit ids collide the same way; the
 * editor warns rather than letting the cutoff become a coin toss.
 */
function dedupeIds(sections: StorySection[]): StorySection[] {
  const seen = new Map<string, number>();

  return sections.map((section) => {
    const count = seen.get(section.id) ?? 0;
    seen.set(section.id, count + 1);
    return count === 0 ? section : { ...section, id: `${section.id}-${count + 1}` };
  });
}

export function sectionIds(markdown: string): string[] {
  return splitSections(markdown).map((section) => section.id);
}

/**
 * The prefix of a story a non-subscriber may read.
 *
 * A `previewUntil` that names nothing — because the heading it pointed at was
 * deleted in a later revision — falls back to the first section rather than to
 * the whole story. Erring towards withholding is the safe direction for a
 * paywall.
 */
export function previewSections(
  sections: StorySection[],
  previewUntil: string | null,
): { shown: StorySection[]; withheld: number } {
  if (sections.length === 0) {
    return { shown: [], withheld: 0 };
  }

  const index = previewUntil ? sections.findIndex((section) => section.id === previewUntil) : -1;
  const end = index === -1 ? 1 : index + 1;
  const shown = sections.slice(0, end);

  return { shown, withheld: sections.length - shown.length };
}
