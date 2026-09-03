import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { RevisionKind, StoryAccess, StoryStatus } from "@prisma/client";

import { prisma } from "@/lib/db";
import { createStory, getStoryForEditor, publishStory, saveDraft, setStatus } from "@/lib/cms/stories";
import { listRevisions, restoreRevision } from "@/lib/cms/revisions";
import { accessForStory, getDraftStory, getPublishedStory } from "@/lib/content/published";
import { activateCollection, addStory, createCollection, setEntryAccess } from "@/lib/cms/collections";
import type { SessionUser } from "@/lib/auth/session";
import { hasDatabase, input, makeUser, resetDatabase } from "./helpers";

/**
 * The workflow, against a real database.
 *
 * These are the behaviours that would be quietly catastrophic if they broke: a
 * draft becoming readable, a publish that does not stick, a save that
 * overwrites someone else's, history that loses a version.
 */
describe("story workflow", { skip: hasDatabase ? false : "TEST_DATABASE_URL is not set" }, () => {
  let user: SessionUser;

  before(async () => {
    await resetDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
    user = await makeUser();
  });

  after(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  const newStory = async (title = "Prometheus") => {
    const created = await createStory(user, title);
    assert.ok(created.ok);
    return created.data.id;
  };

  const load = async (id: string) => {
    const story = await getStoryForEditor(id);
    assert.ok(story);
    return story;
  };

  it("creates a draft with its first revision", async () => {
    const id = await newStory();
    const story = await load(id);

    assert.equal(story.status, StoryStatus.DRAFT);
    assert.equal(story.slug, "prometheus");
    assert.equal(story.publishedRevisionId, null);

    const revisions = await listRevisions(id);
    assert.equal(revisions.length, 1);
    assert.equal(revisions[0].kind, RevisionKind.CREATED);
  });

  it("keeps a draft off the public site", async () => {
    const id = await newStory();
    await saveDraft(user, id, input(), (await load(id)).lockVersion);

    assert.equal(await getPublishedStory("prometheus"), null);

    // Preview mode reads the same story through a different door.
    const draft = await getDraftStory("prometheus");
    assert.ok(draft);
    assert.equal(draft.status, StoryStatus.DRAFT);
    assert.ok(draft.content.includes("First part"));
  });

  it("publishes, and only then serves the story publicly", async () => {
    const id = await newStory();
    const published = await publishStory(user, id, input(), (await load(id)).lockVersion);
    assert.ok(published.ok);

    const live = await getPublishedStory("prometheus");
    assert.ok(live);
    assert.equal(live.title, "Prometheus");
    assert.equal(live.version, 1);
    assert.ok(live.publishedAt);

    const story = await load(id);
    assert.equal(story.status, StoryStatus.PUBLISHED);
    assert.ok(story.publishedRevisionId);
  });

  it("refuses to publish a story with no content", async () => {
    const id = await newStory();
    const result = await publishStory(
      user,
      id,
      input({ content: "", excerpt: "" }),
      (await load(id)).lockVersion,
    );

    assert.equal(result.ok, false);
    assert.ok(!result.ok && result.fields?.content);
    assert.equal((await load(id)).status, StoryStatus.DRAFT);
  });

  it("does not show edits to a published story until they are published", async () => {
    const id = await newStory();
    await publishStory(user, id, input(), (await load(id)).lockVersion);

    await saveDraft(
      user,
      id,
      input({ content: "## One {#one}\n\nRewritten entirely." }),
      (await load(id)).lockVersion,
    );

    const live = await getPublishedStory("prometheus");
    assert.ok(live?.content.includes("First part"), "readers saw an unpublished edit");

    const story = await load(id);
    assert.equal(story.hasUnpublishedChanges, true);

    await publishStory(
      user,
      id,
      input({ content: "## One {#one}\n\nRewritten entirely." }),
      story.lockVersion,
    );

    const updated = await getPublishedStory("prometheus");
    assert.ok(updated);
    assert.ok(updated.content.includes("Rewritten entirely."));
    assert.equal(updated.version, 2);
  });

  it("unpublishes without losing anything", async () => {
    const id = await newStory();
    await publishStory(user, id, input(), (await load(id)).lockVersion);

    const before = await listRevisions(id);
    await setStatus(user, id, StoryStatus.DRAFT);

    assert.equal(await getPublishedStory("prometheus"), null);

    const story = await load(id);
    assert.equal(story.status, StoryStatus.DRAFT);
    assert.equal(story.publishedRevisionId, null);
    assert.ok(story.publishedAt, "the original publication date is kept");
    assert.ok(story.content.includes("First part"), "the draft survives");

    const after = await listRevisions(id);
    assert.ok(after.length > before.length, "the unpublish is recorded");
    assert.equal(after[0].kind, RevisionKind.UNPUBLISH);
  });

  it("keeps an archived story out of public view", async () => {
    const id = await newStory();
    await publishStory(user, id, input(), (await load(id)).lockVersion);
    await setStatus(user, id, StoryStatus.ARCHIVED);

    assert.equal(await getPublishedStory("prometheus"), null);
  });

  it("enforces slug uniqueness", async () => {
    await newStory("Prometheus");
    const second = await newStory("Medusa");

    const clash = await saveDraft(
      user,
      second,
      input({ title: "Medusa", slug: "prometheus" }),
      (await load(second)).lockVersion,
    );

    assert.equal(clash.ok, false);
    assert.equal(!clash.ok && clash.code, "conflict");
  });

  it("auto-suffixes a duplicate title rather than failing", async () => {
    await newStory("Prometheus");
    const second = await newStory("Prometheus");

    assert.equal((await load(second)).slug, "prometheus-2");
  });

  it("refuses a save made against a stale copy", async () => {
    const id = await newStory();
    const stale = (await load(id)).lockVersion;

    const first = await saveDraft(user, id, input({ title: "First writer" }), stale);
    assert.ok(first.ok);

    const second = await saveDraft(user, id, input({ title: "Second writer" }), stale);
    assert.equal(second.ok, false);
    assert.equal(!second.ok && second.code, "stale");

    assert.equal((await load(id)).title, "First writer", "the newer edit was overwritten");
  });

  it("writes a revision per meaningful save and none for a no-op", async () => {
    const id = await newStory();

    const first = await saveDraft(user, id, input(), (await load(id)).lockVersion);
    assert.ok(first.ok && first.data.revisionCreated);

    const again = await saveDraft(user, id, input(), (await load(id)).lockVersion);
    assert.ok(again.ok);
    assert.equal(again.data.revisionCreated, false);

    assert.equal((await listRevisions(id)).length, 2);
  });

  it("keeps the working draft equal to the newest revision", async () => {
    const id = await newStory();

    await saveDraft(user, id, input(), (await load(id)).lockVersion);
    await publishStory(user, id, input({ title: "Retitled" }), (await load(id)).lockVersion);

    const story = await load(id);
    const newest = (await listRevisions(id))[0];

    assert.equal(newest.title, story.title);
    assert.equal(newest.number, story.revisionCount);
  });

  it("restores an old revision as a new one, keeping the history intact", async () => {
    const id = await newStory();

    await saveDraft(user, id, input({ content: "## One {#one}\n\nVersion A." }), (await load(id)).lockVersion);
    await saveDraft(user, id, input({ content: "## One {#one}\n\nVersion B." }), (await load(id)).lockVersion);
    await saveDraft(user, id, input({ content: "## One {#one}\n\nVersion C." }), (await load(id)).lockVersion);

    const history = await listRevisions(id);
    const versionA = history.find((revision) => revision.number === 2);
    assert.ok(versionA);

    const story = await load(id);
    const restored = await restoreRevision(user, id, versionA.id, story.lockVersion);
    assert.ok(restored.ok);
    assert.equal(restored.data.restoredFrom, 2);

    const after = await listRevisions(id);
    assert.equal(after.length, history.length + 1, "restoring deleted history");
    assert.equal(after[0].kind, RevisionKind.RESTORE);
    assert.equal(after[0].restoredFromNumber, 2);

    // Every earlier revision is still exactly where it was.
    for (const revision of history) {
      const still = after.find((entry) => entry.id === revision.id);
      assert.ok(still, `revision ${revision.number} disappeared`);
      assert.equal(still.number, revision.number);
    }

    assert.ok((await load(id)).content.includes("Version A."));
  });

  it("does not publish as a side effect of restoring", async () => {
    const id = await newStory();
    await publishStory(user, id, input({ content: "## One {#one}\n\nLive." }), (await load(id)).lockVersion);
    await saveDraft(user, id, input({ content: "## One {#one}\n\nDraft." }), (await load(id)).lockVersion);

    const history = await listRevisions(id);
    const livePublish = history.find((revision) => revision.isLive);
    assert.ok(livePublish);

    const first = history.at(-1);
    assert.ok(first);

    await restoreRevision(user, id, first.id, (await load(id)).lockVersion);

    const stillLive = await getPublishedStory("prometheus");
    assert.ok(stillLive?.content.includes("Live."), "restoring changed what readers see");
  });

  it("takes access from the active collection, and falls back when there is none", async () => {
    const id = await newStory();
    await publishStory(user, id, input(), (await load(id)).lockVersion);

    // Not in any collection: the ordinary preview deal, so a shared link works.
    assert.equal(await accessForStory(id), StoryAccess.PREVIEW);

    const collection = await createCollection("Week one");
    assert.ok(collection.ok);
    await activateCollection(collection.data.id);

    const entry = await addStory(collection.data.id, id);
    assert.ok(entry.ok);
    await setEntryAccess(entry.data.entryId, StoryAccess.LOCKED);

    assert.equal(await accessForStory(id), StoryAccess.LOCKED);
  });
});
