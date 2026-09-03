import { NextResponse } from "next/server";

import { buildNewsletterIssue } from "@/lib/newsletter";

/**
 * The weekly issue as JSON, so the payload can be inspected without a sending
 * provider attached. Whatever eventually sends the letter reads the same
 * builder; this route exists to make it reviewable.
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production" && process.env.NEWSLETTER_PREVIEW !== "1") {
    return new NextResponse("Not found", { status: 404 });
  }

  const origin = new URL(request.url).origin;
  const issue = await buildNewsletterIssue(origin);

  return issue
    ? NextResponse.json(issue)
    : new NextResponse("No active collection", { status: 404 });
}
