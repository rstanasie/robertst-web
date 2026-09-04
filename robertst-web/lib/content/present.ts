import { StoryAccess } from "@prisma/client";

import type { Viewer } from "@/lib/access/viewer";
import type { ActiveCollection, CollectionStory } from "./collection";
import type { StoryChip, VaseStoryChip, WeekView } from "./view";

/**
 * Projects the active collection down to what the browser is allowed to know.
 *
 * Pure — no database, no request — so it is safe to unit test and has no way to
 * widen access by accident.
 */

const chip = (story: CollectionStory, viewer: Viewer): StoryChip => ({
  slug: story.slug,
  title: story.title,
  teaser: story.excerpt,
  access: story.access === StoryAccess.LOCKED ? "locked" : "preview",
  unlocked: viewer.isSubscriber,
});

export function buildWeekView(collection: ActiveCollection | null, viewer: Viewer): WeekView {
  if (!collection) {
    return { week: "", onVase: [], offVase: [], isSubscriber: viewer.isSubscriber };
  }

  const onVase: VaseStoryChip[] = collection.stories
    .filter((story) => story.angle !== null && story.amphoraSlot !== null)
    .map((story) => ({
      ...chip(story, viewer),
      slot: story.amphoraSlot as number,
      angle: story.angle as number,
    }))
    .sort((a, b) => a.slot - b.slot);

  return {
    week: collection.name,
    onVase,
    offVase: collection.stories.filter((story) => story.angle === null).map((story) => chip(story, viewer)),
    isSubscriber: viewer.isSubscriber,
  };
}
