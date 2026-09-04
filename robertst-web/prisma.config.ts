import "dotenv/config";

import { defineConfig } from "prisma/config";

/**
 * Prisma 7 reads connection details from here rather than from the schema.
 *
 * `DIRECT_DATABASE_URL` exists for hosted Postgres that sits behind a
 * connection pooler: PgBouncer in transaction mode cannot run migrations, so
 * the CLI needs the unpooled endpoint while the app keeps the pooled one.
 * Locally the two are the same and only DATABASE_URL is set.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node --import tsx --conditions=react-server prisma/seed.ts",
  },
  datasource: {
    url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
  },
});
