/**
 * Slugs. Pure — no database — so the rules can be tested and reused in the
 * browser to show the operator what their title will become.
 */

const MAX_LENGTH = 96;

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_LENGTH)
    .replace(/-+$/g, "");
}

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= MAX_LENGTH && SLUG_PATTERN.test(slug);
}

/**
 * The first free slug in the `base`, `base-2`, `base-3` … series.
 *
 * Takes a predicate rather than reaching for the database so it stays pure; the
 * caller supplies the set of slugs already taken. This is a courtesy, not the
 * uniqueness guarantee — that is the unique index on Story.slug, which is what
 * actually holds when two writers race.
 */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  const root = slugify(base) || "story";

  if (!taken.has(root)) {
    return root;
  }

  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${root}-${suffix}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
}
