import { StoryAccess, StoryStatus } from "@prisma/client";

import { requireUserOrRedirect } from "@/lib/auth/guard";
import { listCollections } from "@/lib/cms/collections";
import { listStories } from "@/lib/cms/stories";
import { VASE_SLOT_ANGLES, VASE_SLOTS } from "@/lib/content/vase";
import { collectionEntryAction } from "../../actions";
import NewCollectionForm from "@/components/cms/NewCollectionForm";

/**
 * Curating what the site shows.
 *
 * A collection is the answer to "what is on the amphora this week", but nothing
 * about it is weekly: it is a named, ordered set of stories, exactly one of
 * which is active. Giving an entry a panel number is what paints it on the
 * vessel; entries without one are still in the collection and still linked, but
 * are not carried on the pot.
 */
export default async function Collections() {
  await requireUserOrRedirect("/admin/collections");

  const [collections, stories] = await Promise.all([listCollections(), listStories("published")]);

  return (
    <>
      <div className="cms-head">
        <div>
          <p className="cms-eyebrow">Presentation</p>
          <h1>Collections</h1>
          <p>
            The active collection is what the homepage presents. The amphora has {VASE_SLOTS}{" "}
            painted panels — a property of the 3D model, not of the collection — so a collection may
            hold more stories than the vessel can carry.
          </p>
        </div>

        <NewCollectionForm />
      </div>

      {collections.map((collection) => {
        const inCollection = new Set(collection.entries.map((entry) => entry.storyId));
        const available = stories.filter((story) => !inCollection.has(story.id));

        return (
          <div className="cms-panel" key={collection.id}>
            <div className="cms-head" style={{ marginBottom: "0.75rem" }}>
              <div>
                <h2 style={{ margin: 0 }}>
                  {collection.name}{" "}
                  {collection.active && (
                    <span className="cms-pill" data-status="PUBLISHED">
                      Active
                    </span>
                  )}
                </h2>
                <p className="cms-field__hint" style={{ marginTop: "0.25rem" }}>
                  {collection.entries.length} stor
                  {collection.entries.length === 1 ? "y" : "ies"} ·{" "}
                  {collection.entries.filter((entry) => entry.amphoraSlot !== null).length} on the
                  amphora
                </p>
              </div>

              {!collection.active && (
                <form action={collectionEntryAction}>
                  <input type="hidden" name="op" value="activate" />
                  <input type="hidden" name="collectionId" value={collection.id} />
                  <button type="submit" className="cms-btn cms-btn--primary">
                    Make active
                  </button>
                </form>
              )}
            </div>

            {collection.entries.length > 0 && (
              <div className="cms-table-wrap" style={{ boxShadow: "none" }}>
                <table className="cms-table">
                  <thead>
                    <tr>
                      <th scope="col">Order</th>
                      <th scope="col">Story</th>
                      <th scope="col">Reader gets</th>
                      <th scope="col">Amphora panel</th>
                      <th scope="col">
                        <span className="sr-only">Remove</span>
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {collection.entries.map((entry, index) => (
                      <tr key={entry.id}>
                        <td>
                          <span className="cms-actions">
                            <form action={collectionEntryAction}>
                              <input type="hidden" name="op" value="move" />
                              <input type="hidden" name="entryId" value={entry.id} />
                              <input type="hidden" name="direction" value="-1" />
                              <button
                                type="submit"
                                className="cms-btn cms-btn--quiet"
                                disabled={index === 0}
                                aria-label="Move up"
                              >
                                ↑
                              </button>
                            </form>

                            <form action={collectionEntryAction}>
                              <input type="hidden" name="op" value="move" />
                              <input type="hidden" name="entryId" value={entry.id} />
                              <input type="hidden" name="direction" value="1" />
                              <button
                                type="submit"
                                className="cms-btn cms-btn--quiet"
                                disabled={index === collection.entries.length - 1}
                                aria-label="Move down"
                              >
                                ↓
                              </button>
                            </form>
                          </span>
                        </td>

                        <td>
                          <span className="cms-table__title">{entry.title}</span>
                          <span className="cms-table__slug">/myths/{entry.slug}</span>
                          {entry.status !== StoryStatus.PUBLISHED && (
                            <span className="cms-flag">
                              {entry.status.toLowerCase()} — hidden from the site
                            </span>
                          )}
                        </td>

                        <td>
                          <form action={collectionEntryAction}>
                            <input type="hidden" name="op" value="access" />
                            <input type="hidden" name="entryId" value={entry.id} />
                            <select name="access" defaultValue={entry.access}>
                              <option value={StoryAccess.PREVIEW}>Preview (cut off)</option>
                              <option value={StoryAccess.LOCKED}>Locked (sealed)</option>
                            </select>{" "}
                            <button type="submit" className="cms-btn cms-btn--quiet">
                              Set
                            </button>
                          </form>
                        </td>

                        <td>
                          <form action={collectionEntryAction}>
                            <input type="hidden" name="op" value="slot" />
                            <input type="hidden" name="entryId" value={entry.id} />
                            <select name="slot" defaultValue={entry.amphoraSlot ?? ""}>
                              <option value="">Not painted</option>
                              {VASE_SLOT_ANGLES.map((angle, slot) => (
                                <option key={slot} value={slot}>
                                  Panel {slot} · {angle}°
                                </option>
                              ))}
                            </select>{" "}
                            <button type="submit" className="cms-btn cms-btn--quiet">
                              Set
                            </button>
                          </form>
                        </td>

                        <td>
                          <form action={collectionEntryAction} className="cms-table__actions">
                            <input type="hidden" name="op" value="remove" />
                            <input type="hidden" name="entryId" value={entry.id} />
                            <button type="submit" className="cms-btn cms-btn--danger">
                              Remove
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {available.length > 0 && (
              <form
                action={collectionEntryAction}
                className="cms-actions"
                style={{ marginTop: "0.875rem" }}
              >
                <input type="hidden" name="op" value="add" />
                <input type="hidden" name="collectionId" value={collection.id} />

                <label htmlFor={`add-${collection.id}`} className="cms-label">
                  Add
                </label>

                <select id={`add-${collection.id}`} name="storyId">
                  {available.map((story) => (
                    <option key={story.id} value={story.id}>
                      {story.title}
                    </option>
                  ))}
                </select>

                <button type="submit" className="cms-btn">
                  Add to collection
                </button>
              </form>
            )}
          </div>
        );
      })}

      {collections.length === 0 && <p className="cms-empty">No collections yet.</p>}

      <p className="cms-note">
        <strong>Changing which stories are painted needs a texture rebuild.</strong> The amphora&rsquo;s
        figures are baked into an image at build time, not drawn at runtime. After changing panels,
        run <code>npm run content:sync &amp;&amp; npm run amphora</code> and commit the regenerated
        textures. Everything else here takes effect immediately.
      </p>
    </>
  );
}
