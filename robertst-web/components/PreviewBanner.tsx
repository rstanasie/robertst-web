import Link from "next/link";
import { StoryStatus } from "@prisma/client";

/**
 * Says, unmissably, that this is not what the public sees.
 *
 * It also states *which* draft: preview renders the last saved draft, not
 * whatever is currently typed into another tab's editor. Being explicit about
 * that is cheaper than implementing live unsaved preview, and honest either way.
 */
export default function PreviewBanner({ slug, status }: { slug: string; status: StoryStatus }) {
  const label =
    status === StoryStatus.PUBLISHED
      ? "unpublished changes to a live story"
      : `${status.toLowerCase()} story`;

  return (
    <div className="cms-preview-banner" role="status">
      <span className="cms-preview-banner__tag">Preview</span>

      <p>
        You are reading the last saved draft — {label}. Readers do not see this.
      </p>

      <span className="cms-preview-banner__actions">
        <Link href={`/admin/stories/${slug}`} prefetch={false}>
          Back to the editor
        </Link>
        <Link href={`/api/preview/exit?slug=${encodeURIComponent(slug)}`} prefetch={false}>
          Exit preview
        </Link>
      </span>
    </div>
  );
}
