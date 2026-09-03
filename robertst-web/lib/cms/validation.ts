import { StoryStatus } from "@prisma/client";

import { isValidSlug } from "./slug";
import { sectionIds } from "@/lib/content/sections";
import type { FieldErrors } from "./errors";

/**
 * Server-side validation. The editor mirrors some of this for immediate
 * feedback, but nothing here may be skipped on the client's say-so: every
 * mutation runs these before it touches the database.
 */

export type StoryInput = {
  title: string;
  slug: string;
  subtitle: string | null;
  excerpt: string;
  content: string;
  previewUntil: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  featuredImageId: string | null;
  ogImageId: string | null;
};

export const LIMITS = {
  title: 200,
  slug: 96,
  subtitle: 240,
  /** Long enough for two sentences; short enough to be a meta description. */
  excerpt: 400,
  content: 400_000,
  seoTitle: 70,
  seoDescription: 200,
  alt: 300,
} as const;

/**
 * Prisma's cuid, loosely. The point is to reject anything that is obviously not
 * an id before it becomes a query, not to re-implement the generator.
 */
export function isId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9_-]{8,64}$/i.test(value);
}

const text = (form: FormData, key: string): string => {
  const value = form.get(key);
  return typeof value === "string" ? value.replace(/\r\n/g, "\n").trim() : "";
};

const optional = (form: FormData, key: string): string | null => text(form, key) || null;

export function parseStoryForm(form: FormData): StoryInput {
  return {
    title: text(form, "title"),
    slug: text(form, "slug"),
    subtitle: optional(form, "subtitle"),
    excerpt: text(form, "excerpt"),
    // Deliberately not trimmed to a single line: leading indentation is part of
    // markdown. Only the outer whitespace goes.
    content: (form.get("content") ?? "").toString().replace(/\r\n/g, "\n").trim(),
    previewUntil: optional(form, "previewUntil"),
    seoTitle: optional(form, "seoTitle"),
    seoDescription: optional(form, "seoDescription"),
    featuredImageId: optional(form, "featuredImageId"),
    ogImageId: optional(form, "ogImageId"),
  };
}

const tooLong = (value: string | null, limit: number) => value !== null && value.length > limit;

/** What must hold before anything is written at all, published or not. */
export function validateDraft(input: StoryInput): FieldErrors {
  const errors: FieldErrors = {};

  if (!input.title) {
    errors.title = "A title is required.";
  } else if (tooLong(input.title, LIMITS.title)) {
    errors.title = `Keep the title under ${LIMITS.title} characters.`;
  }

  if (!input.slug) {
    errors.slug = "A slug is required.";
  } else if (!isValidSlug(input.slug)) {
    errors.slug = "Use lowercase letters, numbers and single hyphens.";
  }

  if (tooLong(input.subtitle, LIMITS.subtitle)) {
    errors.subtitle = `Keep the subtitle under ${LIMITS.subtitle} characters.`;
  }

  if (tooLong(input.excerpt, LIMITS.excerpt)) {
    errors.excerpt = `Keep the excerpt under ${LIMITS.excerpt} characters.`;
  }

  if (tooLong(input.content, LIMITS.content)) {
    errors.content = "This story is longer than the editor supports.";
  }

  if (tooLong(input.seoTitle, LIMITS.seoTitle)) {
    errors.seoTitle = `Search titles are cut off past ${LIMITS.seoTitle} characters.`;
  }

  if (tooLong(input.seoDescription, LIMITS.seoDescription)) {
    errors.seoDescription = `Keep the description under ${LIMITS.seoDescription} characters.`;
  }

  for (const key of ["featuredImageId", "ogImageId"] as const) {
    const value = input[key];
    if (value !== null && !isId(value)) {
      errors[key] = "That image reference is not valid.";
    }
  }

  return errors;
}

/**
 * The extra bar for going public. Nothing here blocks saving a draft — a story
 * is allowed to be half-written for as long as the writer likes.
 */
export function validatePublish(input: StoryInput): FieldErrors {
  const errors = validateDraft(input);

  if (!input.content) {
    errors.content = "A story needs content before it can be published.";
  }

  if (!input.excerpt) {
    errors.excerpt = "An excerpt is required: it is the teaser and the search description.";
  }

  if (input.previewUntil && !sectionIds(input.content).includes(input.previewUntil)) {
    errors.previewUntil = "That section no longer exists in the story.";
  }

  return errors;
}

/**
 * The content-bearing fields, in a fixed order. A revision is a snapshot of
 * exactly these, and the editor compares against exactly these to decide
 * whether it has unsaved work.
 */
export const CONTENT_FIELDS = [
  "title",
  "slug",
  "subtitle",
  "excerpt",
  "content",
  "previewUntil",
  "seoTitle",
  "seoDescription",
  "featuredImageId",
  "ogImageId",
] as const satisfies readonly (keyof StoryInput)[];

export type StorySnapshot = Pick<StoryInput, (typeof CONTENT_FIELDS)[number]>;

/**
 * A stable string for "these are the same story". Used on both sides: the
 * server hands back the fingerprint of what it wrote, and the editor compares
 * the form against it. That is what lets "unsaved changes" be derived during
 * render instead of mirrored into state by an effect.
 */
export const contentFingerprint = (input: StorySnapshot): string =>
  JSON.stringify(CONTENT_FIELDS.map((key) => input[key] ?? null));

export const hasErrors = (errors: FieldErrors): boolean => Object.keys(errors).length > 0;

/**
 * Legal status moves. Archiving is a shelf rather than a bin, and coming off
 * the shelf lands in draft: a story that was archived should not spring back
 * onto the public site because someone clicked the wrong control.
 */
const TRANSITIONS: Record<StoryStatus, StoryStatus[]> = {
  [StoryStatus.DRAFT]: [StoryStatus.PUBLISHED, StoryStatus.ARCHIVED],
  [StoryStatus.PUBLISHED]: [StoryStatus.DRAFT, StoryStatus.ARCHIVED, StoryStatus.PUBLISHED],
  [StoryStatus.ARCHIVED]: [StoryStatus.DRAFT],
};

export function canTransition(from: StoryStatus, to: StoryStatus): boolean {
  return TRANSITIONS[from].includes(to);
}
