"use strict";

// Publishing invariants. Run before shipping a week; `npm run content:check`.
//
// The loader in lib/content already validates a single file — frontmatter,
// part ids, previewUntil — and it runs during `next build`. What it cannot see
// is the shape of a *week*, which is what this checks.

const fs = require("fs");
const path = require("path");

const C = require("./lib.js");

const angles = C.vaseSlotAngles();
const VASE_SLOTS = angles.length;
const STORIES_PER_WEEK = C.constant("STORIES_PER_WEEK");
const PREVIEW_PER_WEEK = C.constant("PREVIEW_STORIES_PER_WEEK");

let failures = 0;
const ok = (message) => console.log(`  ok  ${message}`);
const fail = (message) => {
  failures += 1;
  console.log(`FAIL  ${message}`);
};
const check = (condition, message) => (condition ? ok(message) : fail(message));

// --- myths -----------------------------------------------------------------
const slugs = C.listMyths();
check(slugs.length > 0, `${slugs.length} myths in content/myths`);

for (const slug of slugs) {
  const meta = C.readMyth(slug);
  check(meta.id && meta.title, `${slug}: meta.json has id and title`);
  check(!meta.slug || meta.slug === slug, `${slug}: meta.json slug matches its directory`);

  const versions = C.listVersions(slug);
  check(versions.length > 0, `${slug}: has at least one version`);
  check(
    versions.every((version, index) => version === index + 1),
    `${slug}: versions are 1..${versions.length} with no gaps (${versions.join(", ")})`,
  );

  for (const version of versions) {
    const data = C.readVersionFrontmatter(slug, version);
    check(Number(data.version) === version, `${slug} v${version}: frontmatter version matches filename`);
    check(Boolean(data.teaser), `${slug} v${version}: has a teaser`);
    check(Boolean(data.previewUntil), `${slug} v${version}: declares previewUntil`);
    if (data.drawing) {
      const file = path.join(C.root, "public/images/myths", data.drawing);
      check(fs.existsSync(file), `${slug} v${version}: drawing ${data.drawing} exists`);
    }
  }
}

// --- weeks -----------------------------------------------------------------
for (const week of C.listWeeks()) {
  const collection = C.readWeek(week);
  const entries = collection.entries ?? [];
  const label = `week ${week}`;

  check(collection.week === week, `${label}: declares its own name`);
  check(Boolean(collection.publishedAt), `${label}: has publishedAt`);
  check(entries.length === STORIES_PER_WEEK, `${label}: has exactly ${STORIES_PER_WEEK} stories (${entries.length})`);

  const previews = entries.filter((entry) => entry.access === "preview").length;
  const locked = entries.filter((entry) => entry.access === "locked").length;
  check(
    previews === PREVIEW_PER_WEEK && locked === STORIES_PER_WEEK - PREVIEW_PER_WEEK,
    `${label}: ${PREVIEW_PER_WEEK} preview + ${STORIES_PER_WEEK - PREVIEW_PER_WEEK} locked (got ${previews}/${locked})`,
  );

  const uniqueSlugs = new Set(entries.map((entry) => entry.mythSlug));
  check(uniqueSlugs.size === entries.length, `${label}: no myth appears twice`);

  for (const entry of entries) {
    check(slugs.includes(entry.mythSlug), `${label}: "${entry.mythSlug}" exists in content/myths`);
    if (slugs.includes(entry.mythSlug)) {
      check(
        C.listVersions(entry.mythSlug).includes(entry.version),
        `${label}: ${entry.mythSlug} v${entry.version} exists`,
      );
    }
  }

  const slots = entries.map((entry) => entry.vaseSlot).filter((slot) => slot !== null);
  check(slots.length === Math.min(VASE_SLOTS, entries.length), `${label}: fills all ${VASE_SLOTS} vase slots`);
  check(new Set(slots).size === slots.length, `${label}: no two stories share a vase slot`);
  check(
    slots.every((slot) => Number.isInteger(slot) && slot >= 0 && slot < VASE_SLOTS),
    `${label}: vase slots are within 0..${VASE_SLOTS - 1}`,
  );
}

console.log(failures === 0 ? "\nall content checks passed" : `\n${failures} content check(s) failed`);
if (failures > 0) process.exit(1);
