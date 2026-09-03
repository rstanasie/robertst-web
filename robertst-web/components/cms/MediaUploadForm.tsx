"use client";

import { useActionState } from "react";

import { uploadMediaAction } from "@/app/admin/actions";
import { idle } from "@/lib/cms/form-state";
import SubmitButton from "./SubmitButton";

/**
 * One form, two routes in: a file when storage is configured, or the URL of an
 * image that already lives somewhere. The second is what keeps the CMS fully
 * usable before any storage credentials exist.
 */
export default function MediaUploadForm({
  canUpload,
  maxBytes,
  provider,
}: {
  canUpload: boolean;
  maxBytes: number;
  provider: string | null;
}) {
  const [state, action] = useActionState(uploadMediaAction, idle);

  return (
    <form action={action}>
      {state.status === "error" && (
        <p className="cms-note cms-note--error" role="alert">
          {state.message}
        </p>
      )}

      {state.status === "ok" && (
        <p className="cms-note cms-note--ok" role="status">
          {state.message}
        </p>
      )}

      <div className="cms-row">
        {canUpload && (
          <div className="cms-field">
            <label htmlFor="file">Upload a file</label>
            <input id="file" name="file" type="file" accept="image/png,image/jpeg,image/webp,image/avif,image/gif" />
            <p className="cms-field__hint">
              Up to {Math.round(maxBytes / 1024 / 1024)} MB, stored in {provider}. SVG is not
              accepted: served from this origin it would be a script.
            </p>
          </div>
        )}

        <div className="cms-field">
          <label htmlFor="url">{canUpload ? "…or paste an image URL" : "Image URL"}</label>
          <input id="url" name="url" type="url" placeholder="https://…" />
          <p className="cms-field__hint">Referenced, not copied. Must be https.</p>
        </div>

        <div className="cms-field">
          <label htmlFor="alt">Alt text</label>
          <input id="alt" name="alt" type="text" maxLength={300} placeholder="Describe the image" />
        </div>
      </div>

      <SubmitButton className="cms-btn cms-btn--gold" pending="Adding…">
        Add image
      </SubmitButton>
    </form>
  );
}
