import type { MetadataRoute } from "next";

import { listPublishedSlugs } from "@/lib/content/published";
import { siteUrl } from "@/lib/site";

// Regenerated hourly rather than pinned at build time, so a story published
// from the CMS appears without a redeploy.
export const revalidate = 3600;

/**
 * Published stories only. Drafts and archived stories are absent by
 * construction: the query itself filters on status, so there is no list to
 * forget to filter.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();

  // This route is prerendered, so an unreachable database would otherwise fail
  // the whole build — for a file that is an SEO courtesy, not correctness. It
  // degrades to the static routes instead and picks the stories up on the next
  // revalidation.
  let stories: Awaited<ReturnType<typeof listPublishedSlugs>> = [];

  try {
    stories = await listPublishedSlugs();
  } catch (error) {
    console.warn("sitemap: could not read published stories, listing static routes only", error);
  }

  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    ...stories.map((story) => ({
      url: `${base}/myths/${story.slug}`,
      lastModified: story.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
