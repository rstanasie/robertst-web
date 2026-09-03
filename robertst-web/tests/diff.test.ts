import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { diffLines, summarise } from "@/lib/cms/diff";

describe("diff", () => {
  it("reports no changes for identical text", () => {
    const lines = diffLines("a\nb\nc", "a\nb\nc");
    assert.equal(summarise(lines).added, 0);
    assert.equal(summarise(lines).removed, 0);
    assert.ok(lines.every((line) => line.op === "equal"));
  });

  it("finds an inserted line without touching its neighbours", () => {
    const lines = diffLines("a\nc", "a\nb\nc");
    const totals = summarise(lines);

    assert.equal(totals.added, 1);
    assert.equal(totals.removed, 0);
    assert.equal(lines.find((line) => line.op === "insert")?.text, "b");
  });

  it("marks the changed words when a line is rewritten", () => {
    const lines = diffLines("he stole fire", "he stole light");
    const inserted = lines.find((line) => line.op === "insert");

    assert.ok(inserted?.words, "expected word-level detail on a rewritten line");
    assert.deepEqual(
      inserted.words.filter((word) => word.op === "insert").map((word) => word.text),
      ["light"],
    );
  });

  it("reconstructs both sides from the diff", () => {
    const before = "one\ntwo\nthree\nfour";
    const after = "one\ntwo and a half\nthree\nfive";
    const lines = diffLines(before, after);

    const rebuild = (skip: "insert" | "delete") =>
      lines
        .filter((line) => line.op !== skip)
        .map((line) => line.text)
        .join("\n");

    assert.equal(rebuild("insert"), before);
    assert.equal(rebuild("delete"), after);
  });
});
