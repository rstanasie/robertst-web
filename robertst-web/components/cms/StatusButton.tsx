"use client";

import { useState, useTransition } from "react";
import type { StoryStatus } from "@prisma/client";

import { setStatusAction } from "@/app/admin/actions";

/**
 * A status change with a confirmation.
 *
 * Calls the action directly through a transition rather than wrapping itself in
 * a <form>: this button also lives inside the editor's form, and a nested form
 * is invalid HTML that React refuses to hydrate.
 *
 * The dialog is a courtesy — the action re-checks the session and the legality
 * of the transition on the server, and would refuse an illegal one whether or
 * not this button was ever rendered.
 */
export default function StatusButton({
  storyId,
  to,
  label,
  confirm,
  className = "cms-btn cms-btn--quiet",
}: {
  storyId: string;
  to: StoryStatus;
  label: string;
  confirm: string;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    if (!window.confirm(confirm)) {
      return;
    }

    setError(null);

    const form = new FormData();
    form.set("storyId", storyId);
    form.set("to", to);

    startTransition(async () => {
      try {
        await setStatusAction(form);
      } catch (cause) {
        // A refused transition is a message, not a crash: without this it
        // would reject inside the transition and take the page down.
        setError(cause instanceof Error ? cause.message : "That did not work.");
      }
    });
  };

  return (
    <>
      <button type="button" className={className} onClick={run} disabled={pending}>
        {pending ? "…" : label}
      </button>

      {error && (
        <span className="cms-field__error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
