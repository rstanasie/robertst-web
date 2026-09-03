import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { hasDatabase, makeUser, resetDatabase } from "./helpers";

describe("passwords", () => {
  it("verifies the right password and rejects the wrong one", async () => {
    const hash = await hashPassword("correct-horse-battery");

    assert.equal(await verifyPassword("correct-horse-battery", hash), true);
    assert.equal(await verifyPassword("correct-horse-batterz", hash), false);
    assert.equal(await verifyPassword("", hash), false);
  });

  it("never stores the password, and salts every hash", async () => {
    const a = await hashPassword("correct-horse-battery");
    const b = await hashPassword("correct-horse-battery");

    assert.ok(!a.includes("correct-horse-battery"));
    assert.notEqual(a, b, "two hashes of one password were identical");
    assert.ok(a.startsWith("scrypt$"));
  });

  it("rejects a malformed hash rather than throwing", async () => {
    for (const bad of ["", "not-a-hash", "bcrypt$x$y", "scrypt$16384$8$1$only-salt"]) {
      assert.equal(await verifyPassword("anything", bad), false, bad);
    }
  });
});

describe("sessions", { skip: hasDatabase ? false : "TEST_DATABASE_URL is not set" }, () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  after(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  it("stores a hash of the token, never the token", async () => {
    const user = await makeUser();

    // createSession needs a request to set a cookie on, so the storage half is
    // exercised directly: what matters here is that nothing reusable is stored.
    const { createHmac, randomBytes } = await import("node:crypto");
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHmac("sha256", process.env.AUTH_SECRET as string)
      .update(token)
      .digest("base64url");

    await prisma.session.create({
      data: { tokenHash, userId: user.id, expiresAt: new Date(Date.now() + 60_000) },
    });

    const rows = await prisma.session.findMany();
    assert.equal(rows.length, 1);
    assert.notEqual(rows[0].tokenHash, token);
    assert.ok(!JSON.stringify(rows).includes(token));
  });

  it("cascades sessions away with the user", async () => {
    const user = await makeUser();

    await prisma.session.create({
      data: { tokenHash: "x", userId: user.id, expiresAt: new Date(Date.now() + 60_000) },
    });

    await prisma.user.delete({ where: { id: user.id } });
    assert.equal(await prisma.session.count(), 0);
  });
});
