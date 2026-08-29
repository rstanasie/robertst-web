import "server-only";

import { getActiveWeek } from "@/lib/content/week";
import type { StoryAccess } from "@/lib/content/types";

/**
 * The weekly email, as data.
 *
 * No provider here on purpose: this builds the payload and stops. Whatever
 * eventually sends it — Resend, Buttondown, a cron job with an SMTP client —
 * consumes this shape and nothing else knows about it.
 *
 * Full story text is never included. The email carries teasers and links, so
 * reading always happens on the site where access rules are enforced.
 */

export type NewsletterStory = {
  slug: string;
  title: string;
  teaser: string;
  drawing: string | null;
  url: string;
  access: StoryAccess;
};

export type NewsletterIssue = {
  week: string;
  publishedAt: string;
  /** Two or three stories to lead with. */
  featured: NewsletterStory[];
  /** Titles of everything else in the week, for a one-line "also this week". */
  alsoThisWeek: { slug: string; title: string; access: StoryAccess }[];
  amphoraUrl: string;
};

const FEATURED_MAX = 3;

export function buildNewsletterIssue(siteUrl: string, now?: Date): NewsletterIssue {
  const week = getActiveWeek(now);
  const base = siteUrl.replace(/\/$/, "");

  // Lead with what a free reader can actually start: previews convert, locked
  // stories only frustrate as an opening.
  const ranked = [...week.stories].sort(
    (a, b) =>
      Number(a.entry.access === "locked") - Number(b.entry.access === "locked") ||
      b.story.publishedAt.localeCompare(a.story.publishedAt),
  );

  const featured = ranked.slice(0, FEATURED_MAX);

  return {
    week: week.collection.week,
    publishedAt: week.collection.publishedAt,
    featured: featured.map((item) => ({
      slug: item.entry.mythSlug,
      title: item.myth.title,
      teaser: item.story.teaser,
      drawing: item.story.drawing,
      url: `${base}/myths/${item.entry.mythSlug}`,
      access: item.entry.access,
    })),
    alsoThisWeek: ranked.slice(FEATURED_MAX).map((item) => ({
      slug: item.entry.mythSlug,
      title: item.myth.title,
      access: item.entry.access,
    })),
    amphoraUrl: base || "/",
  };
}
