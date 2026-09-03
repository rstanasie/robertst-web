import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { Role, User } from "@prisma/client";

import { prisma } from "@/lib/db";

/**
 * CMS sessions.
 *
 * A session is a row, not a self-contained token. That costs one indexed query
 * per request and buys the thing a stateless JWT cannot give: signing out, or
 * revoking a stolen cookie, takes effect immediately.
 *
 * The cookie carries 256 bits of randomness. What is stored is an HMAC of it
 * under AUTH_SECRET, so a database dump yields no usable session, and rotating
 * AUTH_SECRET invalidates every session at once without touching the database.
 */

export const SESSION_COOKIE = "amphora_cms_session";
const SESSION_DAYS = 30;

export type SessionUser = Pick<User, "id" | "email" | "name" | "role">;

function secret(): string {
  const value = process.env.AUTH_SECRET;

  if (!value) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET must be set in production.");
    }
    // Development convenience only: sessions do not survive a restart, which is
    // the correct trade for not having to configure anything to run the CMS.
    return "development-only-insecure-secret";
  }

  return value;
}

const digest = (token: string): string =>
  createHmac("sha256", secret()).update(token).digest("base64url");

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: { tokenHash: digest(token), userId, expiresAt },
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

/**
 * The signed-in user, or null. Every admin page and every mutation calls this;
 * nothing decides authorization from a client-supplied value.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: digest(token) },
    select: {
      expiresAt: true,
      user: { select: { id: true, email: true, name: true, role: true } },
    },
  });

  if (!session || session.expiresAt <= new Date()) {
    return null;
  }

  return session.user;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;

  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: digest(token) } });
  }

  jar.delete(SESSION_COOKIE);
}

/** Housekeeping. Cheap enough to run opportunistically on sign-in. */
export async function pruneExpiredSessions(): Promise<void> {
  await prisma.session.deleteMany({ where: { expiresAt: { lte: new Date() } } });
}

export const hasRole = (user: SessionUser, ...roles: Role[]): boolean =>
  roles.includes(user.role);

/**
 * Constant-time string compare, for the one place a secret arrives as a value
 * rather than as a hash: the preview token check.
 */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
