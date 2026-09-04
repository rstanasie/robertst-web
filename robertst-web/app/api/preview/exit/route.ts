import { draftMode } from "next/headers";
import { NextResponse } from "next/server";

/** Leaves preview mode and lands on the page as a reader sees it. */
export async function GET(request: Request) {
  (await draftMode()).disable();

  const slug = new URL(request.url).searchParams.get("slug");
  const target = slug && /^[a-z0-9-]+$/.test(slug) ? `/myths/${slug}` : "/";

  return NextResponse.redirect(new URL(target, request.url));
}
