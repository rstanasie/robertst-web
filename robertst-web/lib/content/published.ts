import "server-only";

import { StoryAccess, StoryStatus } from "@prisma/client";

import { prisma } from "@/lib/db";
import type { MediaRef } from "@/lib/cms/stories";

/**
 * The public read model.
 *
 * Every query here filters on `status: PUBLISHED` *and* reads content out of
 * `publishedRevision` rather than off the story row. Both matter: the status
 * check keeps drafts off the site, and reading the snapshot keeps unpublished
 * edits off it too.
 *
 * Preview mode is the single exception, and it goes through `getDraftStory`,
 * which is only ever called after an authenticated draft-mode check.
 */

export type PublicStory = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  excerpt: string;
  content: string;
  previewUntil: string | null;
  /** Public telling number: 1 the first time it was published, 2 after a revise. */
  version: number;
  publishedAt: Date | null;
  updatedAt: Date;
  seoTitle: string | null;
  seoDescription: string | null;
  featuredImage: MediaRef | null;
  ogImage: MediaRef | null;
};

const mediaSelect = { id: true, url: true, alt: true, width: true, height: true } as const;

const storySelect = {
  id: true,
  slug: true,
  publishedVersion: true,
  publishedAt: true,
  updatedAt: true,
  publishedRevision: {
    select: {
      title: true,
      subtitle: true,
      excerpt: true,
      content: true,
      previewUntil: true,
      seoTitle: true,
      seoDescription: true,
      featuredImage: { select: mediaSelect },
      ogImage: { select: mediaSelect },
    },
  },
} as const;

type PublishedRow = {
  id: string;
  slug: string;
  publishedVersion: number;
  publishedAt: Date | null;
  updatedAt: Date;
  publishedRevision: {
    title: string;
    subtitle: string | null;
    excerpt: string;
    content: string;
    previewUntil: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    featuredImage: MediaRef | null;
    ogImage: MediaRef | null;
  } | null;
};

function fromRow(row: PublishedRow): PublicStory | null {
  // A PUBLISHED story with no snapshot should be impossible; if a bug ever
  // makes one, the reader gets a 404 rather than an empty page.
  if (!row.publishedRevision) {
    return null;
  }

  return {
    id: row.id,
    slug: row.slug,
    version: row.publishedVersion,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
    ...row.publishedRevision,
  };
}

export async function getPublishedStory(slug: string): Promise<PublicStory | null> {
  const row = await prisma.story.findFirst({
    where: { slug, status: StoryStatus.PUBLISHED, NOT: { publishedRevisionId: null } },
    select: storySelect,
  });

  return row ? fromRow(row) : null;
}

export async function listPublishedSlugs(): Promise<{ slug: string; updatedAt: Date }[]> {
  return prisma.story.findMany({
    where: { status: StoryStatus.PUBLISHED, NOT: { publishedRevisionId: null } },
    select: { slug: true, updatedAt: true },
    orderBy: { publishedAt: "desc" },
  });
}

/**
 * The working draft, for preview mode only.
 *
 * Reads the Story row rather than the published snapshot, which is the whole
 * point: this is what publishing *would* show. Callers must already have
 * established that the request is an authenticated preview.
 */
export type DraftStory = PublicStory & { status: StoryStatus };

export async function getDraftStory(slug: string): Promise<DraftStory | null> {
  const row = await prisma.story.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      status: true,
      title: true,
      subtitle: true,
      excerpt: true,
      content: true,
      previewUntil: true,
      publishedVersion: true,
      publishedAt: true,
      updatedAt: true,
      seoTitle: true,
      seoDescription: true,
      featuredImage: { select: mediaSelect },
      ogImage: { select: mediaSelect },
    },
  });

  if (!row) {
    return null;
  }

  return { ...row, version: row.publishedVersion + 1 };
}

/**
 * How much of a story a free reader gets.
 *
 * Access belongs to a collection entry, not to the story, so a story outside
 * the active collection falls back to the terms it last carried. A story that
 * has never been in a collection is a preview — the same deal a new myth gets —
 * rather than locked, so a shared link is never a dead end.
 */
export async function accessForStory(storyId: string): Promise<StoryAccess> {
  const active = await prisma.collectionEntry.findFirst({
    where: { storyId, collection: { active: true } },
    select: { access: true },
  });

  if (active) {
    return active.access;
  }

  const last = await prisma.collectionEntry.findFirst({
    where: { storyId },
    orderBy: { collection: { publishedAt: "desc" } },
    select: { access: true },
  });

  return last?.access ?? StoryAccess.PREVIEW;
}
