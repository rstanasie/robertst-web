import "server-only";

import { RevisionKind } from "@prisma/client";

import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import { fail, ok } from "./errors";
import type { ActionResult } from "./errors";

/**
 * The history. Nothing in this module updates or deletes a revision.
 *
 * One invariant holds everything together: **the working draft always equals
 * the newest revision**, because every write path — create, save, publish,
 * unpublish, restore — appends one. That is what makes restoring safe to offer
 * without a "you will lose your current draft" caveat: the current draft is
 * already in the history, one row above the one being restored.
 */

export type RevisionSummary = {
  id: string;
  number: number;
  kind: RevisionKind;
  title: string;
  slug: string;
  createdAt: Date;
  author: string | null;
  note: string | null;
  restoredFromNumber: number | null;
  /** True for the revision the public is currently reading. */
  isLive: boolean;
  /** True for the newest one, which is what the editor is showing. */
  isCurrent: boolean;
  characters: number;
};

export type RevisionDetail = RevisionSummary & {
  subtitle: string | null;
  excerpt: string;
  content: string;
  previewUntil: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  featuredImageId: string | null;
  ogImageId: string | null;
};

const listSelect = {
  id: true,
  number: true,
  kind: true,
  title: true,
  slug: true,
  content: true,
  createdAt: true,
  note: true,
  author: { select: { name: true, email: true } },
  restoredFrom: { select: { number: true } },
} as const;

type ListRow = {
  id: string;
  number: number;
  kind: RevisionKind;
  title: string;
  slug: string;
  content: string;
  createdAt: Date;
  note: string | null;
  author: { name: string | null; email: string } | null;
  restoredFrom: { number: number } | null;
};

const toSummary = (row: ListRow, liveId: string | null, newest: number): RevisionSummary => ({
  id: row.id,
  number: row.number,
  kind: row.kind,
  title: row.title,
  slug: row.slug,
  createdAt: row.createdAt,
  author: row.author?.name ?? row.author?.email ?? null,
  note: row.note,
  restoredFromNumber: row.restoredFrom?.number ?? null,
  isLive: row.id === liveId,
  isCurrent: row.number === newest,
  characters: row.content.length,
});

export async function listRevisions(storyId: string): Promise<RevisionSummary[]> {
  const [story, rows] = await Promise.all([
    prisma.story.findUnique({
      where: { id: storyId },
      select: { publishedRevisionId: true, revisionCounter: true },
    }),
    prisma.storyRevision.findMany({
      where: { storyId },
      orderBy: { number: "desc" },
      select: listSelect,
    }),
  ]);

  if (!story) {
    return [];
  }

  return rows.map((row) => toSummary(row, story.publishedRevisionId, story.revisionCounter));
}

export async function getRevision(
  storyId: string,
  revisionId: string,
): Promise<RevisionDetail | null> {
  const [story, row] = await Promise.all([
    prisma.story.findUnique({
      where: { id: storyId },
      select: { publishedRevisionId: true, revisionCounter: true },
    }),
    prisma.storyRevision.findFirst({
      where: { id: revisionId, storyId },
      select: {
        ...listSelect,
        subtitle: true,
        excerpt: true,
        previewUntil: true,
        seoTitle: true,
        seoDescription: true,
        featuredImageId: true,
        ogImageId: true,
      },
    }),
  ]);

  if (!story || !row) {
    return null;
  }

  return {
    ...toSummary(row, story.publishedRevisionId, story.revisionCounter),
    subtitle: row.subtitle,
    excerpt: row.excerpt,
    content: row.content,
    previewUntil: row.previewUntil,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    featuredImageId: row.featuredImageId,
    ogImageId: row.ogImageId,
  };
}

export type RestoreOutcome = {
  revisionNumber: number;
  restoredFrom: number;
  slugChanged: boolean;
};

/**
 * Restore an older revision into the working draft.
 *
 * This never rewinds: the restored content is written as a *new* revision, so
 * revisions 1, 2, 3 followed by a restore of 1 leaves 1, 2, 3, 4 — and 4 says
 * where it came from. Nothing is published as a side effect; a restored draft
 * still has to be published to reach readers.
 */
export async function restoreRevision(
  user: SessionUser,
  storyId: string,
  revisionId: string,
  lockVersion: number,
): Promise<ActionResult<RestoreOutcome>> {
  return prisma.$transaction(async (tx) => {
    const [story, source] = await Promise.all([
      tx.story.findUnique({
        where: { id: storyId },
        select: { lockVersion: true, revisionCounter: true, slug: true },
      }),
      tx.storyRevision.findFirst({
        where: { id: revisionId, storyId },
        select: {
          number: true,
          title: true,
          slug: true,
          subtitle: true,
          excerpt: true,
          content: true,
          previewUntil: true,
          seoTitle: true,
          seoDescription: true,
          featuredImageId: true,
          ogImageId: true,
        },
      }),
    ]);

    if (!story || !source) {
      return fail<RestoreOutcome>("not-found", "That revision no longer exists.");
    }

    if (story.lockVersion !== lockVersion) {
      return fail<RestoreOutcome>(
        "stale",
        "This story changed after you opened the history. Reload and try again.",
      );
    }

    const { number: sourceNumber, ...content } = source;
    const number = story.revisionCounter + 1;

    // The restored slug could collide with another story's; letting Prisma's
    // unique index decide keeps one rule in one place.
    const taken = await tx.story.findFirst({
      where: { slug: content.slug, NOT: { id: storyId } },
      select: { id: true },
    });

    const slug = taken ? story.slug : content.slug;

    await tx.storyRevision.create({
      data: {
        ...content,
        slug,
        storyId,
        number,
        kind: RevisionKind.RESTORE,
        note: `Restored from revision ${sourceNumber}`,
        restoredFromId: revisionId,
        authorId: user.id,
      },
    });

    await tx.story.update({
      where: { id: storyId },
      data: {
        ...content,
        slug,
        revisionCounter: number,
        lockVersion: { increment: 1 },
        updatedById: user.id,
      },
    });

    return ok<RestoreOutcome>({
      revisionNumber: number,
      restoredFrom: sourceNumber,
      slugChanged: slug !== story.slug,
    });
  });
}
