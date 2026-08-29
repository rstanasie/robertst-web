import "server-only";

import { loadActiveWeek, loadMyth, loadVersion } from "./source";
import { PREVIEW_STORIES_PER_WEEK, angleForSlot, onVase } from "./vase";
import type { Myth, MythSlug, StoryVersion, WeekEntry, WeeklyCollection } from "./types";

export type WeekStory = {
  entry: WeekEntry;
  myth: Myth;
  story: StoryVersion;
};

export type ActiveWeek = {
  collection: WeeklyCollection;
  stories: WeekStory[];
};

/** The week plus every story in it, hydrated. Server-side only. */
export function getActiveWeek(now?: Date): ActiveWeek {
  const collection = loadActiveWeek(now);
  const stories = collection.entries.map((entry) => ({
    entry,
    myth: loadMyth(entry.mythSlug),
    story: loadVersion(entry.mythSlug, entry.version),
  }));
  return { collection, stories };
}

export function findInWeek(week: ActiveWeek, slug: MythSlug): WeekStory | undefined {
  return week.stories.find((item) => item.entry.mythSlug === slug);
}

/** Stories painted on the vessel, in slot order. */
export function vaseStories(week: ActiveWeek): (WeekStory & { slot: number; angle: number })[] {
  return week.stories
    .filter((item) => onVase(item.entry))
    .map((item) => ({ ...item, slot: item.entry.vaseSlot as number, angle: angleForSlot(item.entry.vaseSlot as number) }))
    .sort((a, b) => a.slot - b.slot);
}

/** Stories the week carries but the vessel has no slot for. */
export function offVaseStories(week: ActiveWeek): WeekStory[] {
  return week.stories.filter((item) => !onVase(item.entry));
}

/**
 * The default the publish step proposes: this week's new work is what free
 * readers and the newsletter may sample, and the stories retained from earlier
 * weeks become the subscriber tail.
 *
 * Callers may override per entry — the week file is the source of truth and
 * `npm run content:check` enforces the 3/2 split either way.
 */
export function proposeAccess(
  entries: { mythSlug: MythSlug; version: number; isNewThisWeek: boolean }[],
): WeekEntry[] {
  const ranked = [...entries].sort(
    (a, b) => Number(b.isNewThisWeek) - Number(a.isNewThisWeek) || a.mythSlug.localeCompare(b.mythSlug),
  );
  return ranked.map((entry, index) => ({
    mythSlug: entry.mythSlug,
    version: entry.version,
    access: index < PREVIEW_STORIES_PER_WEEK ? "preview" : "locked",
    vaseSlot: null,
  }));
}
