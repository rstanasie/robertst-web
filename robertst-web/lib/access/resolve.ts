import { StoryAccess } from "@prisma/client";

import type { PublicStory } from "@/lib/content/published";
import { previewSections, splitSections } from "@/lib/content/sections";
import type { StorySection } from "@/lib/content/sections";
import type { Viewer } from "./viewer";

/**
 * The single place access is decided. Pure: no request, no cookie, no database.
 *
 * The return type is a discriminated union for a reason — the "locked" case has
 * no `sections` and no `content` at all, so there is nothing for a template to
 * render by accident. Withholding is a property of the value, not a discipline
 * the view has to remember.
 */

export type StoryCard = Omit<PublicStory, "content" | "previewUntil">;

export type ResolvedStory =
  | { kind: "full"; story: PublicStory; sections: StorySection[] }
  | { kind: "preview"; story: PublicStory; sections: StorySection[]; withheld: number }
  | { kind: "locked"; card: StoryCard };

/**
 * Built field by field rather than by spreading and deleting. Listing what a
 * locked reader receives makes the omission auditable: adding a field to
 * PublicStory does not silently add it here.
 */
function cardOf(story: PublicStory): StoryCard {
  return {
    id: story.id,
    slug: story.slug,
    title: story.title,
    subtitle: story.subtitle,
    excerpt: story.excerpt,
    version: story.version,
    publishedAt: story.publishedAt,
    updatedAt: story.updatedAt,
    seoTitle: story.seoTitle,
    seoDescription: story.seoDescription,
    featuredImage: story.featuredImage,
    ogImage: story.ogImage,
  };
}

export function resolveStory(
  story: PublicStory,
  access: StoryAccess,
  viewer: Viewer,
): ResolvedStory {
  const sections = splitSections(story.content);

  if (viewer.isSubscriber) {
    return { kind: "full", story, sections };
  }

  if (access === StoryAccess.LOCKED) {
    return { kind: "locked", card: cardOf(story) };
  }

  const { shown, withheld } = previewSections(sections, story.previewUntil);
  return { kind: "preview", story, sections: shown, withheld };
}
