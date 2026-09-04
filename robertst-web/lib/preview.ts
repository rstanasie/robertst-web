import "server-only";

import { draftMode } from "next/headers";
import { StoryStatus } from "@prisma/client";

import { getSessionUser } from "@/lib/auth/session";
import { getDraftStory, getPublishedStory } from "@/lib/content/published";
import type { PublicStory } from "@/lib/content/published";

/**
 * Preview mode.
 *
 * Draft Mode gives the real route rendering unpublished content, which is the
 * whole point — a preview that is a separate page is a preview of a different
 * page. But the draft-mode cookie is a flag, not a credential: on its own it
 * would turn every draft into a public URL for anyone who guessed the endpoint.
 *
 * So a preview requires *both*: draft mode enabled, and a live CMS session on
 * this request. Enabling draft mode is itself behind a signed-in POST, and the
 * session is re-checked on every render, so revoking access ends previews
 * immediately rather than whenever the cookie happens to expire.
 */

export type StoryForRequest = {
  story: PublicStory;
  isPreview: boolean;
  status: StoryStatus;
};

export async function isPreviewRequest(): Promise<boolean> {
  const { isEnabled } = await draftMode();

  if (!isEnabled) {
    return false;
  }

  return (await getSessionUser()) !== null;
}

export async function readStoryForRequest(slug: string): Promise<StoryForRequest | null> {
  if (await isPreviewRequest()) {
    const draft = await getDraftStory(slug);

    if (draft) {
      return { story: draft, isPreview: true, status: draft.status };
    }
  }

  const published = await getPublishedStory(slug);

  return published
    ? { story: published, isPreview: false, status: StoryStatus.PUBLISHED }
    : null;
}
