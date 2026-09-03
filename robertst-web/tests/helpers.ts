import { Role } from "@prisma/client";

import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import type { SessionUser } from "@/lib/auth/session";
import type { StoryInput } from "@/lib/cms/validation";

/** Integration tests need a database they may empty. */
export const hasDatabase = Boolean(process.env.TEST_DATABASE_URL);

export async function resetDatabase(): Promise<void> {
  // Order matters only where cascades do not cover it; the joins go first.
  await prisma.collectionEntry.deleteMany();
  await prisma.collection.deleteMany();
  await prisma.story.deleteMany();
  await prisma.storyRevision.deleteMany();
  await prisma.mediaAsset.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}

export async function makeUser(email = "writer@test.local"): Promise<SessionUser> {
  const user = await prisma.user.create({
    data: {
      email,
      name: "Writer",
      role: Role.ADMIN,
      // Cheap by test standards but still the real function.
      passwordHash: await hashPassword("correct-horse-battery"),
    },
    select: { id: true, email: true, name: true, role: true },
  });

  return user;
}

export const input = (overrides: Partial<StoryInput> = {}): StoryInput => ({
  title: "Prometheus",
  slug: "prometheus",
  subtitle: null,
  excerpt: "He stole fire.",
  content: "## One {#one}\n\nFirst part.\n\n## Two {#two}\n\nSecond part.\n\n## Three {#three}\n\nThird part.",
  previewUntil: "one",
  seoTitle: null,
  seoDescription: null,
  featuredImageId: null,
  ogImageId: null,
  ...overrides,
});
