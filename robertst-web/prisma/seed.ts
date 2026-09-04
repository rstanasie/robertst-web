import "dotenv/config";

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient, RevisionKind, StoryAccess, StoryStatus } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { hashPassword } from "../lib/auth/password";

/**
 * Seeds the database from the markdown that used to be the content source.
 *
 * This is the migration from file-backed content to Postgres, and it is written
 * to be re-runnable: everything is keyed by slug and upserted, so running it
 * against a database that already holds these stories updates them instead of
 * duplicating them. It never touches a story whose slug it does not recognise.
 *
 * The markdown lives in prisma/seed-data/ precisely because it is no longer
 * content — it is a fixture, kept so a fresh clone has something to look at.
 */

const SEED_DATA = join(__dirname, "seed-data");
const MYTHS = join(SEED_DATA, "myths");
const WEEKS = join(SEED_DATA, "weeks");

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env first.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

type Frontmatter = Record<string, string>;

function splitFrontmatter(source: string): { data: Frontmatter; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);

  if (!match) {
    throw new Error("seed file has no frontmatter block");
  }

  const data: Frontmatter = {};

  for (const line of match[1].split(/\r?\n/)) {
    const at = line.indexOf(":");
    if (at === -1) continue;
    data[line.slice(0, at).trim()] = line
      .slice(at + 1)
      .trim()
      .replace(/^["'](.*)["']$/, "$1");
  }

  return { data, body: source.slice(match[0].length).trim() };
}

type SeedStory = {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  previewUntil: string | null;
  publishedAt: Date;
};

function readStories(): SeedStory[] {
  return readdirSync(MYTHS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((slug) => {
      const meta = JSON.parse(readFileSync(join(MYTHS, slug, "meta.json"), "utf8")) as {
        title: string;
      };

      // The last version on disk is the current telling.
      const versions = readdirSync(join(MYTHS, slug))
        .map((name) => /^v(\d+)\.md$/.exec(name))
        .filter((match): match is RegExpExecArray => match !== null)
        .map((match) => Number(match[1]))
        .sort((a, b) => a - b);

      const version = versions.at(-1);

      if (version === undefined) {
        throw new Error(`${slug}: no vN.md files`);
      }

      const { data, body } = splitFrontmatter(
        readFileSync(join(MYTHS, slug, `v${version}.md`), "utf8"),
      );

      return {
        slug,
        title: meta.title,
        excerpt: data.teaser ?? "",
        content: body,
        previewUntil: data.previewUntil ?? null,
        publishedAt: new Date(data.publishedAt ?? Date.now()),
      };
    });
}

type SeedWeek = {
  week: string;
  publishedAt: string;
  entries: { mythSlug: string; access: string; vaseSlot: number | null }[];
};

const readWeeks = (): SeedWeek[] =>
  existsSync(WEEKS)
    ? readdirSync(WEEKS)
        .filter((name) => name.endsWith(".json"))
        .sort()
        .map((name) => JSON.parse(readFileSync(join(WEEKS, name), "utf8")) as SeedWeek)
    : [];

async function seedAdmin(): Promise<string> {
  const email = (process.env.ADMIN_EMAIL ?? "admin@localhost").toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });

  if (existing) {
    console.log(`  admin ${email} already exists`);
    return existing.id;
  }

  const password = process.env.ADMIN_PASSWORD ?? "amphora-dev-password";
  const user = await prisma.user.create({
    data: {
      email,
      name: "Editor",
      role: "ADMIN",
      passwordHash: await hashPassword(password),
    },
    select: { id: true },
  });

  console.log(`  created admin ${email}`);

  if (!process.env.ADMIN_PASSWORD) {
    console.log("  password: amphora-dev-password  (set ADMIN_PASSWORD to choose your own)");
  }

  return user.id;
}

/**
 * Creates the story, its first revision, and publishes it in one go — the same
 * sequence the CMS performs, so seeded stories are indistinguishable from
 * hand-written ones.
 */
async function seedStory(story: SeedStory, authorId: string): Promise<string> {
  const existing = await prisma.story.findUnique({
    where: { slug: story.slug },
    select: { id: true, revisionCounter: true, publishedVersion: true, publishedAt: true },
  });

  const snapshot = {
    title: story.title,
    slug: story.slug,
    subtitle: null,
    excerpt: story.excerpt,
    content: story.content,
    previewUntil: story.previewUntil,
    seoTitle: null,
    seoDescription: null,
  };

  if (existing) {
    const number = existing.revisionCounter + 1;
    const revision = await prisma.storyRevision.create({
      data: { ...snapshot, storyId: existing.id, number, kind: RevisionKind.PUBLISH, authorId },
    });

    await prisma.story.update({
      where: { id: existing.id },
      data: {
        ...snapshot,
        status: StoryStatus.PUBLISHED,
        publishedRevisionId: revision.id,
        publishedVersion: existing.publishedVersion + 1,
        revisionCounter: number,
        lockVersion: { increment: 1 },
        updatedById: authorId,
        publishedAt: existing.publishedAt ?? story.publishedAt,
      },
    });

    console.log(`  updated ${story.slug} (revision ${number})`);
    return existing.id;
  }

  const created = await prisma.story.create({
    data: {
      ...snapshot,
      status: StoryStatus.DRAFT,
      revisionCounter: 1,
      createdById: authorId,
      updatedById: authorId,
    },
    select: { id: true },
  });

  const revision = await prisma.storyRevision.create({
    data: { ...snapshot, storyId: created.id, number: 1, kind: RevisionKind.PUBLISH, authorId },
  });

  await prisma.story.update({
    where: { id: created.id },
    data: {
      status: StoryStatus.PUBLISHED,
      publishedRevisionId: revision.id,
      publishedVersion: 1,
      publishedAt: story.publishedAt,
      lockVersion: { increment: 1 },
    },
  });

  console.log(`  created ${story.slug}`);
  return created.id;
}

async function seedCollection(week: SeedWeek, storyIds: Map<string, string>): Promise<void> {
  const slug = week.week.toLowerCase();

  const collection = await prisma.collection.upsert({
    where: { slug },
    create: {
      slug,
      name: `Week ${week.week.replace(/^(\d{4})-W/, "$1 · ")}`,
      publishedAt: new Date(week.publishedAt),
    },
    update: { publishedAt: new Date(week.publishedAt) },
    select: { id: true },
  });

  await prisma.collectionEntry.deleteMany({ where: { collectionId: collection.id } });

  await prisma.collectionEntry.createMany({
    data: week.entries.flatMap((entry, index) => {
      const storyId = storyIds.get(entry.mythSlug);
      return storyId
        ? [
            {
              collectionId: collection.id,
              storyId,
              position: index,
              access: entry.access === "locked" ? StoryAccess.LOCKED : StoryAccess.PREVIEW,
              amphoraSlot: entry.vaseSlot,
            },
          ]
        : [];
    }),
  });

  console.log(`  collection ${slug} with ${week.entries.length} entries`);
}

async function main(): Promise<void> {
  console.log("seeding:");

  const authorId = await seedAdmin();

  const storyIds = new Map<string, string>();
  for (const story of readStories()) {
    storyIds.set(story.slug, await seedStory(story, authorId));
  }

  const weeks = readWeeks();
  for (const week of weeks) {
    await seedCollection(week, storyIds);
  }

  // The newest week is the one the site presents.
  const newest = weeks.at(-1);
  if (newest) {
    const slug = newest.week.toLowerCase();
    await prisma.collection.updateMany({ where: { NOT: { slug } }, data: { active: false } });
    await prisma.collection.update({ where: { slug }, data: { active: true } });
    console.log(`  active collection: ${slug}`);
  }

  console.log("done");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
