import "server-only";

import { StoryAccess } from "@prisma/client";

import { getActiveCollection } from "@/lib/content/collection";
import { siteUrl } from "@/lib/site";

/**
 * The weekly email, as data.
 *
 * No provider here on purpose: this builds the payload and stops. Whatever
 * eventually sends it — Resend, Buttondown, a cron job with an SMTP client —
 * consumes this shape and nothing else knows about it.
 *
 * Full story text is never included. The email carries excerpts and links, so
 * reading always happens on the site where access rules are enforced.
 */

export type NewsletterStory = {
  slug: string;
  title: string;
  teaser: string;
  image: string | null;
  url: string;
  access: StoryAccess;
};

export type NewsletterIssue = {
  collection: string;
  publishedAt: string | null;
  /** Two or three stories to lead with. */
  featured: NewsletterStory[];
  /** Titles of everything else, for a one-line "also this week". */
  alsoThisWeek: { slug: string; title: string; access: StoryAccess }[];
  amphoraUrl: string;
};

const FEATURED_MAX = 3;

export async function buildNewsletterIssue(base = siteUrl()): Promise<NewsletterIssue | null> {
  const collection = await getActiveCollection();

  if (!collection) {
    return null;
  }

  const origin = base.replace(/\/$/, "");

  // Lead with what a free reader can actually start: previews convert, locked
  // stories only frustrate as an opening.
  const ranked = [...collection.stories].sort(
    (a, b) =>
      Number(a.access === StoryAccess.LOCKED) - Number(b.access === StoryAccess.LOCKED) ||
      a.position - b.position,
  );

  return {
    collection: collection.name,
    publishedAt: collection.publishedAt?.toISOString() ?? null,
    featured: ranked.slice(0, FEATURED_MAX).map((story) => ({
      slug: story.slug,
      title: story.title,
      teaser: story.excerpt,
      image: story.featuredImageUrl,
      url: `${origin}/myths/${story.slug}`,
      access: story.access,
    })),
    alsoThisWeek: ranked.slice(FEATURED_MAX).map((story) => ({
      slug: story.slug,
      title: story.title,
      access: story.access,
    })),
    amphoraUrl: origin || "/",
  };
}
