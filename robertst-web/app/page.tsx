import Amphora from "@/components/Amphora";
import MythBackdrop from "@/components/MythBackdrop";
import { getViewer } from "@/lib/access/viewer";
import { getActiveCollection } from "@/lib/content/collection";
import { buildWeekView } from "@/lib/content/present";

export default async function Home() {
  // Reading the viewer makes this route dynamic, which is correct: what a reader
  // may open is part of the page, so it must not be cached across viewers.
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
