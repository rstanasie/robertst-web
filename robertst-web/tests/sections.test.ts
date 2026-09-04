import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { previewSections, splitSections } from "@/lib/content/sections";

describe("story sections", () => {
  it("splits on ## headings and keeps the body as markdown", () => {
    const sections = splitSections("## One\n\nA **bold** line.\n\n## Two\n\nAnother.");

    assert.deepEqual(
      sections.map((section) => section.id),
      ["one", "two"],
    );
    assert.equal(sections[0].body, "A **bold** line.");
  });

  it("honours explicit ids so a reworded heading does not move the cutoff", () => {
    const sections = splitSections("## The Theft of Fire {#the-theft}\n\nText.");
    assert.equal(sections[0].id, "the-theft");
    assert.equal(sections[0].heading, "The Theft of Fire");
  });

  it("keeps text before the first heading as an opening section", () => {
    const sections = splitSections("A standfirst.\n\n## One\n\nText.");
    assert.equal(sections[0].id, "opening");
    assert.equal(sections[0].heading, "");
    assert.equal(sections.length, 2);
  });

  it("ignores ## inside a fenced code block", () => {
    const sections = splitSections("## One\n\n```\n## not a heading\n```\n\ntail");
    assert.equal(sections.length, 1);
    assert.ok(sections[0].body.includes("## not a heading"));
  });

  it("disambiguates colliding ids", () => {
    const sections = splitSections("## The End\n\na\n\n## The End\n\nb");
    assert.deepEqual(
      sections.map((section) => section.id),
      ["the-end", "the-end-2"],
    );
  });

  it("cuts the preview after the named section", () => {
    const sections = splitSections("## a\n\n1\n\n## b\n\n2\n\n## c\n\n3");
    const { shown, withheld } = previewSections(sections, "b");

    assert.deepEqual(
      shown.map((section) => section.id),
      ["a", "b"],
    );
    assert.equal(withheld, 1);
  });

  it("withholds rather than reveals when previewUntil names nothing", () => {
    const sections = splitSections("## a\n\n1\n\n## b\n\n2\n\n## c\n\n3");

    for (const cutoff of [null, "deleted-heading"]) {
      const { shown, withheld } = previewSections(sections, cutoff);
      assert.equal(shown.length, 1, `cutoff ${cutoff}`);
      assert.equal(withheld, 2);
    }
  });
});
