"use client";

import { useState } from "react";

/**
 * Share. The native sheet where the browser has one — which is every phone,
 * where sharing actually happens — and a copied link everywhere else.
 *
 * No SDKs, no third-party script, nothing that phones home when the page loads.
 */
export default function ShareStory({
  title,
  teaser,
  path,
}: {
  title: string;
  teaser: string;
  path: string;
}) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    // The browser already knows the origin; NEXT_PUBLIC_SITE_URL would only be
    // a second, staler answer to the same question.
    const url = new URL(path, window.location.origin).toString();

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, text: teaser, url });
        return;
      } catch {
        // Dismissing the sheet rejects. Falling through to copy would be rude.
        return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — the address bar still has the URL.
    }
  };

  return (
    <button type="button" onClick={share} className="myth-share">
      {copied ? "Link copied" : "Share this myth"}
    </button>
  );
}
