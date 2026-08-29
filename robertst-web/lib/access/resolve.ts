import type { Myth, ResolvedStory, StoryCard, StoryVersion, WeekEntry } from "@/lib/content/types";
import type { Viewer } from "./viewer";

const cardOf = (story: StoryVersion): StoryCard => ({
  version: story.version,
  publishedAt: story.publishedAt,
  teaser: story.teaser,
  drawing: story.drawing,
});

/**
 * The single place access is decided. Pure, so it is trivially testable and has
 * no way to reach a request, a cookie or the filesystem.
 *
 * A subscriber overrides the week's access state. Otherwise a locked story
 * yields only its card — the returned value has no `parts` at all, so there is
 * nothing for a template to accidentally render.
 */
export function resolveStory(
  myth: Myth,
  story: StoryVersion,
  entry: Pick<WeekEntry, "access">,
  viewer: Viewer,
): ResolvedStory {
  if (viewer.isSubscriber) {
    return { kind: "full", myth, story };
  }

  if (entry.access === "locked") {
    return { kind: "locked", myth, card: cardOf(story) };
  }

  const cutoff = story.parts.findIndex((part) => part.id === story.previewUntil);
  const end = cutoff === -1 ? story.parts.length : cutoff + 1;

  return {
    kind: "preview",
    myth,
    story,
    parts: story.parts.slice(0, end),
    withheld: story.parts.length - end,
  };
}
