import "dotenv/config";

/**
 * Preloaded before every test file.
 *
 * Integration tests point the Prisma singleton at TEST_DATABASE_URL, which must
 * be a database they are allowed to empty. When it is unset they skip rather
 * than quietly running against development data.
 */
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

process.env.AUTH_SECRET ??= "test-secret-not-used-anywhere-else";
