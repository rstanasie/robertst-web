"use client";

import { useActionState } from "react";

import { createCollectionAction } from "@/app/admin/actions";
import { idle } from "@/lib/cms/form-state";
import SubmitButton from "./SubmitButton";

export default function NewCollectionForm() {
  const [state, action] = useActionState(createCollectionAction, idle);

  return (
    <form action={action} className="cms-actions">
      <label htmlFor="collection-name" className="sr-only">
        New collection name
      </label>

      <input
        id="collection-name"
        name="name"
        type="text"
        placeholder="Week 2026 · 35"
        required
        maxLength={120}
        style={{
          font: "inherit",
          padding: "0.4375rem 0.625rem",
          border: "1px solid var(--rule)",
          borderRadius: "var(--radius)",
          background: "var(--paper-2)",
        }}
      />

      <SubmitButton className="cms-btn cms-btn--gold" pending="Creating…">
        New collection
      </SubmitButton>

      {state.status === "error" && (
        <span className="cms-field__error" role="alert">
          {state.message}
        </span>
      )}
    </form>
  );
}
