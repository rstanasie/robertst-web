"use strict";

// Shared plumbing for the content scripts. These run under plain Node, outside
// the bundler, so they read the TypeScript sources as text the same way
// scripts/amphora/build.js already reads angles — a shape change fails loudly
// here rather than drifting silently.

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "..");
const CONTENT = path.join(root, "content");
const MYTHS = path.join(CONTENT, "myths");
const WEEKS = path.join(CONTENT, "weeks");

function vaseSlotAngles() {
  const source = fs.readFileSync(path.join(root, "lib/content/vase.ts"), "utf8");
  const match = /VASE_SLOT_ANGLES\s*=\s*\[([^\]]*)\]/.exec(source);
  if (!match) throw new Error("could not find VASE_SLOT_ANGLES in lib/content/vase.ts");
  return match[1]
    .split(",")
    .map((piece) => piece.trim())
    .filter(Boolean)
    .map(Number);
}

function constant(name) {
  const source = fs.readFileSync(path.join(root, "lib/content/vase.ts"), "utf8");
  const match = new RegExp(`${name}\\s*=\\s*(\\d+)`).exec(source);
  if (!match) throw new Error(`could not find ${name} in lib/content/vase.ts`);
  return Number(match[1]);
}

const listMyths = () =>
  fs
    .readdirSync(MYTHS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

const readMyth = (slug) => JSON.parse(fs.readFileSync(path.join(MYTHS, slug, "meta.json"), "utf8"));

const listVersions = (slug) =>
  fs
    .readdirSync(path.join(MYTHS, slug))
    .map((name) => /^v(\d+)\.md$/.exec(name))
    .filter(Boolean)
    .map((match) => Number(match[1]))
    .sort((a, b) => a - b);

function readVersionFrontmatter(slug, version) {
  const file = path.join(MYTHS, slug, `v${version}.md`);
  const source = fs.readFileSync(file, "utf8");
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
  if (!block) throw new Error(`${file}: no frontmatter`);
  const data = {};
  for (const line of block[1].split(/\r?\n/)) {
    const at = line.indexOf(":");
    if (at === -1) continue;
    data[line.slice(0, at).trim()] = line.slice(at + 1).trim().replace(/^["'](.*)["']$/, "$1");
  }
  return data;
}

const listWeeks = () =>
  fs
    .readdirSync(WEEKS)
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.replace(/\.json$/, ""))
    .sort();

const readWeek = (week) => JSON.parse(fs.readFileSync(path.join(WEEKS, `${week}.json`), "utf8"));

function activeWeek(now = new Date()) {
  const published = listWeeks()
    .map(readWeek)
    .filter((collection) => new Date(collection.publishedAt) <= now)
    .sort((a, b) => a.week.localeCompare(b.week));
  const active = published.at(-1);
  if (!active) throw new Error("no published week in content/weeks");
  return active;
}

module.exports = {
  root,
  MYTHS,
  vaseSlotAngles,
  constant,
  listMyths,
  readMyth,
  listVersions,
  readVersionFrontmatter,
  listWeeks,
  readWeek,
  activeWeek,
};
