# Amphora figures

The black-figure silhouettes painted onto the 3D vessel, one per story slug.

These are **not** story content — story content is in Postgres. They are inputs
to the offline texture bake in `scripts/amphora/`, which is why they are files
in the repository and not media library uploads: the bake runs under plain Node
at build time, produces a 4K texture atlas, and its output is committed.

    content/figures/<slug>.png     the stencil, produced by
                                   `node scripts/amphora/prepare-figure.js <scene.png> <slug>`
    content/figures/<slug>.json    optional, `{ "airborne": true }`

`airborne` means the figure does not stand on the ground line — a flying or
falling figure is centred in the panel instead, and may spread wider than a
standing one because it is not competing for floor space. It is a property of
the drawing, so it lives beside the drawing rather than in the CMS.

A slug with no PNG here falls back to a scene hand-authored in
`scripts/amphora/figures.js`.

After changing anything here, run:

    npm run content:sync && npm run amphora
