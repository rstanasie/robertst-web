import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import AccessNotice from "@/components/AccessNotice";
import MythBackdrop from "@/components/MythBackdrop";
import StoryBody from "@/components/StoryBody";
import StoryDrawing from "@/components/StoryDrawing";
import { resolveStory } from "@/lib/access/resolve";
import { getViewer } from "@/lib/access/viewer";
import { findInWeek, getActiveWeek } from "@/lib/content/week";

type Params = { params: Promise<{ story: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { story } = await params;
  const item = findInWeek(getActiveWeek(), story);

  return item
    ? { title: `${item.myth.title} — The Amphora`, description: item.story.teaser }
    : { title: "Myth not found — The Amphora" };
}

export default async function MythPage({ params }: Params) {
  const { story: slug } = await params;
  const week = getActiveWeek();

  // Only the active week is reachable for now. An archive — and access to
  // earlier versions of a myth — is the natural next route, and the content
  // layer already keeps every version to support it.
  const item = findInWeek(week, slug);
  if (!item) {
    notFound();
  }

  const viewer = await getViewer();
  const resolved = resolveStory(item.myth, item.story, item.entry, viewer);
  const card = resolved.kind === "locked" ? resolved.card : resolved.story;

  return (
    <>
      <MythBackdrop className="myth-backdrop--quiet" />

      <main className="myth-read">
        <p className="myth-read__eyebrow">
          Week {week.collection.week}
          {item.story.version > 1 && <> · version {item.story.version}</>}
        </p>

        <h1>{item.myth.title}</h1>

        <p className="myth-read__teaser">{card.teaser}</p>

        <StoryDrawing drawing={card.drawing} title={item.myth.title} sealed={resolved.kind === "locked"} />

        {resolved.kind === "locked" ? (
          <AccessNotice variant="sealed" />
        ) : (
          <article className="myth-read__body">
            <StoryBody parts={resolved.kind === "full" ? resolved.story.parts : resolved.parts} />

            {resolved.kind === "preview" && (
              <AccessNotice variant="cutoff" withheld={resolved.withheld} />
            )}
          </article>
        )}

        <Link href="/" className="myth-read__back">
          Back to the amphora
        </Link>
      </main>
    </>
  );
}
