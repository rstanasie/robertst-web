import "server-only";

import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import { fail, ok } from "@/lib/cms/errors";
import type { ActionResult } from "@/lib/cms/errors";
import { LIMITS } from "@/lib/cms/validation";
import { slugify } from "@/lib/cms/slug";
import { MAX_UPLOAD_BYTES, UPLOADABLE_TYPES, putObject, removeObject, storageStatus } from "./storage";

/**
 * The media library. Rows point at objects; nothing here holds bytes.
 *
 * Alt text is a first-class, editable column rather than something derived from
 * a filename, because the story imagery is part of the reading experience and a
 * generated "icarus-final-2.png" helps nobody.
 */

export type MediaRow = {
  id: string;
  url: string;
  alt: string;
  width: number | null;
  height: number | null;
  mimeType: string | null;
  bytes: number | null;
  provider: string;
  createdAt: Date;
  usedBy: { id: string; title: string; role: "featured" | "og" }[];
};

export async function listMedia(): Promise<MediaRow[]> {
  const rows = await prisma.mediaAsset.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      featuredForStories: { select: { id: true, title: true } },
      ogForStories: { select: { id: true, title: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    url: row.url,
    alt: row.alt,
    width: row.width,
    height: row.height,
    mimeType: row.mimeType,
    bytes: row.bytes,
    provider: row.provider,
    createdAt: row.createdAt,
    usedBy: [
      ...row.featuredForStories.map((story) => ({ ...story, role: "featured" as const })),
      ...row.ogForStories.map((story) => ({ ...story, role: "og" as const })),
    ],
  }));
}

/**
 * PNG, JPEG, GIF and WebP all carry their pixel dimensions in the first few
 * bytes. Reading them here means the public page can reserve the right space
 * without a layout shift, and without a decoding dependency.
 */
function readDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // PNG: IHDR is always the first chunk.
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }

  // GIF: little-endian logical screen descriptor.
  if (bytes.length > 10 && bytes[0] === 0x47 && bytes[1] === 0x49) {
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }

  // JPEG: walk the segment chain to the first start-of-frame.
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;

    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }

      const marker = bytes[offset + 1];
      const length = view.getUint16(offset + 2);

      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
      }

      offset += 2 + length;
    }
  }

  // WebP: the VP8X / VP8L / VP8 chunk shapes differ; only the simple ones here.
  if (bytes.length > 30 && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") {
    const chunk = String.fromCharCode(...bytes.slice(12, 16));

    if (chunk === "VP8X") {
      const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
      const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
      return { width, height };
    }
  }

  return null;
}

export async function uploadMedia(
  user: SessionUser,
  file: File,
  alt: string,
): Promise<ActionResult<{ id: string }>> {
  const status = storageStatus();

  if (!status.available) {
    return fail("unsupported", status.reason);
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return fail("invalid", `Images must be under ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
  }

  if (!UPLOADABLE_TYPES.includes(file.type as (typeof UPLOADABLE_TYPES)[number])) {
    return fail("invalid", `That file type is not accepted (${file.type || "unknown"}).`);
  }

  if (alt.length > LIMITS.alt) {
    return fail("invalid", "That alt text is too long.", { alt: "Too long." });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const dimensions = readDimensions(bytes);
  const extension = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const key = `stories/${slugify(file.name.replace(/\.[^.]+$/, "")) || "image"}.${extension}`;

  const stored = await putObject(file, key);

  const created = await prisma.mediaAsset.create({
    data: {
      url: stored.url,
      pathname: stored.pathname,
      provider: stored.provider,
      alt,
      mimeType: file.type,
      bytes: file.size,
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
      createdById: user.id,
    },
    select: { id: true },
  });

  return ok(created);
}

/**
 * The escape hatch while no storage provider is configured, and a legitimate
 * option afterwards: an image already hosted somewhere is referenced, not
 * copied.
 */
export async function recordExternalMedia(
  user: SessionUser,
  url: string,
  alt: string,
): Promise<ActionResult<{ id: string }>> {
  if (!url) {
    return fail("invalid", "Choose a file or paste an image URL.");
  }

  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return fail("invalid", "That is not a valid URL.", { url: "Not a valid URL." });
  }

  if (parsed.protocol !== "https:") {
    return fail("invalid", "Image URLs must be https.", { url: "Must start with https://" });
  }

  if (alt.length > LIMITS.alt) {
    return fail("invalid", "That alt text is too long.", { alt: "Too long." });
  }

  const created = await prisma.mediaAsset.create({
    data: { url: parsed.toString(), provider: "external", alt, createdById: user.id },
    select: { id: true },
  });

  return ok(created);
}

export async function updateMediaAlt(mediaId: string, alt: string): Promise<ActionResult<void>> {
  if (alt.length > LIMITS.alt) {
    return fail("invalid", "That alt text is too long.");
  }

  const updated = await prisma.mediaAsset.updateMany({ where: { id: mediaId }, data: { alt } });
  return updated.count > 0 ? ok(undefined) : fail("not-found", "That image no longer exists.");
}

export async function attachMedia(
  storyId: string,
  role: "featured" | "og",
  mediaId: string | null,
): Promise<ActionResult<void>> {
  const updated = await prisma.story.updateMany({
    where: { id: storyId },
    data: role === "featured" ? { featuredImageId: mediaId } : { ogImageId: mediaId },
  });

  return updated.count > 0 ? ok(undefined) : fail("not-found", "That story no longer exists.");
}

/**
 * Deleting an asset clears it from stories and revisions rather than cascading:
 * history must survive housekeeping. The object is removed from storage after
 * the row, so a failed delete leaves an orphaned object rather than a dead link.
 */
export async function deleteMedia(mediaId: string): Promise<ActionResult<void>> {
  const asset = await prisma.mediaAsset.findUnique({
    where: { id: mediaId },
    select: { pathname: true, provider: true },
  });

  if (!asset) {
    return fail("not-found", "That image no longer exists.");
  }

  await prisma.mediaAsset.delete({ where: { id: mediaId } });

  if (asset.pathname) {
    await removeObject(asset.pathname, asset.provider);
  }

  return ok(undefined);
}
