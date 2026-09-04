import "dotenv/config";

import { createHmac, randomBytes } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Mints a CMS session cookie for the first admin and prints it, so the tool can
 * be exercised from a script or a terminal without driving the sign-in form.
 * Development only — it refuses to run in production.
 */

if (process.env.NODE_ENV === "production") {
  throw new Error("dev-session is not for production.");
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main(): Promise<void> {
  const email = process.env.ADMIN_EMAIL ?? "admin@localhost";
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });

  if (!user) {
    throw new Error(`no user ${email} — run \`npm run cms:user\` first.`);
  }

  const token = randomBytes(32).toString("base64url");
  const secret = process.env.AUTH_SECRET ?? "development-only-insecure-secret";

  await prisma.session.create({
    data: {
      tokenHash: createHmac("sha256", secret).update(token).digest("base64url"),
      userId: user.id,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  process.stdout.write(`amphora_cms_session=${token}\n`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
