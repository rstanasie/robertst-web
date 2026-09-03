import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

import { prisma } from "@/lib/db";
import { createStory, getStoryForEditor, saveDraft } from "@/lib/cms/stories";
import type { StoryInput } from "@/lib/cms/validation";
import type { SessionUser } from "@/lib/auth/session";
import { hasDatabase, input, makeUser, resetDatabase } from "./helpers";

describe("write hardening", { skip: hasDatabase ? false : "TEST_DATABASE_URL is not set" }, () => {
  let user: SessionUser;

  beforeEach(async () => {
    await resetDatabase();
    user = await makeUser();
  });

  after(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  it("writes only the content fields, whatever else it is handed", async () => {
    const created = await createStory(user, "Sisyphus");
    assert.ok(created.ok);

    const story = await getStoryForEditor(created.data.id);
    assert.ok(story);

    // Anything beyond the known fields must be ignored rather than written —
    // including columns a caller has no business setting.
    const smuggled = {
      ...input({ slug: "sisyphus", title: "Sisyphus" }),
      status: "PUBLISHED",
      publishedVersion: 99,
      lockVersion: 500,
      id: "somebody-elses-id",
      createdById: "nobody",
    } as unknown as StoryInput;

    const saved = await saveDraft(user, story.id, smuggled, story.lockVersion);
    assert.ok(saved.ok, saved.ok ? "" : saved.message);

    const after = await getStoryForEditor(story.id);
    assert.ok(after);
    assert.equal(after.id, story.id);
    assert.equal(after.status, "DRAFT");
    assert.equal(after.publishedVersion, 0);
    assert.equal(after.lockVersion, story.lockVersion + 1);
    assert.ok(after.content.includes("First part"));
  });
});
