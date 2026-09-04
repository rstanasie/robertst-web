import Link from "next/link";

import { requireUserOrRedirect } from "@/lib/auth/guard";
import { listMedia } from "@/lib/media/service";
import { MAX_UPLOAD_BYTES, storageStatus } from "@/lib/media/storage";
import { mediaAction } from "../../actions";
import MediaUploadForm from "@/components/cms/MediaUploadForm";

const size = (bytes: number | null) =>
  bytes === null ? "—" : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export default async function Media() {
  await requireUserOrRedirect("/admin/media");

  const [assets, storage] = await Promise.all([listMedia(), Promise.resolve(storageStatus())]);

  return (
    <>
      <div className="cms-head">
        <div>
          <p className="cms-eyebrow">Library</p>
          <h1>Images</h1>
          <p>
            Files live in object storage; the database keeps the URL and the alt text. Alt text is
            editable here because the imagery is part of the reading, not decoration.
          </p>
        </div>
      </div>

      {!storage.available && (
        <p className="cms-note" role="status">
          <strong>Uploading is off.</strong> {storage.reason}
        </p>
      )}

      <div className="cms-panel">
        <h2>Add an image</h2>
        <MediaUploadForm
          canUpload={storage.available}
          maxBytes={MAX_UPLOAD_BYTES}
          provider={storage.available ? storage.provider : null}
        />
      </div>

      <div className="cms-table-wrap">
        <table className="cms-table">
          <thead>
            <tr>
              <th scope="col">Image</th>
              <th scope="col">Alt text</th>
              <th scope="col">Used by</th>
              <th scope="col">Size</th>
              <th scope="col">
                <span className="sr-only">Delete</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {assets.map((asset) => (
              <tr key={asset.id}>
                <td style={{ width: "9rem" }}>
                  {/* Arbitrary remote URLs; not worth an image-domain allowlist here. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={asset.url} alt={asset.alt} className="cms-thumb" />
                  <span className="cms-table__slug">
                    {asset.provider}
                    {asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : ""}
                  </span>
                </td>

                <td>
                  <form action={mediaAction} className="cms-actions">
                    <input type="hidden" name="op" value="alt" />
                    <input type="hidden" name="mediaId" value={asset.id} />
                    <label htmlFor={`alt-${asset.id}`} className="sr-only">
                      Alt text
                    </label>
                    <input
                      id={`alt-${asset.id}`}
                      name="alt"
                      type="text"
                      defaultValue={asset.alt}
                      maxLength={300}
                      placeholder="Describe the image"
                      style={{
                        font: "inherit",
                        padding: "0.3125rem 0.5rem",
                        border: "1px solid var(--rule)",
                        borderRadius: "var(--radius)",
                        background: "var(--paper-2)",
                        minWidth: "14rem",
                      }}
                    />
                    <button type="submit" className="cms-btn cms-btn--quiet">
                      Save
                    </button>
                  </form>
                </td>

                <td>
                  {asset.usedBy.length === 0 ? (
                    <span className="cms-field__hint">Unused</span>
                  ) : (
                    asset.usedBy.map((use) => (
                      <div key={`${use.id}-${use.role}`}>
                        <Link href={`/admin/stories/${use.id}`} className="cms-table__slug">
                          {use.title} ({use.role})
                        </Link>
                      </div>
                    ))
                  )}
                </td>

                <td className="cms-table__when">{size(asset.bytes)}</td>

                <td>
                  <form action={mediaAction} className="cms-table__actions">
                    <input type="hidden" name="op" value="delete" />
                    <input type="hidden" name="mediaId" value={asset.id} />
                    <button type="submit" className="cms-btn cms-btn--danger">
                      Delete
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {assets.length === 0 && <p className="cms-empty">No images yet.</p>}
      </div>
    </>
  );
}
