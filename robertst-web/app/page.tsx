import Amphora from "@/components/Amphora";
import MythBackdrop from "@/components/MythBackdrop";
import { getViewer } from "@/lib/access/viewer";
import { getActiveCollection } from "@/lib/content/collection";
import { buildWeekView } from "@/lib/content/present";

/**
 * Rendered per request, never cached. What a reader may open is part of the
 * page, so it cannot be shared across viewers — reading the subscriber cookie
 * already forced this, but saying it explicitly also keeps the build from
 * attempting a prerender, which would make the database a build-time
 * dependency rather than a runtime one.
 */
export const dynamic = "force-dynamic";

export default async function Home() {
  const [collection, viewer] = await Promise.all([getActiveCollection(), getViewer()]);
  const view = buildWeekView(collection, viewer);

  return (
    <>
      <MythBackdrop />

      <main className="myth-stage">
        <p data-stage="eyebrow">Our oldest stories, from an unknown beginning.</p>

        <h1>Greek Myths</h1>

        <p data-stage="lead">Grab the amphora.</p>

        <Amphora week={view} />
      </main>
    </>
  );
}
