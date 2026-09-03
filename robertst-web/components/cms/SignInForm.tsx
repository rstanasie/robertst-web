"use client";

import { useActionState } from "react";

import { signInAction } from "@/app/admin/actions";
import { idle } from "@/lib/cms/form-state";
import SubmitButton from "./SubmitButton";

export default function SignInForm({ next }: { next: string }) {
  const [state, action] = useActionState(signInAction, idle);

  return (
    <form action={action}>
      <h1>Amphora CMS</h1>
      <p>Sign in to write.</p>

      {state.status === "error" && (
        <p className="cms-note cms-note--error" role="alert">
          {state.message}
        </p>
      )}

      <input type="hidden" name="next" value={next} />

      <div className="cms-field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </div>

      <div className="cms-field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      <SubmitButton className="cms-btn cms-btn--primary" pending="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
