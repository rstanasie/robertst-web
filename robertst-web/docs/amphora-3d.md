# Amphora, true 3D version

The version the site renders by default. It loads a `.glb` and rotates actual geometry
around its Y axis, so the handles change perspective and the painted surface curves
away on its own — no frame swapping, no CSS `rotateY()`.

- The 2D frame turntable, used as the WebGL fallback: [`amphora-2d.md`](./amphora-2d.md)
- Producing the model and texture in Blender: [`amphora-asset-pipeline.md`](./amphora-asset-pipeline.md)

## Files

| File | Role |
| --- | --- |
| `components/Amphora.tsx` | Orchestrator: owns the hook and the drag surface, picks a viewer, renders the result panel. No `three` imports. |
| `components/AmphoraModelViewer.tsx` | The 3D viewer: GLTF loading, loading/error states, Canvas, lights, rotating group, model normalisation |
| `lib/amphoraAssets.ts` | Asset paths, kept free of `three` imports so preloading does not drag the 3D bundle in |
| `public/models/amphora/amphora.glb` | Vase body, two handles, UVs, two materials |
| `public/models/amphora/amphora-story.png` | Myth artwork, referenced externally by the GLB |

## Dependencies

| Package | Why |
| --- | --- |
| `three` | The renderer and `GLTFLoader` |
| `@react-three/fiber` | Declarative scene graph and `useFrame`, so the render loop is not hand-rolled |
| `@types/three` (dev) | Types for `three` and `three/examples/jsm/*` |

`@react-three/drei` was deliberately **not** installed. The only parts worth having are
`useGLTF` and a centring helper, both a few lines here, and explicit loading gives real
loading and error states rather than Suspense plus an error boundary.

## Scene setup

Camera and lights live as named constants at the top of `AmphoraModelViewer.tsx`:

- **Perspective camera** at `[0, 0, 2.15]`, 35° FOV, looking at the origin. The model is
  normalised to 1 unit tall and centred, so this frames the whole vase — including
  handles at their widest — with roughly 28% margin horizontally and 36% vertically.
- **Lighting** is deliberately plain: one ambient at 0.75 so no orientation goes black,
  one directional front-top-right at 2.2 for form, one dim directional back-left at 0.8
  for a rim. No post-processing, no environment map.
- **Transparent canvas** (`alpha: true`), so the page background shows through and the
  viewer works in light and dark.
- **Pixel ratio capped** at 2 via `dpr={[1, 2]}`, antialiasing on.
- **Demand-based rendering**: `frameloop={isActive ? "always" : "demand"}`. Continuous
  only while dragging or spinning; idle otherwise at no GPU cost. An `invalidate()` on
  activity change guarantees the final snapped orientation is drawn.

The camera never moves. Rotation is applied to the model.

## Rotation

The scene reads the angle rather than owning it:

```tsx
useFrame(() => {
  group.current.rotation.y = MathUtils.degToRad(angleRef.current);
});
```

`angleRef` comes from `useAmphoraRotation`, so 60 fps rotation causes **zero** React
re-renders of the scene — the hook's `angle` state exists for the 2D viewer, and the 3D
viewer is `memo`'d with stable props so those updates never reach the Canvas. Degrees are
converted to radians only at this one call site; everything upstream is degrees.

The angle is applied to a parent `<group>` wrapping the loaded model, so rotation happens
about the model's own centred vertical axis regardless of where the exporter left the
pivot.

## Model loading and normalisation

`GLTFLoader` is driven explicitly in an effect, with a three-state machine:
`loading` → `ready` | `error`. That gives:

- a **loading state** ("Shaping the amphora…") that occupies the same aspect box, so
  there is no layout shift when the model appears;
- an **error state** that reports upward through `onError`, and the orchestrator swaps
  to the 2D frame turntable. A missing or corrupt `.glb` degrades to a working amphora
  rather than an empty canvas.

`prepareModel` then measures the loaded scene with a `Box3` and applies scale and offset
so the model is 1 unit tall and centred on the origin. This is defensive: the committed
asset is already correct, but a re-export with a different scale or an off-centre pivot
still renders correctly instead of orbiting off screen. It also raises texture anisotropy
so the artwork stays legible at grazing angles.

## WebGL detection and SSR

3D code must not run on the server, and must not bloat the initial bundle:

- The viewer is imported with `next/dynamic` and `ssr: false`, so `three` lands in a
  lazily-loaded chunk (currently ~908 KB) that is absent from every eager chunk for `/`.
  Initial JS stays around 427 KB.
- WebGL support is read through `useSyncExternalStore` with a `"detecting"` server
  snapshot. The naive `useEffect` + `setState` is both a lint error
  (`react-hooks/set-state-in-effect`) and a hydration-mismatch risk; this renders a
  stable placeholder on the server and swaps in the real mode after hydration.
- `ReactDOM.preload` warms the `.glb` and texture as soon as WebGL is confirmed, so the
  asset downloads in parallel with the 3D chunk.

Only `Amphora.tsx`, the two viewers and the hook are client components. Layout, the
about page and the myth pages stay server components.

## Accessibility

The canvas is `aria-hidden` and treated as decorative. Everything that matters is
ordinary HTML outside it: the myth name and description in an `aria-live` region, the
*Read the story* link, a permanent list of all three myths, and a keyboard-reachable
*Spin the Amphora* button. The SSR'd page contains no `<canvas>` and all three myth
links, so the myths are reachable with JavaScript disabled, with WebGL missing, or with
a screen reader. `prefers-reduced-motion` skips inertia and snap animation.

## Myth angles

Angles live in `data/myths.ts` alongside the name and description — one source of truth,
keyed by the same string used for the `/myths/[story]` route:

```ts
prometheus: { name: "Prometheus", description: "…", angle: 0 }
medusa:     { name: "Medusa",     description: "…", angle: 120 }
icarus:     { name: "Icarus",     description: "…", angle: 240 }
```

`nearestStory(angle)` in `lib/amphora.ts` picks the winner using shortest circular
distance, so 355° correctly resolves to Prometheus at 0° rather than to Icarus at 240°.
Sector midpoints (60/180/300 with three myths) are exact ties and resolve deterministically
to the earlier key.

**To add a myth:** add an entry with a stable key and an angle, respace the angles evenly,
and redraw the texture with one panel per myth. Nothing in the components needs editing —
snapping, selection and the result panel all read `data/myths.ts`. The texture panel
centre for a myth goes at `u = ((180 - angle) / 360) mod 1`; see the pipeline doc.

## The UV convention

The body is a lathe, and the mapping between rotation and artwork is fixed by it:

```
position = (r * sin(theta), y, r * cos(theta))   // theta = 0 faces the camera
u        = ((theta + PI) / (2 * PI)) mod 1       // u = 0.5 faces the camera at rest
v        = 1 - (arc length from the foot / total arc length)
```

Rotating by `A` degrees moves surface `theta` to `theta + A`, so the artwork facing the
camera at angle `A` sits at `u = ((180 - A) / 360) mod 1`. This is the contract between
`data/myths.ts` and the texture; if it drifts, the amphora settles on a myth whose
artwork is not the one facing the viewer. Full detail, including the 1.33× horizontal
pre-compensation the texture needs, is in
[`amphora-asset-pipeline.md`](./amphora-asset-pipeline.md).

## Asset status

Both `amphora.glb` and `amphora-story.png` are **procedurally generated placeholders** —
structurally correct (two primitives, correct materials, valid UVs, centred pivot, 1 unit
tall, 196 KB / 20 KB) but not art. The vase is a plain lathed silhouette and the artwork
is a named panel with an initial in a medallion. The pipeline doc covers replacing them.

## Manual tests

1. **Load** — open `/` fresh. Brief "Shaping the amphora…", then the vase with
   PROMETHEUS facing you and both handles in silhouette. Confirm `amphora.glb` and
   `amphora-story.png` both arrive in the network tab.
2. **Drag direction** — drag right and the front surface follows the cursor; drag left
   and it reverses. It must spin in place, never drifting off centre. If it orbits, the
   model pivot is wrong.
3. **Handles and lighting** — spin slowly through 360°: handles pass edge-on around
   90°/270°, and no orientation goes unreadably dark.
4. **Texture adhesion** — watch the medallion through a spin. It must stay locked to the
   surface, not slide across it.
5. **Inertia** — flick hard vs. nudge gently; the hard flick coasts much longer and
   decelerates smoothly. Interrupting a spin with a new drag takes over immediately.
6. **Correspondence** — on settling, the medallion facing you (P/M/I, with 1/2/3 dots)
   must match the announced myth. Follow *Read the story* and check the URL.
7. **Mobile** — dragging must not scroll the page; scrolling from outside the amphora
   must still work. Watch the frame rate during a hard flick.
8. **Fallback** — disable WebGL, then separately rename the `.glb`: both should land on
   the 2D frame turntable with identical gesture behaviour.
9. **Reduced motion** — enable Reduce Motion and spin: it should settle immediately with
   no coasting.
