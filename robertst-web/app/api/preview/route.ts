import { draftMode } from "next/headers";
import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

/**
 * Turns on Draft Mode for the signed-in editor, then sends them to the real
 * story route.
 *
 * The authorization is the session, not the URL: there is no token to leak and
 * no query parameter to guess. `lib/preview.ts` re-checks the session on every
 * render, so this cookie alone opens nothing.
 *
 * Worth naming the one thing a GET costs here: another site could cause the
 * editor's own browser to enable draft mode. That shows the editor their own
 * drafts, which they may already see, and writes nothing.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return new NextResponse("Not found", { status: 404 });
  }

  const slug = new URL(request.url).searchParams.get("slug") ?? "";
  const story = await prisma.story.findUnique({ where: { slug }, select: { slug: true } });

  if (!story) {
    return new NextResponse("No such story", { status: 404 });
  }

  (await draftMode()).enable();

  return NextResponse.redirect(new URL(`/myths/${story.slug}`, request.url));
}
