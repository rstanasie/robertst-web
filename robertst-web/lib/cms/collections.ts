import "server-only";

import { StoryAccess, StoryStatus } from "@prisma/client";

import { prisma } from "@/lib/db";
import { VASE_SLOTS } from "@/lib/content/vase";
import { fail, ok } from "./errors";
import type { ActionResult } from "./errors";
import { slugify, uniqueSlug } from "./slug";

/**
 * Curating what the site presents.
 *
 * The amphora's five painted panels are a fact about the 3D model, not about
 * the content system: a collection holds as many stories as it likes and any
 * of them may be given one of the VASE_SLOTS positions. Nothing here assumes a
 * week, a count, or a schedule.
 */

export type CollectionEntryRow = {
  id: string;
  storyId: string;
  title: string;
  slug: string;
  status: StoryStatus;
  access: StoryAccess;
  position: number;
  amphoraSlot: number | null;
};

export type CollectionRow = {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  publishedAt: Date | null;
  entries: CollectionEntryRow[];
};

const entrySelect = {
  id: true,
  storyId: true,
  access: true,
  position: true,
  amphoraSlot: true,
  story: { select: { title: true, slug: true, status: true } },
} as const;

type EntryRow = {
  id: string;
  storyId: string;
  access: StoryAccess;
  position: number;
  amphoraSlot: number | null;
  story: { title: string; slug: string; status: StoryStatus };
};

const toEntry = (entry: EntryRow): CollectionEntryRow => ({
  id: entry.id,
  storyId: entry.storyId,
  title: entry.story.title,
  slug: entry.story.slug,
  status: entry.story.status,
  access: entry.access,
  position: entry.position,
  amphoraSlot: entry.amphoraSlot,
});

export async function listCollections(): Promise<CollectionRow[]> {
  const rows = await prisma.collection.findMany({
    orderBy: [{ active: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      active: true,
      publishedAt: true,
      entries: { orderBy: { position: "asc" }, select: entrySelect },
    },
  });

  return rows.map((row) => ({ ...row, entries: row.entries.map(toEntry) }));
}

export async function getCollection(id: string): Promise<CollectionRow | null> {
  const row = await prisma.collection.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      name: true,
      active: true,
      publishedAt: true,
      entries: { orderBy: { position: "asc" }, select: entrySelect },
    },
  });

  return row ? { ...row, entries: row.entries.map(toEntry) } : null;
}

export async function createCollection(name: string): Promise<ActionResult<{ id: string }>> {
  const trimmed = name.trim();

  if (!trimmed) {
    return fail("invalid", "A collection needs a name.", { name: "A name is required." });
  }

  const taken = new Set(
    (await prisma.collection.findMany({ select: { slug: true } })).map((row) => row.slug),
  );

  const created = await prisma.collection.create({
    data: { name: trimmed.slice(0, 120), slug: uniqueSlug(slugify(trimmed), taken) },
    select: { id: true },
  });

  return ok(created);
}

/**
 * Exactly one collection is presented at a time. Prisma cannot express "at most
 * one row where active" as a constraint, so activation clears the others inside
 * the same transaction — the invariant is enforced here, in one place.
 */
export async function activateCollection(id: string): Promise<ActionResult<void>> {
  const exists = await prisma.collection.findUnique({ where: { id }, select: { id: true } });

  if (!exists) {
    return fail("not-found", "That collection no longer exists.");
  }

  await prisma.$transaction([
    prisma.collection.updateMany({ where: { NOT: { id } }, data: { active: false } }),
    prisma.collection.update({
      where: { id },
      data: { active: true, publishedAt: new Date() },
    }),
  ]);

  return ok(undefined);
}

export async function addStory(
  collectionId: string,
  storyId: string,
): Promise<ActionResult<{ entryId: string }>> {
  const [collection, story, last] = await Promise.all([
    prisma.collection.findUnique({ where: { id: collectionId }, select: { id: true } }),
    prisma.story.findUnique({ where: { id: storyId }, select: { id: true } }),
    prisma.collectionEntry.findFirst({
      where: { collectionId },
      orderBy: { position: "desc" },
      select: { position: true },
    }),
  ]);

  if (!collection || !story) {
    return fail("not-found", "That story or collection no longer exists.");
  }

  const already = await prisma.collectionEntry.findUnique({
    where: { collectionId_storyId: { collectionId, storyId } },
    select: { id: true },
  });

  if (already) {
    return fail("conflict", "That story is already in this collection.");
  }

  const entry = await prisma.collectionEntry.create({
    data: { collectionId, storyId, position: (last?.position ?? -1) + 1 },
    select: { id: true },
  });

  return ok({ entryId: entry.id });
}

export async function removeEntry(entryId: string): Promise<ActionResult<void>> {
  const deleted = await prisma.collectionEntry.deleteMany({ where: { id: entryId } });
  return deleted.count > 0 ? ok(undefined) : fail("not-found", "That entry no longer exists.");
}

export async function setEntryAccess(
  entryId: string,
  access: StoryAccess,
): Promise<ActionResult<void>> {
  const updated = await prisma.collectionEntry.updateMany({ where: { id: entryId }, data: { access } });
  return updated.count > 0 ? ok(undefined) : fail("not-found", "That entry no longer exists.");
}

/**
 * Put a story on a painted panel, or take it off.
 *
 * Two entries cannot share a slot — the database says so — so claiming an
 * occupied one swaps the two rather than failing. The occupant is cleared first
 * because the unique index is checked per statement, not at commit.
 */
export async function setEntrySlot(
  entryId: string,
  slot: number | null,
): Promise<ActionResult<void>> {
  if (slot !== null && (!Number.isInteger(slot) || slot < 0 || slot >= VASE_SLOTS)) {
    return fail("invalid", `The amphora has ${VASE_SLOTS} panels, numbered 0 to ${VASE_SLOTS - 1}.`);
  }

  return prisma.$transaction(async (tx) => {
    const entry = await tx.collectionEntry.findUnique({
      where: { id: entryId },
      select: { id: true, collectionId: true, amphoraSlot: true },
    });

    if (!entry) {
      return fail<void>("not-found", "That entry no longer exists.");
    }

    if (slot !== null) {
      const occupant = await tx.collectionEntry.findFirst({
        where: { collectionId: entry.collectionId, amphoraSlot: slot, NOT: { id: entryId } },
        select: { id: true },
      });

      if (occupant) {
        await tx.collectionEntry.update({ where: { id: occupant.id }, data: { amphoraSlot: null } });
        await tx.collectionEntry.update({ where: { id: entryId }, data: { amphoraSlot: slot } });
        await tx.collectionEntry.update({
          where: { id: occupant.id },
          data: { amphoraSlot: entry.amphoraSlot },
        });
        return ok<void>(undefined);
      }
    }

    await tx.collectionEntry.update({ where: { id: entryId }, data: { amphoraSlot: slot } });
    return ok<void>(undefined);
  });
}

/** Reorder by swapping with the neighbour, which keeps positions contiguous. */
export async function moveEntry(entryId: string, direction: -1 | 1): Promise<ActionResult<void>> {
  return prisma.$transaction(async (tx) => {
    const entry = await tx.collectionEntry.findUnique({
      where: { id: entryId },
      select: { id: true, collectionId: true, position: true },
    });

    if (!entry) {
      return fail<void>("not-found", "That entry no longer exists.");
    }

    const neighbour = await tx.collectionEntry.findFirst({
      where: {
        collectionId: entry.collectionId,
        position: direction < 0 ? { lt: entry.position } : { gt: entry.position },
      },
      orderBy: { position: direction < 0 ? "desc" : "asc" },
      select: { id: true, position: true },
    });

    if (!neighbour) {
      return ok<void>(undefined);
    }

    // Park at a position no row can hold, so the unique index never sees a clash.
    await tx.collectionEntry.update({ where: { id: entry.id }, data: { position: -1 } });
    await tx.collectionEntry.update({ where: { id: neighbour.id }, data: { position: entry.position } });
    await tx.collectionEntry.update({ where: { id: entry.id }, data: { position: neighbour.position } });

    return ok<void>(undefined);
  });
}
