import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUserOrRedirect } from "@/lib/auth/guard";
import { getStoryForEditor } from "@/lib/cms/stories";
import { isId } from "@/lib/cms/validation";
import { listMedia } from "@/lib/media/service";
import { VASE_SLOTS } from "@/lib/content/vase";
import StoryEditor from "@/components/cms/StoryEditor";

export default async function EditStory({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ restored?: string }>;
}) {
  const { id } = await params;
  await requireUserOrRedirect(`/admin/stories/${id}`);

  if (!isId(id)) {
    notFound();
  }

  const [story, media, { restored }] = await Promise.all([
    getStoryForEditor(id),
    listMedia(),
    searchParams,
  ]);

  if (!story) {
    notFound();
  }

  return (
    <>
      <div className="cms-head">
        <div>
          <p className="cms-eyebrow">
            <Link href="/admin" style={{ textDecoration: "none" }}>
              Stories
            </Link>{" "}
            / Editing
          </p>
          <h1>{story.title}</h1>
        </div>

        <div className="cms-actions">
          <Link href={`/admin/stories/${story.id}/revisions`} className="cms-btn">
            History ({story.revisionCount})
          </Link>
        </div>
      </div>

      {restored && (
        <p className="cms-note cms-note--ok" role="status">
          Revision {restored} was restored into the draft as revision {story.revisionCount}. Nothing
          was deleted — publish when you are happy with it.
        </p>
      )}

      <StoryEditor
        story={story}
        media={media.map((asset) => ({ id: asset.id, url: asset.url, alt: asset.alt }))}
        vaseSlots={VASE_SLOTS}
      />
    </>
  );
}
