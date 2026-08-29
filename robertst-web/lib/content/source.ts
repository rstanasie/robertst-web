import "server-only";

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { splitFrontmatter, splitParts } from "./markdown";
import type { Myth, MythSlug, StoryVersion, WeeklyCollection } from "./types";

/**
 * Reads content off disk. `server-only` is the guarantee that matters here: if
 * a client component ever imports this module — directly or through a barrel —
 * the build fails instead of quietly shipping every story to the browser.
 *
 * Publishing is `git push`. There is no CMS and no database; a week is a JSON
 * file and a story version is a markdown file that is never edited again.
 */

const CONTENT = join(process.cwd(), "content");
const MYTHS = join(CONTENT, "myths");
const WEEKS = join(CONTENT, "weeks");

const read = (path: string) => readFileSync(path, "utf8");

function requireField(data: Record<string, string>, key: string, where: string): string {
  const value = data[key];
  if (value === undefined || value === "") {
    throw new Error(`${where}: missing \`${key}\` in frontmatter`);
  }
  return value;
}

export function listMythSlugs(): MythSlug[] {
  return readdirSync(MYTHS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export function loadMyth(slug: MythSlug): Myth {
  const meta = JSON.parse(read(join(MYTHS, slug, "meta.json"))) as Partial<Myth>;
  if (!meta.id || !meta.title) {
    throw new Error(`content/myths/${slug}/meta.json needs \`id\` and \`title\``);
  }
  if (meta.slug && meta.slug !== slug) {
    throw new Error(`content/myths/${slug}/meta.json declares slug "${meta.slug}"`);
  }
  return { id: meta.id, slug, title: meta.title };
}

export function listVersions(slug: MythSlug): number[] {
  return readdirSync(join(MYTHS, slug))
    .map((name) => /^v(\d+)\.md$/.exec(name))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => Number(match[1]))
    .sort((a, b) => a - b);
}

export function loadVersion(slug: MythSlug, version: number): StoryVersion {
  const where = `content/myths/${slug}/v${version}.md`;
  const myth = loadMyth(slug);
  const { data, body } = splitFrontmatter(read(join(MYTHS, slug, `v${version}.md`)));

  const declared = Number(requireField(data, "version", where));
  if (declared !== version) {
    throw new Error(`${where}: declares version ${declared} but is named v${version}`);
  }

  const parts = splitParts(body);
  if (parts.length === 0) {
    throw new Error(`${where}: no \`##\` parts found`);
  }

  const previewUntil = requireField(data, "previewUntil", where);
  if (!parts.some((part) => part.id === previewUntil)) {
    throw new Error(
      `${where}: previewUntil "${previewUntil}" is not a part id (have: ${parts.map((p) => p.id).join(", ")})`,
    );
  }

  return {
    mythId: myth.id,
    mythSlug: slug,
    version,
    publishedAt: requireField(data, "publishedAt", where),
    teaser: requireField(data, "teaser", where),
    drawing: data.drawing ? `/images/myths/${data.drawing}` : null,
    previewUntil,
    parts,
  };
}

export function listWeeks(): string[] {
  return readdirSync(WEEKS)
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.replace(/\.json$/, ""))
    .sort();
}

export function loadWeek(week: string): WeeklyCollection {
  const collection = JSON.parse(read(join(WEEKS, `${week}.json`))) as WeeklyCollection;
  if (collection.week !== week) {
    throw new Error(`content/weeks/${week}.json declares week "${collection.week}"`);
  }
  return collection;
}

/**
 * The active week is the most recent one whose publishedAt has passed, so a
 * future week can sit in the repo fully written and go live on its own.
 */
export function loadActiveWeek(now = new Date()): WeeklyCollection {
  const candidates = listWeeks()
    .map(loadWeek)
    .filter((collection) => new Date(collection.publishedAt) <= now)
    .sort((a, b) => a.week.localeCompare(b.week));

  const active = candidates.at(-1);
  if (!active) {
    throw new Error("no published week found in content/weeks");
  }
  return active;
}
