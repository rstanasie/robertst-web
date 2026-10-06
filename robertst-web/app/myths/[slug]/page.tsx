import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import AccessNotice from "@/components/AccessNotice";
import MythBackdrop from "@/components/MythBackdrop";
import PreviewBanner from "@/components/PreviewBanner";
import ShareStory from "@/components/ShareStory";
import StoryContent from "@/components/StoryContent";
import StoryDrawing from "@/components/StoryDrawing";
import { resolveStory } from "@/lib/access/resolve";
import { getViewer } from "@/lib/access/viewer";
import { accessForStory } from "@/lib/content/published";
import { readStoryForRequest } from "@/lib/preview";
import { absoluteUrl } from "@/lib/site";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const found = await readStoryForRequest(slug);

  if (!found) {
    return { title: "Myth not found — The Amphora", robots: { index: false, follow: false } };
  }

  const { story, isPreview } = found;
  const title = story.seoTitle ?? story.title;
  const description = story.seoDescription ?? story.excerpt;
  const url = absoluteUrl(`/myths/${story.slug}`);
  const image = story.ogImage ?? story.featuredImage;

  return {
    title: `${title} — The Amphora`,
    description,
    // A draft being previewed must never be indexable, whatever it links to.
    ...(isPreview ? { robots: { index: false, follow: false } } : { alternates: { canonical: url } }),
    openGraph: {
      type: "article",
      title,
      description,
      url,
      publishedTime: story.publishedAt?.toISOString(),
      modifiedTime: story.updatedAt.toISOString(),
      images: image ? [{ url: absoluteUrl(image.url), alt: image.alt }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [absoluteUrl(image.url)] : undefined,
    },
  };
}

export default async function MythPage({ params }: Params) {
  const { slug } = await params;

  // One lookup decides everything: a published story for the public, or the
  // working draft for an authenticated preview. A draft, an archived story and
  // a slug that never existed are the same 404 to an ordinary visitor.
  const found = await readStoryForRequest(slug);

  if (!found) {
    notFound();
  }

  const { story, isPreview, status } = found;
  const [viewer, access] = await Promise.all([getViewer(), accessForStory(story.id)]);
  const resolved = resolveStory(story, access, viewer);
  const card = resolved.kind === "locked" ? resolved.card : resolved.story;

  return (
    <>
      {isPreview && <PreviewBanner slug={story.slug} status={status} />}

      <MythBackdrop className="myth-backdrop--quiet" />

      <main className="myth-read">
        <p className="myth-read__eyebrow">
          {card.publishedAt
            ? card.publishedAt.toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })
            : "Unpublished"}
          {card.version > 1 && <> · version {card.version}</>}
        </p>

        <h1>{card.title}</h1>

        {card.subtitle && <p className="myth-read__subtitle">{card.subtitle}</p>}

        <p className="myth-read__teaser">{card.excerpt}</p>

        <StoryDrawing
          drawing={card.featuredImage?.url ?? null}
          alt={card.featuredImage?.alt || `Illustration for ${card.title}`}
          title={card.title}
          sealed={resolved.kind === "locked"}
        />

        {resolved.kind === "locked" ? (
          <AccessNotice variant="sealed" />
        ) : (
          <article className="myth-read__body">
            <StoryContent sections={resolved.sections} />

            {resolved.kind === "preview" && resolved.withheld > 0 && (
              <AccessNotice variant="cutoff" withheld={resolved.withheld} />
            )}
          </article>
        )}

        <ShareStory title={card.title} teaser={card.excerpt} path={`/myths/${card.slug}`} />

        <Link href="/" className="myth-read__back">
          Back to the Amphora
        </Link>
      </main>
    </>
  );
}
