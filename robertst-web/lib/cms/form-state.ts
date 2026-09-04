import type { FieldErrors } from "./errors";

/**
 * The shape a CMS form gets back from a server action.
 *
 * Kept out of the actions module because a "use server" file may only export
 * async functions — the initial value and the type have to live somewhere the
 * client can import them from directly.
 */
export type FormState = {
  status: "idle" | "error" | "ok";
  message?: string;
  fields?: FieldErrors;
  /** Echoed back so the editor can keep saving without a reload. */
  lockVersion?: number;
  /**
   * Fingerprint of what was actually written. The editor compares the form
   * against it to decide whether there is unsaved work, so "dirty" is derived
   * during render rather than mirrored into state by an effect.
   */
  saved?: string;
};

export const idle: FormState = { status: "idle" };
