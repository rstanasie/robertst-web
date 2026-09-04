import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // The CMS and its endpoints are behind a session, but there is no reason
      // for a crawler to be knocking on them either.
      disallow: ["/admin", "/api/"],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
