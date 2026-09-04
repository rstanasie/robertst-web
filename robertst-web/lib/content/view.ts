/**
 * The only shapes that cross to the browser.
 *
 * Every field here is safe for an unauthenticated reader to hold: titles,
 * excerpts and access states. Story text is deliberately absent — a client
 * component cannot leak what it was never given, which is a stronger guarantee
 * than remembering not to render it.
 */

export type ChipAccess = "preview" | "locked";

export type StoryChip = {
  slug: string;
  title: string;
  teaser: string;
  access: ChipAccess;
  /** Whether this viewer may read the whole thing. */
  unlocked: boolean;
};

export type VaseStoryChip = StoryChip & {
  slot: number;
  angle: number;
};

export type WeekView = {
  /** Display name of the active collection, e.g. "Week 2026 · 34". */
  week: string;
  /** Painted on the vessel, in slot order. The amphora settles on these. */
  onVase: VaseStoryChip[];
  /** In the collection, but with no slot on the vessel. */
  offVase: StoryChip[];
  isSubscriber: boolean;
};

export const weekStories = (view: WeekView): StoryChip[] => [...view.onVase, ...view.offVase];
