import "server-only";

import { StoryStatus } from "@prisma/client";
import type { StoryAccess } from "@prisma/client";

import { prisma } from "@/lib/db";
import { VASE_SLOTS, angleForSlot } from "./vase";

/**
 * The collection the site is currently presenting — "this week's amphora".
 *
 * A collection may hold any number of stories. Only the ones given an
 * `amphoraSlot` are painted on the vessel, and the vessel's capacity is a
 * property of the 3D model (VASE_SLOTS), not of the content system. Everything
 * else in the collection is still part of the week; it simply is not on the pot.
 *
 * Unpublished members are skipped here rather than filtered by the caller, so
 * there is no path by which a draft reaches the homepage.
 */

export type CollectionStory = {
  storyId: string;
  slug: string;
  title: string;
  excerpt: string;
  access: StoryAccess;
  position: number;
  amphoraSlot: number | null;
  /** Degrees of rotation, or null when the story is not painted. */
  angle: number | null;
  featuredImageUrl: string | null;
};

export type ActiveCollection = {
  id: string;
  slug: string;
  name: string;
  publishedAt: Date | null;
  stories: CollectionStory[];
};

export async function getActiveCollection(): Promise<ActiveCollection | null> {
  const collection = await prisma.collection.findFirst({
    where: { active: true },
    orderBy: { publishedAt: "desc" },
    select: {
      id: true,
      slug: true,
      name: true,
      publishedAt: true,
      entries: {
        orderBy: { position: "asc" },
        select: {
          position: true,
          access: true,
          amphoraSlot: true,
          story: {
            select: {
              id: true,
              slug: true,
              status: true,
              publishedRevisionId: true,
              publishedRevision: {
                select: { title: true, excerpt: true, featuredImage: { select: { url: true } } },
              },
            },
          },
        },
      },
    },
  });

  if (!collection) {
    return null;
  }

  const stories = collection.entries.flatMap<CollectionStory>((entry) => {
    const { story } = entry;

    if (story.status !== StoryStatus.PUBLISHED || !story.publishedRevision) {
      return [];
    }

    const slot =
      entry.amphoraSlot !== null && entry.amphoraSlot >= 0 && entry.amphoraSlot < VASE_SLOTS
        ? entry.amphoraSlot
        : null;

    return [
      {
        storyId: story.id,
        slug: story.slug,
        title: story.publishedRevision.title,
        excerpt: story.publishedRevision.excerpt,
        access: entry.access,
        position: entry.position,
        amphoraSlot: slot,
        angle: slot === null ? null : angleForSlot(slot),
        featuredImageUrl: story.publishedRevision.featuredImage?.url ?? null,
      },
    ];
  });

  return {
    id: collection.id,
    slug: collection.slug,
    name: collection.name,
    publishedAt: collection.publishedAt,
    stories,
  };
}
