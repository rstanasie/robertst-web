# Amphora, true 3D version

The version the site renders by default. It loads a `.glb` and rotates actual geometry
around its Y axis, so the handles change perspective and the painted surface curves
away on its own — no frame swapping, no CSS `rotateY()`.

- The 2D frame turntable, used as the WebGL fallback: [`amphora-2d.md`](./amphora-2d.md)
- Producing the model and the painted sheets: [`amphora-asset-pipeline.md`](./amphora-asset-pipeline.md)
- The page it sits on, whose frieze reuses the same artwork: [`homepage-backdrop.md`](./homepage-backdrop.md)

## Files

| File | Role |
| --- | --- |
| `components/Amphora.tsx` | Orchestrator: owns the hook and the drag surface, picks a viewer, renders the result panel. No `three` imports. |
| `components/AmphoraModelViewer.tsx` | The 3D viewer: GLTF loading, loading/error states, Canvas, lights, rotating group, model normalisation |
| `lib/amphoraAssets.ts` | Asset paths, kept free of `three` imports so preloading does not drag the 3D bundle in |
| `public/models/amphora/amphora.glb` | Body, handles, UVs, one dielectric material (251 KB) |
| `public/models/amphora/amphora-basecolor.webp` | Clay, glaze and painted scenes (146 KB) |
| `public/models/amphora/amphora-roughness.webp` | glTF metallic-roughness (42 KB) |
| `public/models/amphora/amphora-normal.webp` | Throwing ridges and clay grain (34 KB) |

Regenerate all four with `npm run amphora`. Total shipped payload is 473 KB, all of
it behind the lazy chunk.

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

Camera, lights and material constants live at the top of `AmphoraModelViewer.tsx`:

- **Perspective camera** at `[0, 0, 2.05]`, 34° FOV, looking at the origin. The model is
  normalised to 1 unit tall and centred, so this frames the whole vessel — handles at
  their widest included — with margin on all sides.
- **Neutral tone mapping** (`NeutralToneMapping`). ACES, R3F's default, desaturates
  terracotta noticeably; Neutral rolls off highlights without draining the clay.
- **Transparent canvas** (`alpha: true`), so the page background shows through and the
  viewer works in light and dark.
- **Pixel ratio capped** at 2 via `dpr={[1, 2]}`, antialiasing on.
- **Demand-based rendering**: `frameloop={isActive ? "always" : "demand"}`. Continuous
  only while dragging or spinning; idle otherwise at no GPU cost. An `invalidate()` on
  activity change guarantees the final snapped orientation is drawn.

The camera never moves. Rotation is applied to the model.

### Lighting

Four lights, all weak by the standards of a glossy render:

| Light | Intensity | Job |
| --- | --- | --- |
| `hemisphereLight` sky `#9ea8bd` / ground `#4d3324` | 1.35 | Stands in for a room: cool from above, warm bounce from below |
| `directionalLight` `[2.4, 2.9, 3.6]`, `#fff5e6` | 1.55 | Soft key, gives the belly its form |
| `directionalLight` `[-3, 0.9, 1.4]`, `#b8c9f0` | 0.55 | Cool rim separating the shoulder from the background |
| `directionalLight` `[-0.8, -1.6, 2.2]`, `#fac79e` | 0.28 | Weak warm bounce off an imaginary surface below |

Two things here are load-bearing:

**A hemisphere light instead of an ambient light.** A flat ambient term lights every
orientation identically, which is precisely the evenly-lit, self-illuminated look that
reads as "3D render" rather than "object". A sky-to-ground gradient gives the vessel a
top and a bottom.

**Low intensities.** The previous version used a single directional at 2.2, which on a
smooth material produced a broad specular hotspot — the basketball highlight. A rough
surface has a wide, dim specular lobe, so it needs far less light before it blows out.

### Material

The GLB ships one dielectric material and `prepareModel()` enforces the rest:

```ts
standard.metalness = 0;
standard.envMapIntensity = 0;
```

Fired clay is a dielectric with nothing around it to reflect. Any residual metalness or
image-based reflection puts the plastic sheen straight back. `metallicFactor` is already
`0` in the GLB, so this is belt and braces — but cheap, and it also covers a
hand-authored replacement model that forgets.

Anisotropic filtering is set to 8 on **all four** maps, not just base colour. A vessel
spinning on its axis is nearly always seen at a glancing angle, where anisotropy is the
difference between crisp painted lines and mush.

Roughness, colour variation and surface relief are all painted rather than set as
uniforms — see [`amphora-asset-pipeline.md`](./amphora-asset-pipeline.md). The short
version: glaze sits near 0.55 and the reserved clay near 0.94, and it is that *contrast*
that reads as ceramic. A single uniform roughness reads as plastic no matter how high.

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
still renders correctly instead of orbiting off screen. It also pins the material to a
dielectric and raises anisotropy on every map.

## WebGL detection and SSR

3D code must not run on the server, and must not bloat the initial bundle:

- The viewer is imported with `next/dynamic` and `ssr: false`, so `three` lands in a
  lazily-loaded chunk (currently ~908 KB) that is absent from every eager chunk for `/`.
  Initial JS stays around 427 KB.
- WebGL support is read through `useSyncExternalStore` with a `"detecting"` server
  snapshot. The naive `useEffect` + `setState` is both a lint error
  (`react-hooks/set-state-in-effect`) and a hydration-mismatch risk; this renders a
  stable placeholder on the server and swaps in the real mode after hydration.
- `ReactDOM.preload` warms the `.glb` and the base colour sheet as soon as WebGL is
  confirmed, so they download in parallel with the 3D chunk. Only the base colour sheet
  is preloaded — it is the largest of the three and the only one whose absence would be
  visible.
- The GLB requires `EXT_texture_webp`. three supports it; a browser that could not decode
  WebP would error into the 2D fallback, which is WebP frames anyway.

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

Angles come from the active week, via `lib/content/vase.ts` and the generated
`data/vase-panels.json`:

```ts
// data/vase-panels.json, generated from the active week
{ "key": "prometheus", "angle": 36,  "slot": 0, "access": "preview" }
{ "key": "orpheus",    "angle": 252, "slot": 3, "access": "locked"  }
```

`nearestStop(angle, stops)` in `lib/amphora.ts` picks the winner using shortest circular
distance. It takes the stops as an argument and imports no content, which is what lets the
weekly collection change without touching the physics. Exact midpoints tie and resolve
deterministically to the earlier stop.

**Adding a myth** is now a content operation, not a code one: see
[`cms.md`](./cms.md). The vessel's capacity and angles are
declared once in `lib/content/vase.ts`, `npm run content:sync` writes
`data/vase-panels.json`, and `npm run amphora` repaints from it. A figure's centre still
goes at `u = ((180 - angle) / 360) mod 1`.

## The UV convention

The body is a lathe, and the mapping between rotation and artwork is fixed by it:

```
position = (r * sin(theta), y, r * cos(theta))   // theta = 0 faces the camera
u        = ((theta + PI) / (2 * PI)) mod 1       // u = 0.5 faces the camera at rest
v        = 1 - (arc length from the foot / total arc length)
```

Rotating by `A` degrees moves surface `theta` to `theta + A`, so the artwork facing the
camera at angle `A` sits at `u = ((180 - A) / 360) mod 1`. This is the contract between
`data/vase-panels.json` and the texture; if it drifts, the amphora settles on a myth whose
artwork is not the one facing the viewer.

`npm run amphora:verify` asserts it against the real vertex data at every whole degree,
so a change to the profile, the myth angles or the sheet layout fails loudly rather than
quietly desynchronising. Full detail, including how the anisotropic lathe mapping is
compensated, is in [`amphora-asset-pipeline.md`](./amphora-asset-pipeline.md).

## Asset status

The model and sheets are generated by `scripts/amphora/` — see
[`amphora-asset-pipeline.md`](./amphora-asset-pipeline.md). They are finished assets, not
placeholders: a lathed neck-amphora profile with flared foot and lip, swept strap handles,
three hand-authored black-figure scenes, a rosette chain on the shoulder, a ray band above
the foot, and painted fire clouds, chips, encrustation and throwing ridges.

They are a stylised interpretation rather than a scan of a real vase. If you want to
replace them with a modelled and hand-painted version, the pipeline doc's last section
lists exactly what the app requires.

## Verifying

```bash
npm run amphora:verify     # geometry, textures, and the panel contract
npm run amphora:preview    # software PBR render of the shipped asset
npx tsc --noEmit && npm run lint && npm run build
```

`preview.js` mirrors the viewer's camera, lights, tone mapping and three's own GGX BRDF,
and reads the shipped WebP sheets. It is how the material was tuned without a browser —
and it is what caught both the squashed artwork and the corrugated normal map. It is a
prediction, not a substitute: it does not model mipmapping, anisotropic filtering or
three's exact tangent derivation.

## Manual tests

With `npm run dev`:

1. **Drag** the vessel left and right. It should turn with your pointer, keep turning
   when you release, slow down, and settle with one scene squarely facing you.
2. **Check the settle.** The myth named in the panel below must be the scene you are
   looking at, at every one of the three stops.
3. **Spin the Amphora.** Reaches all three myths over repeated presses; disabled while
   spinning.
4. **Look at the light.** Turn it slowly and watch the highlight travel: it should be a
   broad soft sheen on the black glaze and almost nothing on the clay, with the throwing
   ridges catching light faintly as they pass. A tight bright highlight anywhere means
   roughness or a light intensity has regressed.
5. **Touch and stylus.** Drag on a phone; the page must not scroll while dragging.
6. **High DPI.** Painted lines should stay crisp at 2x; the canvas must not overflow.
7. **Reduced motion.** Enable it — inertia and snap animation are skipped, selection
   still lands on a myth.
8. **WebGL off.** Disable it in the browser; the 2D frame turntable takes over with the
   same drag behaviour.
9. **Keyboard only.** Tab to the button and the myth links; nothing needed from the
   canvas.
10. **Narrow viewport.** 320px wide: the vessel scales down, stays centred, no layout
    shift as it loads.
