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
 * Construction is deferred until the first query. That matters for deployment:
 * `next build` imports every route module to collect its configuration, so a
 * client built at module scope would make DATABASE_URL a *build-time*
 * requirement and fail the very first deploy of a project whose environment
 * variables have not been filled in yet. Nothing about compiling this app needs
 * a database, so nothing about importing this module asks for one.
 *
 * The global cache is the standard guard against dev-mode hot reload opening a
 * new pool on every edit until Postgres refuses connections.
 */

declare global {
  var __amphoraPrisma: PrismaClient | undefined;
}

let client: PrismaClient | undefined;

function connect(): PrismaClient {
  if (client) {
    return client;
  }

  if (globalThis.__amphoraPrisma) {
    client = globalThis.__amphoraPrisma;
    return client;
  }

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and point it at a Postgres database.",
    );
  }

  client = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  if (process.env.NODE_ENV !== "production") {
    globalThis.__amphoraPrisma = client;
  }

  return client;
}

/**
 * Behaves exactly like a PrismaClient; the first property read is what actually
 * opens the pool. Methods are bound to the real client so `this` is correct
 * inside Prisma, and reads use the client as the receiver so its own lazy
 * delegate getters resolve normally.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const real = connect();
    const value = Reflect.get(real, property, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
