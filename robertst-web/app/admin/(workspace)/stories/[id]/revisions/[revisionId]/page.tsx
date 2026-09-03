import Link from "next/link";
import { notFound } from "next/navigation";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { requireUserOrRedirect } from "@/lib/auth/guard";
import { getRevision } from "@/lib/cms/revisions";
import { getStoryForEditor } from "@/lib/cms/stories";
import { isId } from "@/lib/cms/validation";
import RestoreButton from "@/components/cms/RestoreButton";

export default async function RevisionDetail({
  params,
}: {
  params: Promise<{ id: string; revisionId: string }>;
}) {
  const { id, revisionId } = await params;
  await requireUserOrRedirect(`/admin/stories/${id}/revisions/${revisionId}`);

  if (!isId(id) || !isId(revisionId)) {
    notFound();
  }

  const [story, revision] = await Promise.all([getStoryForEditor(id), getRevision(id, revisionId)]);

  if (!story || !revision) {
    notFound();
  }

  const when = revision.createdAt.toLocaleString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <>
      <div className="cms-head">
        <div>
          <p className="cms-eyebrow">
            <Link href={`/admin/stories/${story.id}/revisions`} style={{ textDecoration: "none" }}>
              History
            </Link>{" "}
            / Revision {revision.number}
          </p>
          <h1>{revision.title}</h1>
          <p>
            <span className="cms-rev__kind" data-kind={revision.kind}>
              {revision.kind.replace("_", " ").toLowerCase()}
            </span>{" "}
            · {when}
            {revision.author && <> · {revision.author}</>}
            {revision.restoredFromNumber !== null && (
              <> · restored from revision {revision.restoredFromNumber}</>
            )}
          </p>
        </div>

        <div className="cms-actions">
          <Link
            href={`/admin/stories/${story.id}/revisions?a=${revision.id}&b=${story.publishedRevisionId ?? ""}`}
            className="cms-btn"
          >
            Compare
          </Link>

          {!revision.isCurrent && (
            <RestoreButton
              storyId={story.id}
              revisionId={revision.id}
              lockVersion={story.lockVersion}
              number={revision.number}
              nextNumber={story.revisionCount + 1}
              slugChanges={revision.slug !== story.slug}
            />
          )}
        </div>
      </div>

      {revision.isCurrent && (
        <p className="cms-note" role="status">
          This is the current draft — it is what the editor is showing, so there is nothing to
          restore.
        </p>
      )}

      <div className="cms-panel">
        <h2>Metadata as it was</h2>

        <dl className="cms-row">
          <div>
            <dt className="cms-label">Slug</dt>
            <dd style={{ margin: "0 0 0.75rem", fontFamily: "var(--mono)", fontSize: "0.75rem" }}>
              /myths/{revision.slug}
            </dd>
          </div>
          <div>
            <dt className="cms-label">Preview ends after</dt>
            <dd style={{ margin: "0 0 0.75rem" }}>{revision.previewUntil ?? "first part"}</dd>
          </div>
          <div>
            <dt className="cms-label">Search title</dt>
            <dd style={{ margin: "0 0 0.75rem" }}>{revision.seoTitle ?? "—"}</dd>
          </div>
        </dl>

        <dt className="cms-label">Excerpt</dt>
        <dd style={{ margin: "0.25rem 0 0" }}>{revision.excerpt || "—"}</dd>
      </div>

      <div className="cms-panel">
        <h2>Story as it was</h2>

        <div className="cms-rendered">
          <Markdown remarkPlugins={[remarkGfm]}>{revision.content || "_Empty._"}</Markdown>
        </div>
      </div>
    </>
  );
}
