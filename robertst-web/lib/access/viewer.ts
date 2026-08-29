import "server-only";

import { cookies } from "next/headers";

/**
 * The seam a real subscription provider replaces.
 *
 * Today entitlement is a signed-out-by-default cookie, which is enough to build
 * and demonstrate both experiences. When Stripe (or anything else) arrives, the
 * only thing that has to change is the body of `getViewer` — every access
 * decision in the app already goes through it, and none of them look at the
 * cookie directly.
 */

export type Viewer = {
  isSubscriber: boolean;
};

export const SUBSCRIBER_COOKIE = "amphora_subscriber";

export async function getViewer(): Promise<Viewer> {
  const jar = await cookies();
  return { isSubscriber: jar.get(SUBSCRIBER_COOKIE)?.value === "1" };
}
