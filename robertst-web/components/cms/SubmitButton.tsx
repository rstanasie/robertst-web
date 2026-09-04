"use client";

import { useFormStatus } from "react-dom";

/**
 * A submit button that knows its form is in flight. Disabling during a save is
 * what stops a double-click writing two revisions.
 */
export default function SubmitButton({
  children,
  pending = "Working…",
  className = "cms-btn",
  name,
  value,
  title,
  formNoValidate,
}: {
  children: React.ReactNode;
  pending?: string;
  className?: string;
  name?: string;
  value?: string;
  title?: string;
  formNoValidate?: boolean;
}) {
  const status = useFormStatus();

  return (
    <button
      type="submit"
      name={name}
      value={value}
      title={title}
      formNoValidate={formNoValidate}
      className={className}
      disabled={status.pending}
    >
      {status.pending ? pending : children}
    </button>
  );
}
