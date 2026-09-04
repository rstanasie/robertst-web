/**
 * The site's absolute origin, for canonical URLs, Open Graph tags and the
 * share action.
 *
 * Vercel exposes the production domain to the build, so a preview deployment
 * still emits production canonicals unless NEXT_PUBLIC_SITE_URL says otherwise.
 */
export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  const vercel =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.NEXT_PUBLIC_VERCEL_URL;
  if (vercel) {
    return `https://${vercel.replace(/\/$/, "")}`;
  }

  return "http://localhost:3000";
}

export const absoluteUrl = (path: string): string =>
  `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
