import Amphora from "@/components/Amphora";
import MythBackdrop from "@/components/MythBackdrop";
import { getViewer } from "@/lib/access/viewer";
import { buildWeekView } from "@/lib/content/present";
import { getActiveWeek } from "@/lib/content/week";

export default async function Home() {
  // Reading the viewer makes this route dynamic, which is correct: what a reader
  // may open is part of the page, so it must not be cached across viewers.
  const [week, viewer] = [getActiveWeek(), await getViewer()];
  const view = buildWeekView(week, viewer);

  return (
    <>
      <MythBackdrop />

      <main className="myth-stage">
        <h1>The Amphora</h1>

        <p>Five myths a week. Spin the amphora and let the gods choose your story.</p>

        <Amphora week={view} />
      </main>
    </>
  );
}
