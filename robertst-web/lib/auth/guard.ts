import "server-only";

import { redirect } from "next/navigation";

import { AuthorizationError } from "@/lib/cms/errors";
import { getSessionUser } from "./session";
import type { SessionUser } from "./session";

/**
 * The two ways the CMS asks "who is this?".
 *
 * Pages redirect an anonymous visitor to the sign-in form; mutations refuse.
 * Both are enforced on the server. The admin layout calls the first so that no
 * CMS page renders without a session, and every server action calls the second
 * regardless — a hidden button is a courtesy, not a control.
 */

export async function requireUserOrRedirect(returnTo?: string): Promise<SessionUser> {
  const user = await getSessionUser();

  if (!user) {
    const next = returnTo ? `?next=${encodeURIComponent(returnTo)}` : "";
    redirect(`/admin/login${next}`);
  }

  return user;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();

  if (!user) {
    throw new AuthorizationError("Sign in to the CMS to do that.");
  }

  return user;
}
