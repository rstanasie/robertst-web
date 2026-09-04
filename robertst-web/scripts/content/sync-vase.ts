import "dotenv/config";

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient, StoryStatus } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { VASE_SLOT_ANGLES } from "../../lib/content/vase";

/**
 * Regenerates data/vase-panels.json — the figure list the amphora asset
 * pipeline paints from: `npm run content:sync`.
 *
 * This is the one place the database meets the texture bake, and it exists
 * because the vessel's figures are *baked*, not drawn at runtime. The CMS can
 * change which stories are painted in a click; the painted clay cannot follow
 * until someone runs this and then `npm run amphora`, and commits the result.
 *
 * Keeping that handoff explicit — rather than trying to render figures live —
 * is deliberate: the texture is a 4K image built by a slow offline pipeline,
 * and the alternative is a build step on every publish.
 */

const root = join(__dirname, "..", "..");
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env first.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main(): Promise<void> {
  const collection = await prisma.collection.findFirst({
    where: { active: true },
    orderBy: { publishedAt: "desc" },
    select: {
      slug: true,
      name: true,
      entries: {
        where: { NOT: { amphoraSlot: null } },
        orderBy: { amphoraSlot: "asc" },
        select: {
          amphoraSlot: true,
          access: true,
          story: { select: { slug: true, title: true, status: true } },
        },
      },
    },
  });

  if (!collection) {
    throw new Error("no active collection — activate one in /admin/collections");
  }

  const painted = collection.entries.filter((entry) => entry.amphoraSlot !== null);

  if (painted.length !== VASE_SLOT_ANGLES.length) {
    throw new Error(
      `"${collection.name}" fills ${painted.length} of the amphora's ${VASE_SLOT_ANGLES.length} panels. ` +
        "Every panel needs a story before the texture can be baked.",
    );
  }

  const unpublished = painted.filter((entry) => entry.story.status !== StoryStatus.PUBLISHED);

  if (unpublished.length > 0) {
    throw new Error(
      `painting an unpublished story would put its title on the pot before readers can open it: ${unpublished
        .map((entry) => entry.story.slug)
        .join(", ")}`,
    );
  }

  const file = {
    _generated: "npm run content:sync — generated from the active collection, do not edit",
    collection: collection.slug,
    panels: painted.map((entry) => {
      const slot = entry.amphoraSlot as number;
      // A drawing next to the story wins over a scene hand-authored in
      // figures.js. This is the whole point of the workflow: draw it, drop it
      // in, and the vessel carries it.
      const figure = join("content", "figures", `${entry.story.slug}.png`);
      const hasFigure = existsSync(join(root, figure));

      // Properties of the drawing rather than of the story travel beside it.
      // See content/figures/README.md.
      const sidecar = join(root, "content", "figures", `${entry.story.slug}.json`);
      const meta = existsSync(sidecar)
        ? (JSON.parse(readFileSync(sidecar, "utf8")) as { airborne?: boolean })
        : {};

      return {
        key: entry.story.slug,
        name: entry.story.title,
        angle: VASE_SLOT_ANGLES[slot],
        slot,
        access: entry.access.toLowerCase(),
        ...(hasFigure ? { figure } : {}),
        // A figure that never touches the ground is not stood on the ground line.
        ...(meta.airborne ? { airborne: true } : {}),
      };
    }),
  };

  writeFileSync(join(root, "data/vase-panels.json"), `${JSON.stringify(file, null, 2)}\n`);

  console.log(`${collection.name} -> data/vase-panels.json`);
  for (const panel of file.panels) {
    console.log(
      `  slot ${panel.slot}  ${String(panel.angle).padStart(3)}deg  ${panel.key} (${panel.access})`,
    );
  }
  console.log("\nnow run `npm run amphora` to repaint the vessel, and commit the textures.");
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
