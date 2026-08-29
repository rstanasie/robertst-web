/**
 * Just enough of a parser for the story format. No dependency, because the
 * format is deliberately small: YAML-ish frontmatter, then `##` parts.
 *
 *   ---
 *   version: 2
 *   previewUntil: the-theft
 *   ---
 *   ## The Theft of Fire {#the-theft}
 *
 *   A paragraph.
 *
 * Part ids may be given explicitly as `{#id}` and are otherwise slugified from
 * the heading. Explicit ids are what `previewUntil` should point at: they
 * survive a reworded heading in the next version.
 */

export type Frontmatter = Record<string, string>;

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function splitFrontmatter(source: string): { data: Frontmatter; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!match) {
    throw new Error("story file has no frontmatter block");
  }

  const data: Frontmatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const at = line.indexOf(":");
    if (at === -1) throw new Error(`frontmatter line is not \`key: value\`: ${line}`);
    const key = line.slice(0, at).trim();
    const raw = line.slice(at + 1).trim();
    data[key] = raw.replace(/^["'](.*)["']$/, "$1");
  }

  return { data, body: source.slice(match[0].length) };
}

export type ParsedPart = { id: string; heading: string; paragraphs: string[] };

export function splitParts(body: string): ParsedPart[] {
  const parts: ParsedPart[] = [];
  let current: ParsedPart | null = null;
  let buffer: string[] = [];

  const flushParagraph = () => {
    const text = buffer.join(" ").trim();
    buffer = [];
    if (text && current) current.paragraphs.push(text);
  };

  for (const line of body.split(/\r?\n/)) {
    const heading = /^##\s+(.*?)\s*(?:\{#([a-z0-9-]+)\})?\s*$/.exec(line);
    if (heading) {
      flushParagraph();
      if (current) parts.push(current);
      const title = heading[1].trim();
      current = { id: heading[2] ?? slugify(title), heading: title, paragraphs: [] };
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      continue;
    }
    buffer.push(line.trim());
  }

  flushParagraph();
  if (current) parts.push(current);
  return parts;
}
