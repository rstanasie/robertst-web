import "server-only";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * The one Prisma client.
 *
 * Prisma 7 connects through a driver adapter rather than reading the URL from
 * the schema, so the connection string is resolved here — on the server, from
 * the environment, never bundled. `server-only` makes an accidental import from
 * a client component a build error rather than a leaked credential.
 *
 * The global cache is the standard guard against dev-mode hot reload opening a
 * new pool on every edit until Postgres refuses connections.
 */

declare global {
  var __amphoraPrisma: PrismaClient | undefined;
}

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and point it at a Postgres database.",
    );
  }

  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export const prisma: PrismaClient = globalThis.__amphoraPrisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__amphoraPrisma = prisma;
}
