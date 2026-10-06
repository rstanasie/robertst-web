"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { StoryStatus } from "@prisma/client";

import { saveStoryAction } from "@/app/admin/actions";
import { idle } from "@/lib/cms/form-state";
import { slugify } from "@/lib/cms/slug";
import { contentFingerprint } from "@/lib/cms/validation";
import { splitSections } from "@/lib/content/sections";
import type { EditorStory } from "@/lib/cms/stories";
import SubmitButton from "./SubmitButton";
import StatusButton from "./StatusButton";

/**
 * The editor.
 *
 * Two decisions shape it. First, the writing surface is plain markdown with a
 * rendered preview beside it rather than a rich-text canvas: the stored value
 * is then exactly what the writer typed, which is what makes revisions
 * diffable, safe to render, and portable to MDX later.
 *
 * Second, saving is explicit. There is no autosave, so nothing is ever written
 * that the writer did not ask to write — but the bar below states plainly
 * whether there is unsaved work, and leaving the page with any is confirmed.
 */

export type MediaOption = { id: string; url: string; alt: string };

const emptyToNull = (value: string) => (value.trim() === "" ? null : value);

export default function StoryEditor({
  story,
  media,
}: {
  story: EditorStory;
  media: MediaOption[];
  vaseSlots: number;
}) {
  const [state, action] = useActionState(saveStoryAction, idle);

  const [title, setTitle] = useState(story.title);
  const [typedSlug, setTypedSlug] = useState(story.slug);
  const [subtitle, setSubtitle] = useState(story.subtitle ?? "");
  const [excerpt, setExcerpt] = useState(story.excerpt);
  const [content, setContent] = useState(story.content);
  const [previewUntil, setPreviewUntil] = useState(story.previewUntil ?? "");
  const [seoTitle, setSeoTitle] = useState(story.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(story.seoDescription ?? "");
  const [featuredImageId, setFeaturedImageId] = useState(story.featuredImageId ?? "");
  const [ogImageId, setOgImageId] = useState(story.ogImageId ?? "");

  const [tab, setTab] = useState<"write" | "preview">("write");
  const [slugTouched, setSlugTouched] = useState(false);

  // A story that has never been published still follows its title. Once it is
  // live the slug is a promise to every link that points at it, so it only ever
  // changes deliberately. Derived, not synchronised: there is no moment where
  // the two are out of step.
  const slugFollowsTitle = story.publishedVersion === 0 && !slugTouched;
  const slug = slugFollowsTitle ? slugify(title) : typedSlug;

  // The lock travels with the form. Every write bumps it, and every write
  // revalidates this route, so `story.lockVersion` is normally already current
  // by the time the action result arrives. Taking the larger of the two covers
  // the window before that re-render lands, without ever going backwards — and
  // if it somehow did, the next save fails with "changed elsewhere" rather than
  // overwriting anything.
  const lockVersion = Math.max(story.lockVersion, state.lockVersion ?? 0);

  const fingerprint = useMemo(
    () =>
      contentFingerprint({
        title,
        slug,
        subtitle: emptyToNull(subtitle),
        excerpt,
        content,
        previewUntil: emptyToNull(previewUntil),
        seoTitle: emptyToNull(seoTitle),
        seoDescription: emptyToNull(seoDescription),
        featuredImageId: emptyToNull(featuredImageId),
        ogImageId: emptyToNull(ogImageId),
      }),
    [
      title,
      slug,
      subtitle,
      excerpt,
      content,
      previewUntil,
      seoTitle,
      seoDescription,
      featuredImageId,
      ogImageId,
    ],
  );

  // What is stored: whatever the last save wrote, or — before any save — the
  // story as it arrived from the server.
  const stored = state.status === "ok" && state.saved ? state.saved : contentFingerprint(story);
  const dirty = fingerprint !== stored;

  useEffect(() => {
    if (!dirty) {
      return;
    }

    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const sections = useMemo(() => splitSections(content), [content]);
  const slugWarning = story.publishedVersion > 0 && slug !== story.slug;
  const errors = state.fields ?? {};

  const field = (name: string) => (errors[name] ? "cms-field cms-field--invalid" : "cms-field");

  return (
    <form action={action}>
      <input type="hidden" name="storyId" value={story.id} />
      <input type="hidden" name="lockVersion" value={lockVersion} />
      <input type="hidden" name="featuredImageId" value={featuredImageId} />
      <input type="hidden" name="ogImageId" value={ogImageId} />

      {state.status === "error" && (
        <p className="cms-note cms-note--error" role="alert">
          {state.message}
        </p>
      )}

      {state.status === "ok" && !dirty && (
        <p className="cms-note cms-note--ok" role="status">
          {state.message}
        </p>
      )}

      <div className="cms-editor">
        <div>
          <div className="cms-field">
            <label htmlFor="title">Title</label>
            <input
              id="title"
              name="title"
              type="text"
              className="cms-title-input"
              value={title}
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
            {errors.title && <p className="cms-field__error">{errors.title}</p>}
          </div>

          <div className="cms-tabs" role="tablist" aria-label="Editing mode">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "write"}
              onClick={() => setTab("write")}
            >
              Write
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "preview"}
              onClick={() => setTab("preview")}
            >
              Rendered
            </button>
          </div>

          {tab === "write" ? (
            <div className={field("content")}>
              <label htmlFor="content" className="sr-only">
                Story
              </label>
              <textarea
                id="content"
                name="content"
                className="cms-write"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                spellCheck
                placeholder={"## The first part {#the-first-part}\n\nMarkdown. Headings at ## divide the story into parts, and the free preview stops at whichever part you choose."}
              />
              {errors.content && <p className="cms-field__error">{errors.content}</p>}
              <p className="cms-field__hint">
                Markdown: **bold**, *italic*, &gt; quotes, - lists, [links](/), ![alt](url).
                Raw HTML is ignored rather than rendered.
              </p>
            </div>
          ) : (
            <div className="cms-rendered">
              <Markdown remarkPlugins={[remarkGfm]}>{content || "_Nothing written yet._"}</Markdown>
            </div>
          )}
        </div>

        <aside className="cms-editor__aside">
          <div className="cms-panel">
            <h2>Publishing</h2>

            <p style={{ margin: "0 0 0.5rem" }}>
              <span className="cms-pill" data-status={story.status}>
                {story.status.toLowerCase()}
              </span>
            </p>

            {story.hasUnpublishedChanges && (
              <p className="cms-field__hint" style={{ color: "var(--amber)" }}>
                The live version is behind this draft.
              </p>
            )}

            {story.publishedVersion > 0 && (
              <p className="cms-field__hint">
                Published {story.publishedVersion} time{story.publishedVersion === 1 ? "" : "s"}.
              </p>
            )}

            <div className="cms-actions" style={{ marginTop: "0.75rem" }}>
              {story.status === StoryStatus.PUBLISHED && (
                <StatusButton
                  storyId={story.id}
                  to={StoryStatus.DRAFT}
                  label="Unpublish"
                  className="cms-btn cms-btn--danger"
                  confirm="Take this off the public site? Every revision is kept and you can publish it again."
                />
              )}

              {story.status === StoryStatus.ARCHIVED && (
                <StatusButton
                  storyId={story.id}
                  to={StoryStatus.DRAFT}
                  label="Return to draft"
                  confirm="Bring this back as a draft?"
                />
              )}
            </div>
          </div>

          <div className="cms-panel">
            <h2>Address</h2>

            <div className={field("slug")}>
              <label htmlFor="slug">Slug</label>
              <input
                id="slug"
                name="slug"
                type="text"
                value={slug}
                onChange={(event) => {
                  setSlugTouched(true);
                  setTypedSlug(event.target.value);
                }}
                required
              />
              <p className="cms-field__hint">/myths/{slug || "…"}</p>
              {errors.slug && <p className="cms-field__error">{errors.slug}</p>}
            </div>

            {slugWarning && (
              <p className="cms-note cms-note--error" style={{ marginBottom: 0 }}>
                <strong>This story is published at /myths/{story.slug}.</strong> Changing the slug
                moves it: existing links, shares and search results will 404. Nothing redirects the
                old address.
              </p>
            )}
          </div>

          <div className="cms-panel">
            <h2>Presentation</h2>

            <div className="cms-field">
              <label htmlFor="subtitle">Subtitle</label>
              <input
                id="subtitle"
                name="subtitle"
                type="text"
                value={subtitle}
                maxLength={240}
                onChange={(event) => setSubtitle(event.target.value)}
              />
            </div>

            <div className={field("excerpt")}>
              <label htmlFor="excerpt">Excerpt</label>
              <textarea
                id="excerpt"
                name="excerpt"
                rows={3}
                value={excerpt}
                maxLength={400}
                onChange={(event) => setExcerpt(event.target.value)}
              />
              <p className="cms-field__hint">
                The teaser on the Amphora, in the newsletter, and the fallback search description.
              </p>
              {errors.excerpt && <p className="cms-field__error">{errors.excerpt}</p>}
            </div>

            <div className={field("previewUntil")}>
              <label htmlFor="previewUntil">Free preview ends after</label>
              <select
                id="previewUntil"
                name="previewUntil"
                value={previewUntil}
                onChange={(event) => setPreviewUntil(event.target.value)}
              >
                <option value="">First part only</option>
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.heading || "(opening)"}
                  </option>
                ))}
              </select>
              <p className="cms-field__hint">
                Non-subscribers read up to here when this story is a preview in its collection.
              </p>
              {errors.previewUntil && <p className="cms-field__error">{errors.previewUntil}</p>}
            </div>
          </div>

          <div className="cms-panel">
            <h2>Images</h2>

            <ImagePicker
              label="Featured"
              value={featuredImageId}
              onChange={setFeaturedImageId}
              media={media}
            />

            <ImagePicker
              label="Social card"
              value={ogImageId}
              onChange={setOgImageId}
              media={media}
              hint="Falls back to the featured image."
            />

            <Link href="/admin/media" className="cms-btn cms-btn--quiet">
              Manage images
            </Link>
          </div>

          <div className="cms-panel">
            <h2>Search</h2>

            <div className={field("seoTitle")}>
              <label htmlFor="seoTitle">Search title</label>
              <input
                id="seoTitle"
                name="seoTitle"
                type="text"
                value={seoTitle}
                maxLength={70}
                onChange={(event) => setSeoTitle(event.target.value)}
                placeholder={title}
              />
              {errors.seoTitle && <p className="cms-field__error">{errors.seoTitle}</p>}
            </div>

            <div className={field("seoDescription")}>
              <label htmlFor="seoDescription">Search description</label>
              <textarea
                id="seoDescription"
                name="seoDescription"
                rows={3}
                value={seoDescription}
                maxLength={200}
                onChange={(event) => setSeoDescription(event.target.value)}
                placeholder={excerpt}
              />
              {errors.seoDescription && <p className="cms-field__error">{errors.seoDescription}</p>}
            </div>
          </div>
        </aside>
      </div>

      <div className="cms-savebar">
        <span className="cms-savebar__state" data-dirty={dirty ? "" : undefined}>
          {dirty ? "Unsaved changes" : state.status === "ok" ? "Saved" : "No changes"}
        </span>

        {dirty ? (
          <span className="cms-field__hint">Save before previewing — preview shows the last saved draft.</span>
        ) : (
          <Link
            href={`/api/preview?slug=${encodeURIComponent(story.slug)}`}
            target="_blank"
            rel="noreferrer"
            prefetch={false}
            className="cms-btn"
          >
            Preview
          </Link>
        )}

        <SubmitButton name="intent" value="save" className="cms-btn" pending="Saving…">
          Save draft
        </SubmitButton>

        <SubmitButton
          name="intent"
          value="publish"
          className="cms-btn cms-btn--gold"
          pending="Publishing…"
        >
          {story.status === StoryStatus.PUBLISHED ? "Publish changes" : "Publish"}
        </SubmitButton>
      </div>
    </form>
  );
}

function ImagePicker({
  label,
  value,
  onChange,
  media,
  hint,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  media: MediaOption[];
  hint?: string;
}) {
  const chosen = media.find((asset) => asset.id === value);

  return (
    <div className="cms-field">
      <label htmlFor={`image-${label}`}>{label}</label>

      {chosen && (
        // Deliberately a plain img: these are arbitrary remote URLs from the
        // media library, and the CMS is not worth an image-domain allowlist.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={chosen.url} alt={chosen.alt} className="cms-thumb" />
      )}

      <select
        id={`image-${label}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">None</option>
        {media.map((asset) => (
          <option key={asset.id} value={asset.id}>
            {asset.alt || asset.url.split("/").pop()}
          </option>
        ))}
      </select>

      {hint && <p className="cms-field__hint">{hint}</p>}
    </div>
  );
}
