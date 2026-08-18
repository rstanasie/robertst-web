# Amphora 3D asset pipeline

How to produce the `.glb` and its texture. For the code that consumes them see
[`amphora-3d.md`](./amphora-3d.md); for the frame-based fallback renderer see
[`amphora-2d.md`](./amphora-2d.md).

The application code is finished and does not need to change when the real artwork
arrives. Everything below describes the **assets** it consumes.

## File locations

| File | Purpose |
| --- | --- |
| `public/models/amphora/amphora.glb` | The vase: body mesh, two handles, UVs, two materials |
| `public/models/amphora/amphora-story.png` | The myth artwork wrapped around the body |
| `public/images/amphora/frames/amphora-*.webp` | 2D turntable frames, used only as the no-WebGL fallback |

Paths live in `lib/amphoraAssets.ts`. The `.glb` references the texture by the
relative URI `amphora-story.png`, so the artwork can be redrawn and dropped in
without re-exporting the model — keep the two files in the same folder.

## Current state: both 3D assets are placeholders

`amphora.glb` and `amphora-story.png` were generated procedurally, not modelled in
Blender. They are correct in structure, scale, pivot, UV layout and material split,
so they exercise every code path — but the vase is a plain lathed silhouette and the
"artwork" is a terracotta panel with the myth's name, an initial in a medallion, and
one/two/three dots. Replace both with real art.

## Expected final `.glb` structure

- One root node, one mesh, **two primitives**:
  - primitive 0 — the vase body, material `AmphoraStory`, `baseColorTexture` → the story texture
  - primitive 1 — handles, rim cap and foot cap, material `AmphoraTerracotta`, no texture
- No cameras, no lights, no hidden objects, no unused materials.
- Height normalised to **1 unit**, centred on the origin in all three axes, so the
  vertical rotation axis passes through the model's centre. The app re-centres and
  re-scales defensively (`prepareModel` in `components/AmphoraModelViewer.tsx`), so a
  differently-scaled export still works, but exporting it centred keeps the app honest.
- Smooth (not flat) normals on the body; unit length.
- Sampler: `wrapS` REPEAT (the texture wraps the circumference), `wrapT` CLAMP_TO_EDGE,
  mipmapped min filter.

Current placeholder: 3,666 vertices / 6,816 triangles / 196 KB. Keep the real model in
the same ballpark; a few tens of thousands of triangles is still fine on mobile.
Draco and Meshopt were deliberately **not** used — at ~200 KB the decoder would cost
more than it saves. Revisit if the real model exceeds roughly 1 MB.

## The UV convention (this is the part that must not drift)

The body is a lathe. For a point at angle `theta` around the axis:

```
position = (r * sin(theta), y, r * cos(theta))    // theta = 0 faces +Z, toward the camera
u        = ((theta + PI) / (2 * PI)) mod 1        // so u = 0.5 faces the camera at rest
v        = 1 - (arc length from the foot / total arc length)
```

Rotating the model by `A` degrees about Y moves surface `theta` to `theta + A`, so:

```
the artwork facing the camera at amphora angle A sits at u = ((180 - A) / 360) mod 1
```

Two consequences:

- **The texture seam (u = 0/1) sits at the back of the vase** when the amphora is at
  0°, which is where it is least visible. Keep it there.
- `v` follows *arc length*, not height, so artwork is not stretched vertically over
  the shoulder.

## Texture layout

`amphora-story.png` is 2048x1024, one horizontal strip, three equal panels of 1/3
each. Left to right, matching the `angle` values in `data/myths.ts`:

| u range | Myth | `angle` in `data/myths.ts` |
| --- | --- | --- |
| 0 – 1/3 | Medusa | 120° |
| 1/3 – 2/3 | Prometheus | 0° |
| 2/3 – 1 | Icarus | 240° |

Artwork occupies only `v` 0.371 – 0.771, the widest part of the belly. The neck, rim
and foot are left plain because UV distortion there is severe.

**Aspect pre-compensation.** The belly circumference is 1.72 units and the profile arc
is 1.15 units, so the surface is about 1.5:1 while the texture is 2:1. Artwork drawn
in texture space is therefore squeezed horizontally by **1.33x** once wrapped. Either
draw the artwork 1.33x wider than it should appear (what the placeholder does), or
export the texture at 3072x2048 and check it on the model. Getting this wrong is
subtle: circles become tall ellipses and lettering looks condensed.

## Blender pipeline for the real vase

1. Draw the side profile as a curve or an edge chain in the XZ plane, then **Spin**
   (Screw) it 360° around the Z/Y axis with 72–96 segments.
2. Model **one** handle (curve + bevel, or a tube), then Mirror it across X. Sink both
   ends a couple of millimetres into the body so no gap shows.
3. Shade smooth, `Mesh > Normals > Recalculate Outside`. Check for inverted faces.
4. UV unwrap the body so the **horizontal** axis of the texture runs around the
   circumference and the seam lands at the back. Follow Active Quads on a ring gives a
   clean cylindrical unwrap; verify `u` increases monotonically around the vase.
5. Assign two materials: the body gets the story texture, handles and caps get plain
   terracotta.
6. Load `amphora-story.png` in Blender and confirm each myth is centred in its 120°
   sector **before** exporting.
7. `Object > Apply > All Transforms`, then place the origin at the model's centre
   (`Object > Set Origin > Origin to Geometry`, bounds centre).
8. Delete cameras, lights, empties and unused materials.
9. Export glTF 2.0 (`.glb`): Include → Selected Objects; Data → Mesh: UVs, Normals;
   Material: Export. Reference the texture externally rather than packing it, so the
   artwork stays swappable.
10. Re-run the checks in the "Verifying a new asset" section below.

## Adding a myth later

1. Add an entry to `data/myths.ts` with a stable key (that key **is** the
   `/myths/[story]` route) and an `angle`.
2. Space the angles evenly — with four myths use 0/90/180/270.
3. Redraw the texture with one panel per myth, each `1 / count` wide, placing each
   myth's panel centre at `u = ((180 - angle) / 360) mod 1`.
4. Nothing else changes: snapping, nearest-myth selection and the result panel all
   read `data/myths.ts`.

## Verifying a new asset

- The vase and both handles render, and the handles arc clear of the silhouette.
- At each myth's `angle`, that myth's artwork is centred on screen.
- Dragging does not make the amphora drift off centre — if it orbits, the pivot is
  off and step 7 above was skipped.
- The texture rotates with the surface rather than sliding across it.
