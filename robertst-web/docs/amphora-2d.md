# Amphora, 2D turntable version

The original implementation, and now the fallback the site uses when WebGL is
unavailable or the 3D model fails to load. It rotates by swapping pre-rendered
frames — there is no CSS `rotateY()` trickery and no 3D geometry involved.

For the 3D version see [`amphora-3d.md`](./amphora-3d.md); for how its assets are
produced, [`amphora-asset-pipeline.md`](./amphora-asset-pipeline.md).

The frames here are still the flat placeholder renders from before the 3D vessel was
built, so the fallback does not yet match the default viewer's appearance. Re-rendering
them from the current model would fix that — see the note under **Placeholder frames**.

## Files

| File | Role |
| --- | --- |
| `components/AmphoraFrameViewer.tsx` | The whole viewer: preloads every frame, renders the one for the current angle |
| `public/images/amphora/frames/amphora-000.webp` … `amphora-350.webp` | 36 frames, 10° apart |
| `lib/amphora.ts` | `FRAME_COUNT`, `DEGREES_PER_FRAME`, `angleToFrameIndex`, `frameSrc`, `FRAME_SOURCES` |

The viewer is deliberately tiny — it takes one prop, `angle`, and renders an image.
Everything else (drag, inertia, snapping, myth selection) is the shared core described
below, which is why the same gestures behave identically in 2D and 3D.

## How a frame is chosen

```
frameIndex = round(normalizeAngle(angle) / DEGREES_PER_FRAME) % FRAME_COUNT
src        = /images/amphora/frames/amphora-<frameIndex * DEGREES_PER_FRAME, 3 digits>.webp
```

The `% FRAME_COUNT` is what makes the sequence wrap: 356° rounds to index 36, which
wraps to 0, so the last frame hands back to the first with no seam. `normalizeAngle`
keeps negative angles (dragging left from rest) in range, so 350° resolves to
`amphora-350.webp` rather than a missing file.

The filename encodes **degrees**, not an ordinal. That keeps the mapping obvious when
looking at the folder, but it means a `FRAME_COUNT` that does not divide 360 evenly
will produce rounded filenames — pick a divisor of 360 (24, 36, 60, 72).

## Preloading, and why the image is `unoptimized`

On mount the viewer requests all 36 frames via `new window.Image()`. The `<Image>` that
renders the current frame is marked `unoptimized`, which is deliberate and load-bearing:
it keeps the rendered URL identical to the raw file path, so the preload warms exactly
the cache entries the turntable will ask for. With the optimizer on, the preload would
fetch different URLs and the first spin would visibly stall. `decoding="sync"` makes
frame swaps present atomically instead of async-decoding mid-spin.

## Frame assets

Current frames are **placeholders**, not a real turntable. They were generated from a
single still of the amphora with three markers (dark red, cream, black at 0°/120°/240°)
composited onto the belly, positioned by `sin(theta)`, squashed horizontally by
`cos(theta)`, and hidden on the back half. Rotation is therefore visible and verifiable,
but the vessel's silhouette never actually turns.

To replace them:

1. Export a real 360° turntable at 10° steps as WebP.
2. Name them `amphora-000.webp` … `amphora-350.webp` and drop them in the same folder.
3. If the pixel dimensions change, update the `aspect-[7/10]` class on the drag surface
   in `components/Amphora.tsx` so the box still matches the artwork.
4. For a different frame count, change `FRAME_COUNT` in `lib/amphora.ts` —
   `DEGREES_PER_FRAME`, the filenames and `FRAME_SOURCES` all follow.

Each frame is roughly 80 KB, about 2.8 MB for the set. That is acceptable for a
fallback that most visitors never download, but if this ever becomes the primary
renderer again, drop the frame count or the resolution.

## Shared rotation core

Both versions use `lib/amphora.ts` for angle maths and `lib/useAmphoraRotation.ts` for
the gesture model. Neither file imports `three`, and neither knows about images. The
hook owns:

- angle as the single source of truth, normalised to 0–360°, mirrored into `angle`
  state (for this viewer) and `angleRef` (for the 3D viewer's render loop)
- pointer drag with capture, converting horizontal pixels to degrees
- angular velocity, smoothed and clamped, in degrees per millisecond
- frame-rate independent friction, `velocity *= FRICTION ^ (elapsed / 16.67)`
- an eased snap to the nearest myth angle across the 0°/360° seam
- `story` set only when the snap completes

All tunables — sensitivity, friction, minimum velocity, snap duration, flick strength —
are named constants at the top of `lib/amphora.ts`. Read the values there; they are the
source of truth and are not duplicated in this document.

`prefers-reduced-motion` skips inertia and the snap animation entirely: drags still
track the pointer, releases resolve immediately.

## Manual tests

1. Force the fallback (disable WebGL in DevTools, or temporarily rename
   `public/models/amphora/amphora.glb`) and reload.
2. Drag right — markers move right and the frame advances; drag left — the reverse.
3. Flick hard, then nudge gently: the hard flick should coast much longer and
   decelerate smoothly before easing onto a myth.
4. Spin through a full turn and watch for a stutter at the wrap point between
   `amphora-350.webp` and `amphora-000.webp`. There should be none.
5. When it stops, the marker facing you (red = Prometheus, cream = Medusa,
   black = Icarus) must match the announced myth.
6. On a phone, dragging must not scroll the page; scrolling from outside the amphora
   must still work.
