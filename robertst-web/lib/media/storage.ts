import "server-only";

/**
 * Object storage, behind one interface.
 *
 * Binary data never goes into Postgres: the database stores a URL and the
 * metadata needed to render the image accessibly, and the bytes live wherever
 * this module puts them.
 *
 * Vercel Blob is the provider the site is deployed alongside, and it is loaded
 * lazily so that the package is only required when a token is actually
 * configured. Without one the CMS still works — it accepts external image URLs
 * — and says plainly that uploading is unavailable rather than failing at the
 * moment of upload.
 */

export type StoredObject = {
  url: string;
  pathname: string;
  provider: string;
};

export type StorageStatus =
  | { available: true; provider: string }
  | { available: false; reason: string };

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
  "image/svg+xml",
] as const;

/**
 * SVG is deliberately excluded from upload even though it is a valid image
 * type: an SVG served from the site's own origin is a script execution vector,
 * and no story needs one.
 */
export const UPLOADABLE_TYPES = ALLOWED_TYPES.filter((type) => type !== "image/svg+xml");

export function storageStatus(): StorageStatus {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return { available: true, provider: "vercel-blob" };
  }

  return {
    available: false,
    reason:
      "Uploading needs BLOB_READ_WRITE_TOKEN. Create a Vercel Blob store and add its token, or paste an image URL below.",
  };
}

export async function putObject(file: File, key: string): Promise<StoredObject> {
  const status = storageStatus();

  if (!status.available) {
    throw new Error(status.reason);
  }

  // Imported here rather than at module scope so the dependency is only needed
  // by deployments that actually upload.
  const { put } = (await import("@vercel/blob")) as typeof import("@vercel/blob");

  const blob = await put(key, file, {
    access: "public",
    addRandomSuffix: true,
    contentType: file.type,
  });

  return { url: blob.url, pathname: blob.pathname, provider: "vercel-blob" };
}

export async function removeObject(pathname: string, provider: string): Promise<void> {
  if (provider !== "vercel-blob" || !storageStatus().available) {
    return;
  }

  const { del } = (await import("@vercel/blob")) as typeof import("@vercel/blob");
  await del(pathname);
}
