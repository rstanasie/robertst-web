import { NextResponse } from "next/server";

import { SUBSCRIBER_COOKIE } from "@/lib/access/viewer";

/**
 * Flips the entitlement cookie so both experiences can be exercised locally.
 * Absent in production — a real provider replaces `getViewer`, not this route.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }

  const form = await request.formData();
  const wantsSubscription = form.get("subscriber") === "1";

  const response = NextResponse.redirect(new URL("/subscribe", request.url), 303);

  if (wantsSubscription) {
    response.cookies.set(SUBSCRIBER_COOKIE, "1", { path: "/", httpOnly: true, sameSite: "lax" });
  } else {
    response.cookies.delete(SUBSCRIBER_COOKIE);
  }

  return response;
}
