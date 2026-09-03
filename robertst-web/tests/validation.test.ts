import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { StoryStatus } from "@prisma/client";

import {
  canTransition,
  contentFingerprint,
  hasErrors,
  isId,
  parseStoryForm,
  validateDraft,
  validatePublish,
} from "@/lib/cms/validation";
import type { StoryInput } from "@/lib/cms/validation";

const base: StoryInput = {
  title: "Prometheus",
  slug: "prometheus",
  subtitle: null,
  excerpt: "He stole fire.",
  content: "## One {#one}\n\nText.",
  previewUntil: "one",
  seoTitle: null,
  seoDescription: null,
  featuredImageId: null,
  ogImageId: null,
};

describe("validation", () => {
  it("requires a title and a well-formed slug to save at all", () => {
    assert.equal(hasErrors(validateDraft(base)), false);
    assert.ok(validateDraft({ ...base, title: "" }).title);
    assert.ok(validateDraft({ ...base, slug: "" }).slug);
    assert.ok(validateDraft({ ...base, slug: "Not A Slug" }).slug);
  });

  it("lets a draft be empty but not a published story", () => {
    const empty = { ...base, content: "", excerpt: "", previewUntil: null };

    assert.equal(hasErrors(validateDraft(empty)), false);
    assert.ok(validatePublish(empty).content);
    assert.ok(validatePublish(empty).excerpt);
  });

  it("rejects a preview cutoff that no longer exists in the content", () => {
    assert.ok(validatePublish({ ...base, previewUntil: "gone" }).previewUntil);
    assert.equal(validatePublish(base).previewUntil, undefined);
  });

  it("rejects malformed ids", () => {
    assert.equal(isId("clx1234567890abcdef"), true);
    assert.equal(isId("../../etc/passwd"), false);
    assert.equal(isId("' OR 1=1--"), false);
    assert.equal(isId(""), false);
    assert.equal(isId(42), false);
  });

  it("allows only sensible status transitions", () => {
    assert.equal(canTransition(StoryStatus.DRAFT, StoryStatus.PUBLISHED), true);
    assert.equal(canTransition(StoryStatus.PUBLISHED, StoryStatus.DRAFT), true);
    assert.equal(canTransition(StoryStatus.PUBLISHED, StoryStatus.ARCHIVED), true);
    assert.equal(canTransition(StoryStatus.ARCHIVED, StoryStatus.DRAFT), true);

    // An archived story must come back as a draft before it can go live again.
    assert.equal(canTransition(StoryStatus.ARCHIVED, StoryStatus.PUBLISHED), false);
  });

  it("normalises a form the same way whatever the line endings", () => {
    const form = new FormData();
    form.set("title", "  Prometheus  ");
    form.set("slug", "prometheus");
    form.set("content", "a\r\nb");
    form.set("subtitle", "");

    const parsed = parseStoryForm(form);
    assert.equal(parsed.title, "Prometheus");
    assert.equal(parsed.content, "a\nb");
    assert.equal(parsed.subtitle, null);
  });

  it("fingerprints content identically for equal input and differently otherwise", () => {
    assert.equal(contentFingerprint(base), contentFingerprint({ ...base }));
    assert.notEqual(contentFingerprint(base), contentFingerprint({ ...base, title: "Other" }));
  });
});
