import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isValidSlug, slugify, uniqueSlug } from "@/lib/cms/slug";

describe("slugs", () => {
  it("turns a title into a URL-safe slug", () => {
    assert.equal(
      slugify("Prometheus and the Theft of Fire"),
      "prometheus-and-the-theft-of-fire",
    );
  });

  it("strips accents, punctuation and curly quotes", () => {
    assert.equal(slugify("Dionysos’ Return — Naxos"), "dionysos-return-naxos");
    assert.equal(slugify("Ariadné & Theseus!"), "ariadne-theseus");
  });

  it("never produces a slug with leading, trailing or doubled hyphens", () => {
    for (const title of ["  --Hello--  ", "!!!", "a   b", "-x-"]) {
      const slug = slugify(title);
      assert.ok(slug === "" || isValidSlug(slug), `"${title}" produced "${slug}"`);
    }
  });

  it("rejects slugs that are not URL-safe", () => {
    assert.equal(isValidSlug("the-theft"), true);
    assert.equal(isValidSlug("The-Theft"), false);
    assert.equal(isValidSlug("-leading"), false);
    assert.equal(isValidSlug("double--hyphen"), false);
    assert.equal(isValidSlug(""), false);
  });

  it("suffixes until it finds one free", () => {
    assert.equal(uniqueSlug("medusa", new Set()), "medusa");
    assert.equal(uniqueSlug("medusa", new Set(["medusa"])), "medusa-2");
    assert.equal(uniqueSlug("medusa", new Set(["medusa", "medusa-2"])), "medusa-3");
  });

  it("falls back rather than returning an empty slug", () => {
    assert.equal(uniqueSlug("!!!", new Set()), "story");
  });
});
