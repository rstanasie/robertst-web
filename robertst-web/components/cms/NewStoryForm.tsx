"use client";

import { useActionState } from "react";

import { createStoryAction } from "@/app/admin/actions";
import { idle } from "@/lib/cms/form-state";
import SubmitButton from "./SubmitButton";

/**
 * A new story needs one thing: what it is called. Everything else is written in
 * the editor, so asking for it here would be a form standing between the writer
 * and the page.
 */
export default function NewStoryForm() {
  const [state, action] = useActionState(createStoryAction, idle);

  return (
    <form action={action} className="cms-actions">
      <label htmlFor="new-title" className="sr-only">
        New story title
      </label>

      <input
        id="new-title"
        name="title"
        type="text"
        placeholder="Title of a new story"
        required
        maxLength={200}
        style={{
          font: "inherit",
          padding: "0.4375rem 0.625rem",
          border: "1px solid var(--rule)",
          borderRadius: "var(--radius)",
          background: "var(--paper-2)",
          minWidth: "16rem",
        }}
      />

      <SubmitButton className="cms-btn cms-btn--gold" pending="Creating…">
        New story
      </SubmitButton>

      {state.status === "error" && (
        <span className="cms-field__error" role="alert">
          {state.message}
        </span>
      )}
    </form>
  );
}
