import type { Viewer } from "@/lib/access/viewer";

import type { StoryChip, VaseStoryChip, WeekView } from "./view";
import type { ActiveWeek, WeekStory } from "./week";
import { angleForSlot, onVase } from "./vase";

/**
 * Projects a hydrated week down to what the browser is allowed to know.
 *
 * Pure — no filesystem, no request — so it is safe to unit test and impossible
 * for it to widen access by accident.
 */

const chip = (item: WeekStory, viewer: Viewer): StoryChip => ({
  slug: item.entry.mythSlug,
  title: item.myth.title,
  teaser: item.story.teaser,
  drawing: item.story.drawing,
  access: item.entry.access,
  unlocked: viewer.isSubscriber,
});

export function buildWeekView(week: ActiveWeek, viewer: Viewer): WeekView {
  const vase: VaseStoryChip[] = week.stories
    .filter((item) => onVase(item.entry))
    .map((item) => {
      const slot = item.entry.vaseSlot as number;
      return { ...chip(item, viewer), slot, angle: angleForSlot(slot) };
    })
    .sort((a, b) => a.slot - b.slot);

  return {
    week: week.collection.week,
    onVase: vase,
    offVase: week.stories.filter((item) => !onVase(item.entry)).map((item) => chip(item, viewer)),
    isSubscriber: viewer.isSubscriber,
  };
}
