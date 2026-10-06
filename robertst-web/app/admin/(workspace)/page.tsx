import Link from "next/link";
import { StoryStatus } from "@prisma/client";

import { requireUserOrRedirect } from "@/lib/auth/guard";
import { listStories } from "@/lib/cms/stories";
import type { StoryFilter } from "@/lib/cms/stories";
import NewStoryForm from "@/components/cms/NewStoryForm";
import StatusButton from "@/components/cms/StatusButton";

const FILTERS: { key: StoryFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Drafts" },
  { key: "published", label: "Published" },
  { key: "archived", label: "Archived" },
];

const isFilter = (value: string | undefined): value is StoryFilter =>
  FILTERS.some((filter) => filter.key === value);

const when = (date: Date) =>
  date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  await requireUserOrRedirect("/admin");

  const { filter } = await searchParams;
  const active: StoryFilter = isFilter(filter) ? filter : "all";

  // One read: counts come from the same rows the table renders, so the tabs can
  // never disagree with what is under them.
  const all = await listStories("all");
  const stories =
    active === "all" ? all : all.filter((story) => story.status === active.toUpperCase());

  const count = (key: StoryFilter) =>
    key === "all" ? all.length : all.filter((story) => story.status === key.toUpperCase()).length;

  return (
    <>
      <div className="cms-head">
        <div>
          <p className="cms-eyebrow">Library</p>
          <h1>Stories</h1>
        </div>

        <NewStoryForm />
      </div>

      <nav className="cms-filters" aria-label="Filter stories">
        {FILTERS.map((entry) => (
          <Link
            key={entry.key}
            href={entry.key === "all" ? "/admin" : `/admin?filter=${entry.key}`}
            aria-current={entry.key === active ? "page" : undefined}
          >
            {entry.label} <span>{count(entry.key)}</span>
          </Link>
        ))}
      </nav>

      <div className="cms-table-wrap">
        <table className="cms-table">
          <thead>
            <tr>
              <th scope="col">Title</th>
              <th scope="col">Status</th>
              <th scope="col">Updated</th>
              <th scope="col">Revisions</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {stories.map((story) => (
              <tr key={story.id}>
                <td>
                  <Link href={`/admin/stories/${story.id}`} className="cms-table__title">
                    {story.title}
                  </Link>
                  <span className="cms-table__slug">/myths/{story.slug}</span>
                </td>

                <td>
                  <span className="cms-pill" data-status={story.status}>
                    {story.status.toLowerCase()}
                  </span>
                  {story.hasUnpublishedChanges && (
                    <div className="cms-flag">Unpublished changes</div>
                  )}
                  {story.inActiveCollection && (
                    <div className="cms-flag cms-flag--vase">On the Amphora</div>
                  )}
                </td>

                <td className="cms-table__when">
                  {when(story.updatedAt)}
                  {story.updatedBy && (
                    <span className="cms-table__slug">by {story.updatedBy}</span>
                  )}
                </td>

                <td className="cms-table__when">{story.revisionCount}</td>

                <td>
                  <div className="cms-table__actions">
                    <Link href={`/admin/stories/${story.id}`} className="cms-btn cms-btn--quiet">
                      Edit
                    </Link>

                    <Link
                      href={`/api/preview?slug=${story.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      prefetch={false}
                      className="cms-btn cms-btn--quiet"
                    >
                      Preview
                    </Link>

                    <Link
                      href={`/admin/stories/${story.id}/revisions`}
                      className="cms-btn cms-btn--quiet"
                    >
                      History
                    </Link>

                    {story.status === StoryStatus.PUBLISHED ? (
                      <StatusButton
                        storyId={story.id}
                        to={StoryStatus.DRAFT}
                        label="Unpublish"
                        confirm={`Take "${story.title}" off the public site? Every revision is kept.`}
                      />
                    ) : (
                      story.status === StoryStatus.DRAFT && (
                        <StatusButton
                          storyId={story.id}
                          to={StoryStatus.ARCHIVED}
                          label="Archive"
                          confirm={`Archive "${story.title}"?`}
                        />
                      )
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {stories.length === 0 && (
          <p className="cms-empty">
            {active === "all" ? "Nothing written yet." : `No ${active} stories.`}
          </p>
        )}
      </div>
    </>
  );
}
