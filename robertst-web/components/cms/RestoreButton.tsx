"use client";

import { restoreRevisionAction } from "@/app/admin/actions";
import SubmitButton from "./SubmitButton";

/**
 * Restoring is safe by construction — the current draft is already the newest
 * revision, so nothing is lost — and the confirmation says so rather than
 * implying a risk that does not exist. What it does warn about is the one thing
 * that can surprise: an older revision may carry an older slug.
 */
export default function RestoreButton({
  storyId,
  revisionId,
  lockVersion,
  number,
  nextNumber,
  slugChanges,
}: {
  storyId: string;
  revisionId: string;
  lockVersion: number;
  number: number;
  nextNumber: number;
  slugChanges: boolean;
}) {
  const message = [
    `Restore revision ${number}?`,
    "",
    `It is copied into the draft as revision ${nextNumber}. Nothing is deleted, and this does not publish anything.`,
    slugChanges ? "\nThis revision has a different slug, which will be restored too." : "",
    "\nIf you have unsaved work in another tab, save it first — it is not in the history yet.",
  ].join("\n");

  return (
    <form
      action={restoreRevisionAction}
      onSubmit={(event) => {
        if (!window.confirm(message)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="storyId" value={storyId} />
      <input type="hidden" name="revisionId" value={revisionId} />
      <input type="hidden" name="lockVersion" value={lockVersion} />

      <SubmitButton className="cms-btn cms-btn--gold" pending="Restoring…">
        Restore this version
      </SubmitButton>
    </form>
  );
}
