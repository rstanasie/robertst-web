"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { StoryAccess, StoryStatus } from "@prisma/client";

import { createSession, destroySession, pruneExpiredSessions } from "@/lib/auth/session";
import { requireUser } from "@/lib/auth/guard";
import { verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";
import type { ActionResult } from "@/lib/cms/errors";
import type { FormState } from "@/lib/cms/form-state";
import * as collections from "@/lib/cms/collections";
import { restoreRevision } from "@/lib/cms/revisions";
import { createStory, publishStory, saveDraft, setStatus } from "@/lib/cms/stories";
import { contentFingerprint, isId, parseStoryForm } from "@/lib/cms/validation";
import {
  attachMedia,
  deleteMedia,
  recordExternalMedia,
  updateMediaAlt,
  uploadMedia,
} from "@/lib/media/service";

/**
 * Every CMS mutation. Each one starts by proving who is asking — the admin
 * layout's redirect is for the person, this is the actual control. A server
 * action is a public HTTP endpoint; treating it as protected because the button
 * is only rendered behind a login is exactly the mistake to avoid.
 */



const asError = (result: Extract<ActionResult<unknown>, { ok: false }>): FormState => ({
  status: "error",
  message: result.message,
  fields: result.fields,
});

// ── Authentication ─────────────────────────────────────────────────────────

/**
 * Sign-in is deliberately vague about which half was wrong, and always spends
 * roughly the same time, so the form cannot be used to enumerate accounts.
 */
export async function signInAction(_state: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/admin");

  if (!email || !password) {
    return { status: "error", message: "Enter your email and password." };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true },
  });

  // Hash against a throwaway value when the account does not exist, so a
  // missing account costs the same as a wrong password.
  const hash = user?.passwordHash ?? "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAA";
  const valid = await verifyPassword(password, hash);

  if (!user || !valid) {
    return { status: "error", message: "That email and password do not match." };
  }

  await pruneExpiredSessions();
  await createSession(user.id);

  redirect(next.startsWith("/admin") ? next : "/admin");
}

export async function signOutAction(): Promise<void> {
  await destroySession();
  redirect("/admin/login");
}

// ── Stories ────────────────────────────────────────────────────────────────

export async function createStoryAction(_state: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const result = await createStory(user, String(form.get("title") ?? ""));

  if (!result.ok) {
    return asError(result);
  }

  redirect(`/admin/stories/${result.data.id}`);
}

/**
 * Save, or save and publish, depending on which button was pressed.
 *
 * One action for both because they submit the same form: publishing what is on
 * screen is a single editorial act, and it should leave one revision saying so
 * rather than a save followed by a publish.
 */
export async function saveStoryAction(_state: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();

  const storyId = String(form.get("storyId") ?? "");
  const lockVersion = Number(form.get("lockVersion"));
  const intent = String(form.get("intent") ?? "save");

  if (!isId(storyId) || !Number.isInteger(lockVersion)) {
    return { status: "error", message: "That story reference is not valid." };
  }

  const input = parseStoryForm(form);

  if (intent === "publish") {
    const result = await publishStory(user, storyId, input, lockVersion);

    if (!result.ok) {
      return asError(result);
    }

    revalidatePath("/");
    revalidatePath(`/myths/${input.slug}`);
    revalidatePath(`/admin/stories/${storyId}`);

    return {
      status: "ok",
      message: `Published. Revision ${result.data.revisionNumber} is what readers now see.`,
      lockVersion: result.data.lockVersion,
      saved: contentFingerprint(input),
    };
  }

  const result = await saveDraft(user, storyId, input, lockVersion);

  if (!result.ok) {
    return asError(result);
  }

  revalidatePath(`/admin/stories/${storyId}`);

  return {
    status: "ok",
    message: result.data.revisionCreated
      ? `Saved as revision ${result.data.revisionNumber}.`
      : "Saved. Nothing had changed, so no new revision was written.",
    lockVersion: result.data.lockVersion,
    saved: contentFingerprint(input),
  };
}

export async function setStatusAction(form: FormData): Promise<void> {
  const user = await requireUser();

  const storyId = String(form.get("storyId") ?? "");
  const to = String(form.get("to") ?? "");

  if (!isId(storyId) || !(to in StoryStatus)) {
    throw new Error("Invalid status change.");
  }

  const result = await setStatus(user, storyId, to as StoryStatus);

  if (!result.ok) {
    throw new Error(result.message);
  }

  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath(`/admin/stories/${storyId}`);
}

export async function restoreRevisionAction(form: FormData): Promise<void> {
  const user = await requireUser();

  const storyId = String(form.get("storyId") ?? "");
  const revisionId = String(form.get("revisionId") ?? "");
  const lockVersion = Number(form.get("lockVersion"));

  if (!isId(storyId) || !isId(revisionId) || !Number.isInteger(lockVersion)) {
    throw new Error("Invalid restore request.");
  }

  const result = await restoreRevision(user, storyId, revisionId, lockVersion);

  if (!result.ok) {
    throw new Error(result.message);
  }

  revalidatePath(`/admin/stories/${storyId}`);
  redirect(`/admin/stories/${storyId}?restored=${result.data.restoredFrom}`);
}

// ── Collections ────────────────────────────────────────────────────────────

export async function createCollectionAction(
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  await requireUser();
  const result = await collections.createCollection(String(form.get("name") ?? ""));

  if (!result.ok) {
    return asError(result);
  }

  revalidatePath("/admin/collections");
  return { status: "ok", message: "Collection created." };
}

export async function collectionEntryAction(form: FormData): Promise<void> {
  await requireUser();

  const op = String(form.get("op") ?? "");
  const entryId = String(form.get("entryId") ?? "");
  const collectionId = String(form.get("collectionId") ?? "");

  if (op === "activate") {
    if (!isId(collectionId)) throw new Error("Invalid collection.");
    await collections.activateCollection(collectionId);
  } else if (op === "add") {
    const storyId = String(form.get("storyId") ?? "");
    if (!isId(collectionId) || !isId(storyId)) throw new Error("Invalid entry.");
    await collections.addStory(collectionId, storyId);
  } else if (op === "remove") {
    if (!isId(entryId)) throw new Error("Invalid entry.");
    await collections.removeEntry(entryId);
  } else if (op === "access") {
    const access = String(form.get("access") ?? "");
    if (!isId(entryId) || !(access in StoryAccess)) throw new Error("Invalid access.");
    await collections.setEntryAccess(entryId, access as StoryAccess);
  } else if (op === "slot") {
    const raw = String(form.get("slot") ?? "");
    if (!isId(entryId)) throw new Error("Invalid entry.");
    await collections.setEntrySlot(entryId, raw === "" ? null : Number(raw));
  } else if (op === "move") {
    const direction = Number(form.get("direction"));
    if (!isId(entryId) || (direction !== 1 && direction !== -1)) throw new Error("Invalid move.");
    await collections.moveEntry(entryId, direction);
  } else {
    throw new Error("Unknown operation.");
  }

  revalidatePath("/");
  revalidatePath("/admin/collections");
}

// ── Media ──────────────────────────────────────────────────────────────────

export async function uploadMediaAction(_state: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();

  const file = form.get("file");
  const url = String(form.get("url") ?? "").trim();
  const alt = String(form.get("alt") ?? "").trim();

  const result =
    file instanceof File && file.size > 0
      ? await uploadMedia(user, file, alt)
      : await recordExternalMedia(user, url, alt);

  if (!result.ok) {
    return asError(result);
  }

  const storyId = String(form.get("storyId") ?? "");
  const role = String(form.get("role") ?? "");

  if (isId(storyId) && (role === "featured" || role === "og")) {
    await attachMedia(storyId, role, result.data.id);
    revalidatePath(`/admin/stories/${storyId}`);
  }

  revalidatePath("/admin/media");
  return { status: "ok", message: "Image added." };
}

export async function mediaAction(form: FormData): Promise<void> {
  await requireUser();

  const op = String(form.get("op") ?? "");
  const mediaId = String(form.get("mediaId") ?? "");

  if (op === "alt") {
    if (!isId(mediaId)) throw new Error("Invalid image.");
    await updateMediaAlt(mediaId, String(form.get("alt") ?? ""));
  } else if (op === "delete") {
    if (!isId(mediaId)) throw new Error("Invalid image.");
    await deleteMedia(mediaId);
  } else if (op === "attach" || op === "detach") {
    const storyId = String(form.get("storyId") ?? "");
    const role = String(form.get("role") ?? "");
    if (!isId(storyId) || (role !== "featured" && role !== "og")) throw new Error("Invalid attach.");
    await attachMedia(storyId, role, op === "attach" ? mediaId : null);
    revalidatePath(`/admin/stories/${storyId}`);
  } else {
    throw new Error("Unknown operation.");
  }

  revalidatePath("/admin/media");
}
