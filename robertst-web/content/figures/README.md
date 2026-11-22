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

## Preparing one

Three scripts, one per polarity a reference arrives in:

| Reference | Script |
| --- | --- |
| Ink outlines on white paper | `prepare-lineart.js` |
| An illustrated scene, mixed polarity, with scenery | `prepare-figure.js` |
| An actual black-figure vase: solid dark figures on flat clay | `prepare-blackfigure.js` |

All three write `content/figures/<slug>.png` in the one polarity the importer
reads — **light silhouette, dark incised lines, dark ground**. The slug is the
story's slug; a figure with no story of that name is never painted.

```bash
node scripts/amphora/prepare-blackfigure.js <ref.png> <slug> '{"erase":[[x0,y0,x1,y1]]}'
```

`erase` paints a rectangle back to ground before anything else. Vase painters
signed their work and labelled their gods, and a name beside a figure is dark
in exactly the way the figure is.

## sources/

What the prepared files were made from, so they can be remade.

`athena-and-poseidon-reference.png` is a photograph of a black-figure amphora — Athena and
Poseidon in conversation — and needs only thresholding and four erase
rectangles for the lettering.

`zeus-and-hermes.svg` has no photograph behind it: the scene is drawn, in the
conventions rather than in an imitation of them — profile heads with a reserved
eye, a beard as a wedge, drapery as vertical incision, archaic perspective for
the open door. Render it to a bitmap and prepare that:

```bash
# any renderer that honours the viewBox will do
node scripts/amphora/prepare-blackfigure.js zeus-and-hermes@2x.png zeus-and-hermes
```

Two things the drawing is deliberately built around. The identity of a black
head is its front edge alone, so the nose and the beard are large and plain —
drawn delicately they disappear at the size a panel is painted. And the figures
are stocky: given a modern build they read as scarecrows on the vessel.
