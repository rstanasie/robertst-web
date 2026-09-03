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
  const stories = await listPublishedSlugs();

  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/about`, changeFrequency: "yearly", priority: 0.3 },
    ...stories.map((story) => ({
      url: `${base}/myths/${story.slug}`,
      lastModified: story.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
