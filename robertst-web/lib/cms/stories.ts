import "server-only";

import { Prisma, RevisionKind, StoryStatus } from "@prisma/client";

import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import { fail, ok } from "./errors";
import type { ActionResult } from "./errors";
import {
  CONTENT_FIELDS,
  canTransition,
  hasErrors,
  validateDraft,
  validatePublish,
} from "./validation";
import type { StoryInput, StorySnapshot } from "./validation";
import { slugify, uniqueSlug } from "./slug";

/**
 * Everything that changes a story.
 *
 * The rules that live here rather than in the UI:
 *
 *   - A Story row is the working draft. `publishedRevisionId` is what readers
 *     get, so editing a live story changes nothing publicly until it is
 *     published again.
 *   - Revisions are append-only. Restoring revision 1 writes revision 4.
 *   - Every write is guarded by `lockVersion`, so an editor that loaded the
 *     story before someone else's save cannot overwrite it silently.
 */

export type MediaRef = {
  id: string;
  url: string;
  alt: string;
  width: number | null;
  height: number | null;
};

const mediaSelect = { id: true, url: true, alt: true, width: true, height: true } as const;

/**
 * A revision is a snapshot of exactly the fields listed in CONTENT_FIELDS —
 * and so is a write to the story row. Both go through here rather than
 * spreading the caller's object, so an input carrying extra keys writes the
 * story's fields and nothing else.
 */
const snapshot = (input: StorySnapshot): StorySnapshot =>
  Object.fromEntries(CONTENT_FIELDS.map((key) => [key, input[key]])) as StorySnapshot;

export const sameContent = (a: StorySnapshot, b: StorySnapshot): boolean =>
  CONTENT_FIELDS.every((key) => (a[key] ?? null) === (b[key] ?? null));

// ── Reading ────────────────────────────────────────────────────────────────

export type StoryFilter = "all" | "draft" | "published" | "archived";

const STATUS_FOR: Record<Exclude<StoryFilter, "all">, StoryStatus> = {
  draft: StoryStatus.DRAFT,
  published: StoryStatus.PUBLISHED,
  archived: StoryStatus.ARCHIVED,
};

export type StorySummary = {
  id: string;
  slug: string;
  title: string;
  status: StoryStatus;
  updatedAt: Date;
  publishedAt: Date | null;
  revisionCount: number;
  hasUnpublishedChanges: boolean;
  inActiveCollection: boolean;
  updatedBy: string | null;
};

export async function listStories(filter: StoryFilter = "all"): Promise<StorySummary[]> {
  const rows = await prisma.story.findMany({
    where: filter === "all" ? {} : { status: STATUS_FOR[filter] },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      subtitle: true,
      excerpt: true,
      content: true,
      previewUntil: true,
      seoTitle: true,
      seoDescription: true,
      featuredImageId: true,
      ogImageId: true,
      status: true,
      updatedAt: true,
      publishedAt: true,
      revisionCounter: true,
      updatedBy: { select: { name: true, email: true } },
      publishedRevision: { select: revisionSnapshotSelect },
      entries: { where: { collection: { active: true } }, select: { id: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    status: row.status,
    updatedAt: row.updatedAt,
    publishedAt: row.publishedAt,
    revisionCount: row.revisionCounter,
    hasUnpublishedChanges:
      row.status === StoryStatus.PUBLISHED &&
      row.publishedRevision !== null &&
      !sameContent(snapshot(row), row.publishedRevision),
    inActiveCollection: row.entries.length > 0,
    updatedBy: row.updatedBy?.name ?? row.updatedBy?.email ?? null,
  }));
}

const revisionSnapshotSelect = {
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
} as const;

export type EditorStory = StoryInput & {
  id: string;
  status: StoryStatus;
  lockVersion: number;
  publishedVersion: number;
  revisionCount: number;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
  unpublishedAt: Date | null;
  publishedRevisionId: string | null;
  hasUnpublishedChanges: boolean;
  featuredImage: MediaRef | null;
  ogImage: MediaRef | null;
  updatedBy: string | null;
};

export async function getStoryForEditor(id: string): Promise<EditorStory | null> {
  const row = await prisma.story.findUnique({
    where: { id },
    include: {
      featuredImage: { select: mediaSelect },
      ogImage: { select: mediaSelect },
      updatedBy: { select: { name: true, email: true } },
      publishedRevision: { select: revisionSnapshotSelect },
    },
  });

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    excerpt: row.excerpt,
    content: row.content,
    previewUntil: row.previewUntil,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    featuredImageId: row.featuredImageId,
    ogImageId: row.ogImageId,
    status: row.status,
    lockVersion: row.lockVersion,
    publishedVersion: row.publishedVersion,
    revisionCount: row.revisionCounter,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    publishedAt: row.publishedAt,
    unpublishedAt: row.unpublishedAt,
    publishedRevisionId: row.publishedRevisionId,
    hasUnpublishedChanges:
      row.publishedRevision !== null && !sameContent(snapshot(row), row.publishedRevision),
    featuredImage: row.featuredImage,
    ogImage: row.ogImage,
    updatedBy: row.updatedBy?.name ?? row.updatedBy?.email ?? null,
  };
}

// ── Writing ────────────────────────────────────────────────────────────────

const SLUG_TAKEN = "That slug is already used by another story.";

/**
 * Prisma's unique-constraint violation, narrowed to the slug index.
 *
 * Two shapes have to be accepted. Prisma's own engine reports the offending
 * columns in `meta.target`; a driver adapter (which is how Prisma 7 connects)
 * reports the raw Postgres error instead, with the index name buried in
 * `meta.driverAdapterError`. Checking only the first shape silently turns a
 * duplicate slug into a 500 instead of a field error.
 */
function isSlugCollision(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }

  const meta = error.meta as { target?: unknown; driverAdapterError?: unknown } | undefined;
  const target = Array.isArray(meta?.target) ? meta.target.join(",") : String(meta?.target ?? "");
  const adapter = meta?.driverAdapterError ? JSON.stringify(meta.driverAdapterError) : "";

  return `${target} ${adapter}`.toLowerCase().includes("slug");
}

export async function createStory(
  user: SessionUser,
  title: string,
): Promise<ActionResult<{ id: string; slug: string }>> {
  const trimmed = title.trim();

  if (!trimmed) {
    return fail("invalid", "A title is required.", { title: "A title is required." });
  }

  const taken = new Set(
    (await prisma.story.findMany({ select: { slug: true } })).map((row) => row.slug),
  );

  const input: StoryInput = {
    title: trimmed.slice(0, 200),
    slug: uniqueSlug(slugify(trimmed), taken),
    subtitle: null,
    excerpt: "",
    content: "",
    previewUntil: null,
    seoTitle: null,
    seoDescription: null,
    featuredImageId: null,
    ogImageId: null,
  };

  const errors = validateDraft(input);
  if (hasErrors(errors)) {
    return fail("invalid", "That title cannot be turned into a story.", errors);
  }

  try {
    const story = await prisma.$transaction(async (tx) => {
      const created = await tx.story.create({
        data: {
          ...snapshot(input),
          status: StoryStatus.DRAFT,
          revisionCounter: 1,
          createdById: user.id,
          updatedById: user.id,
        },
      });

      await tx.storyRevision.create({
        data: {
          ...snapshot(input),
          storyId: created.id,
          number: 1,
          kind: RevisionKind.CREATED,
          authorId: user.id,
        },
      });

      return created;
    });

    return ok({ id: story.id, slug: story.slug });
  } catch (error) {
    if (isSlugCollision(error)) {
      return fail("conflict", SLUG_TAKEN, { slug: SLUG_TAKEN });
    }
    throw error;
  }
}

export type SaveOutcome = {
  lockVersion: number;
  revisionCreated: boolean;
  revisionNumber: number | null;
  slugChanged: boolean;
};

/**
 * Save the working draft.
 *
 * A revision is written only when something actually changed against the last
 * one. Pressing save twice on an untouched story is not an editorial event and
 * should not push a real revision off the top of the history.
 */
export async function saveDraft(
  user: SessionUser,
  storyId: string,
  input: StoryInput,
  lockVersion: number,
): Promise<ActionResult<SaveOutcome>> {
  const errors = validateDraft(input);
  if (hasErrors(errors)) {
    return fail("invalid", "Fix the highlighted fields.", errors);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.story.findUnique({
        where: { id: storyId },
        select: { id: true, slug: true, status: true, lockVersion: true, revisionCounter: true },
      });

      if (!current) {
        return fail<SaveOutcome>("not-found", "That story no longer exists.");
      }

      if (current.lockVersion !== lockVersion) {
        return fail<SaveOutcome>(
          "stale",
          "This story was changed elsewhere after you opened it. Reload to see the newer version — saving now would overwrite it.",
        );
      }

      const latest = await tx.storyRevision.findFirst({
        where: { storyId },
        orderBy: { number: "desc" },
        select: revisionSnapshotSelect,
      });

      const changed = latest === null || !sameContent(snapshot(input), latest);
      const nextNumber = current.revisionCounter + 1;

      await tx.story.update({
        where: { id: storyId },
        data: {
          ...snapshot(input),
          lockVersion: { increment: 1 },
          updatedById: user.id,
          ...(changed ? { revisionCounter: nextNumber } : {}),
        },
      });

      if (changed) {
        await tx.storyRevision.create({
          data: {
            ...snapshot(input),
            storyId,
            number: nextNumber,
            kind: RevisionKind.DRAFT_SAVE,
            authorId: user.id,
          },
        });
      }

      return ok<SaveOutcome>({
        lockVersion: lockVersion + 1,
        revisionCreated: changed,
        revisionNumber: changed ? nextNumber : null,
        slugChanged: current.slug !== input.slug,
      });
    });
  } catch (error) {
    if (isSlugCollision(error)) {
      return fail("conflict", SLUG_TAKEN, { slug: SLUG_TAKEN });
    }
    throw error;
  }
}

export type PublishOutcome = {
  lockVersion: number;
  revisionNumber: number;
  publishedVersion: number;
  slug: string;
};

/**
 * Save and publish in one act.
 *
 * Deliberately one operation rather than save-then-publish: publishing is a
 * single editorial decision, and it should leave a single revision in the
 * history saying so.
 */
export async function publishStory(
  user: SessionUser,
  storyId: string,
  input: StoryInput,
  lockVersion: number,
): Promise<ActionResult<PublishOutcome>> {
  const errors = validatePublish(input);
  if (hasErrors(errors)) {
    return fail("invalid", "This story is not ready to publish.", errors);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.story.findUnique({
        where: { id: storyId },
        select: {
          lockVersion: true,
          status: true,
          revisionCounter: true,
          publishedVersion: true,
          publishedAt: true,
        },
      });

      if (!current) {
        return fail<PublishOutcome>("not-found", "That story no longer exists.");
      }

      if (current.lockVersion !== lockVersion) {
        return fail<PublishOutcome>(
          "stale",
          "This story was changed elsewhere after you opened it. Reload before publishing.",
        );
      }

      if (!canTransition(current.status, StoryStatus.PUBLISHED)) {
        return fail<PublishOutcome>(
          "invalid",
          "An archived story has to be returned to draft before it can be published.",
        );
      }

      const number = current.revisionCounter + 1;

      const revision = await tx.storyRevision.create({
        data: {
          ...snapshot(input),
          storyId,
          number,
          kind: RevisionKind.PUBLISH,
          authorId: user.id,
        },
      });

      const publishedVersion = current.publishedVersion + 1;

      await tx.story.update({
        where: { id: storyId },
        data: {
          ...snapshot(input),
          status: StoryStatus.PUBLISHED,
          publishedRevisionId: revision.id,
          publishedVersion,
          revisionCounter: number,
          lockVersion: { increment: 1 },
          updatedById: user.id,
          // First publish stamps publishedAt; later ones leave it, so the page
          // can keep saying when the story first appeared.
          ...(current.publishedAt ? {} : { publishedAt: new Date() }),
          unpublishedAt: null,
        },
      });

      return ok<PublishOutcome>({
        lockVersion: lockVersion + 1,
        revisionNumber: number,
        publishedVersion,
        slug: input.slug,
      });
    });
  } catch (error) {
    if (isSlugCollision(error)) {
      return fail("conflict", SLUG_TAKEN, { slug: SLUG_TAKEN });
    }
    throw error;
  }
}

/**
 * Take a story off the public site without losing anything.
 *
 * The draft, every revision and the record of what was live all survive; only
 * the pointer readers follow is cleared.
 */
export async function setStatus(
  user: SessionUser,
  storyId: string,
  to: StoryStatus,
): Promise<ActionResult<{ status: StoryStatus }>> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.story.findUnique({
      where: { id: storyId },
      select: { status: true, revisionCounter: true, ...revisionSnapshotSelect },
    });

    if (!current) {
      return fail<{ status: StoryStatus }>("not-found", "That story no longer exists.");
    }

    if (current.status === to) {
      return ok({ status: to });
    }

    if (!canTransition(current.status, to)) {
      return fail<{ status: StoryStatus }>(
        "invalid",
        `A ${current.status.toLowerCase()} story cannot become ${to.toLowerCase()}.`,
      );
    }

    const leavingPublic = current.status === StoryStatus.PUBLISHED;
    const number = current.revisionCounter + 1;

    if (leavingPublic) {
      // The unpublish itself is part of the history: without a marker the
      // revision list would show a publish and then, inexplicably, nothing live.
      await tx.storyRevision.create({
        data: {
          ...snapshot(current),
          storyId,
          number,
          kind: RevisionKind.UNPUBLISH,
          authorId: user.id,
        },
      });
    }

    await tx.story.update({
      where: { id: storyId },
      data: {
        status: to,
        updatedById: user.id,
        lockVersion: { increment: 1 },
        ...(leavingPublic
          ? {
              publishedRevisionId: null,
              unpublishedAt: new Date(),
              revisionCounter: number,
            }
          : {}),
      },
    });

    return ok({ status: to });
  });
}
