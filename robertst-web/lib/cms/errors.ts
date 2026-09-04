/**
 * Failures the CMS expects and can explain, as opposed to bugs.
 *
 * Server actions return these as values rather than throwing, so the editor can
 * render a conflict warning or a field error instead of an error boundary.
 */

export type FieldErrors = Record<string, string>;

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; code: ActionErrorCode; message: string; fields?: FieldErrors };

export type ActionErrorCode =
  | "unauthorized"
  | "not-found"
  | "invalid"
  | "conflict"
  | "stale"
  | "unsupported";

export const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });

export const fail = <T = never>(
  code: ActionErrorCode,
  message: string,
  fields?: FieldErrors,
): ActionResult<T> => ({ ok: false, code, message, fields });

/** Thrown only where a caller genuinely cannot continue — a missing session. */
export class AuthorizationError extends Error {
  constructor(message = "Not authorized") {
    super(message);
    this.name = "AuthorizationError";
  }
}
