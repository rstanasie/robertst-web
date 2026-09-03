import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { StoryAccess } from "@prisma/client";

import { resolveStory } from "@/lib/access/resolve";
import type { PublicStory } from "@/lib/content/published";

const story: PublicStory = {
  id: "story1",
  slug: "prometheus",
  title: "Prometheus",
  subtitle: null,
  excerpt: "He stole fire.",
  content: "## One {#one}\n\nFirst.\n\n## Two {#two}\n\nSecond.\n\n## Three {#three}\n\nThird.",
  previewUntil: "two",
  version: 1,
  publishedAt: new Date("2026-08-17"),
  updatedAt: new Date("2026-08-17"),
  seoTitle: null,
  seoDescription: null,
  featuredImage: null,
  ogImage: null,
};

const free = { isSubscriber: false };
const subscriber = { isSubscriber: true };

describe("access", () => {
  it("gives a subscriber everything, locked or not", () => {
    for (const access of [StoryAccess.PREVIEW, StoryAccess.LOCKED]) {
      const resolved = resolveStory(story, access, subscriber);
      assert.equal(resolved.kind, "full");
      assert.equal(resolved.kind === "full" && resolved.sections.length, 3);
    }
  });

  it("cuts a free reader off after previewUntil", () => {
    const resolved = resolveStory(story, StoryAccess.PREVIEW, free);

    assert.equal(resolved.kind, "preview");
    assert.ok(resolved.kind === "preview");
    assert.deepEqual(
      resolved.sections.map((section) => section.id),
      ["one", "two"],
    );
    assert.equal(resolved.withheld, 1);
  });

  it("hands a locked story no story text at all", () => {
    const resolved = resolveStory(story, StoryAccess.LOCKED, free);

    assert.equal(resolved.kind, "locked");
    assert.ok(resolved.kind === "locked");

    // The guarantee is structural: there is nothing to render by accident.
    const serialised = JSON.stringify(resolved.card);
    assert.ok(!("content" in resolved.card));
    assert.ok(!("previewUntil" in resolved.card));
    assert.ok(!serialised.includes("First."), "withheld text leaked into the card");
    assert.ok(!serialised.includes("Third."), "withheld text leaked into the card");
  });

  it("still shows the card a locked story needs", () => {
    const resolved = resolveStory(story, StoryAccess.LOCKED, free);
    assert.ok(resolved.kind === "locked");
    assert.equal(resolved.card.title, "Prometheus");
    assert.equal(resolved.card.excerpt, "He stole fire.");
  });
});
