import type { Metadata } from "next";
import Link from "next/link";

import MythBackdrop from "@/components/MythBackdrop";
import { getViewer } from "@/lib/access/viewer";

export const metadata: Metadata = {
  title: "Subscribe — The Amphora",
  description: "Five myths a week, entire.",
};

/**
 * The checkout seam. There is no payment provider wired up yet, so this page
 * states the offer and — outside production — lets you switch entitlement on to
 * exercise both experiences. Replacing the form with a real checkout session is
 * the only change this page needs.
 */
export default async function Subscribe() {
  const viewer = await getViewer();
  const showDevToggle = process.env.NODE_ENV !== "production";

  return (
    <>
      <MythBackdrop className="myth-backdrop--quiet" />

      <main className="myth-read myth-read--narrow">
        <p className="myth-read__eyebrow">Subscription</p>

        <h1>The whole Amphora</h1>

        <p className="myth-read__teaser">
          Every week the vessel carries five myths. Three open partway for anyone who turns it.
          Subscribers read all five, entire, including the two that stay sealed.
        </p>

        <ul className="myth-read__offer">
          <li>Five complete stories every week</li>
          <li>New tellings and revisions as they are painted</li>
          <li>A weekly letter when the vessel turns</li>
        </ul>

        {viewer.isSubscriber ? (
          <p className="myth-read__state">You are reading as a subscriber.</p>
        ) : (
          <p className="myth-read__state">Checkout is not connected yet.</p>
        )}

        {showDevToggle && (
          <form method="post" action="/api/dev-subscription" className="myth-read__dev">
            <input type="hidden" name="subscriber" value={viewer.isSubscriber ? "0" : "1"} />
            <button type="submit">
              {viewer.isSubscriber ? "Simulate signing out" : "Simulate a subscription"}
            </button>
            <span>Development only — sets a cookie, no payment involved.</span>
          </form>
        )}

        <Link href="/" className="myth-read__back">
          Back to the amphora
        </Link>
      </main>
    </>
  );
}
