import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Password hashing with scrypt from the standard library.
 *
 * scrypt is memory-hard and built into Node, so this needs no dependency and
 * no native build step. The parameters below are the Node defaults scaled to
 * roughly 100ms on a laptop; they are stored in the encoded hash, so raising
 * them later re-hashes old passwords on next login rather than locking anyone
 * out.
 */

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export const MIN_PASSWORD_LENGTH = 10;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scrypt(password, salt, KEY_LENGTH, PARAMS);

  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [scheme, n, r, p, salt, digest] = encoded.split("$");

  if (scheme !== "scrypt" || !salt || !digest) {
    return false;
  }

  const expected = Buffer.from(digest, "base64url");

  const actual = await scrypt(password, Buffer.from(salt, "base64url"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: PARAMS.maxmem,
  });

  // Same length by construction, but timingSafeEqual throws rather than
  // returning false if that ever stops being true.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
