import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUserOrRedirect } from "@/lib/auth/guard";
import { getRevision, listRevisions } from "@/lib/cms/revisions";
import { getStoryForEditor } from "@/lib/cms/stories";
import { isId } from "@/lib/cms/validation";
import { diffLines, summarise } from "@/lib/cms/diff";
import DiffView from "@/components/cms/DiffView";
import RevisionCompare from "@/components/cms/RevisionCompare";

const when = (date: Date) =>
  date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default async function Revisions({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { id } = await params;
  await requireUserOrRedirect(`/admin/stories/${id}/revisions`);

  if (!isId(id)) {
    notFound();
  }

  const [story, revisions, compare] = await Promise.all([
    getStoryForEditor(id),
    listRevisions(id),
    searchParams,
  ]);

  if (!story) {
    notFound();
  }

  // Default the comparison to the two most recent, which is nearly always the
  // question being asked: what did that last save change?
  const bId = compare.b ?? revisions[0]?.id;
  const aId = compare.a ?? revisions[1]?.id ?? revisions[0]?.id;

  const [a, b] =
    aId && bId ? await Promise.all([getRevision(id, aId), getRevision(id, bId)]) : [null, null];

  const lines = a && b ? diffLines(a.content, b.content) : [];
  const totals = summarise(lines);

  return (
    <>
      <div className="cms-head">
        <div>
          <p className="cms-eyebrow">
            <Link href="/admin" style={{ textDecoration: "none" }}>
              Stories
            </Link>{" "}
            /{" "}
            <Link href={`/admin/stories/${story.id}`} style={{ textDecoration: "none" }}>
              {story.title}
            </Link>{" "}
            / History
          </p>
          <h1>Revision history</h1>
          <p>
            Every save, publish and restore, oldest at the bottom. Nothing here is ever rewritten:
            restoring an old revision writes a new one.
          </p>
        </div>

        <Link href={`/admin/stories/${story.id}`} className="cms-btn">
          Back to the editor
        </Link>
      </div>

      {revisions.length > 1 && (
        <div className="cms-panel">
          <h2>Compare</h2>

          <RevisionCompare storyId={story.id} revisions={revisions} a={aId} b={bId} />

          {a && b && (
            <>
              <p className="cms-field__hint" style={{ margin: "0.75rem 0 0.5rem" }}>
                Revision {a.number} → revision {b.number}: {totals.added} line
                {totals.added === 1 ? "" : "s"} added, {totals.removed} removed.
              </p>

              <DiffView lines={lines} />
            </>
          )}
        </div>
      )}

      <div className="cms-panel">
        {revisions.map((revision) => (
          <div key={revision.id} className="cms-rev">
            <span className="cms-rev__no">{revision.number}</span>

            <div className="cms-rev__body">
              <Link
                href={`/admin/stories/${story.id}/revisions/${revision.id}`}
                className="cms-table__title"
              >
                {revision.title}
              </Link>

              <p className="cms-rev__meta">
                <span className="cms-rev__kind" data-kind={revision.kind}>
                  {revision.kind.replace("_", " ").toLowerCase()}
                </span>
                {" · "}
                {when(revision.createdAt)}
                {revision.author && <> · {revision.author}</>}
                {" · "}
                {revision.characters.toLocaleString("en-GB")} characters
                {revision.restoredFromNumber !== null && (
                  <> · from revision {revision.restoredFromNumber}</>
                )}
              </p>
            </div>

            <span className="cms-actions">
              {revision.isLive && (
                <span className="cms-pill" data-status="PUBLISHED">
                  Live
                </span>
              )}
              {revision.isCurrent && !revision.isLive && (
                <span className="cms-pill" data-status="DRAFT">
                  Current draft
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
