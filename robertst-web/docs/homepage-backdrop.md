# Homepage backdrop, the night sky

The scene behind the amphora: a photographed night sky with a temple inside its
fortress walls on the left, a drift of mist that breathes, and a drawn Ionic
column for the vessel to stand on.

The backdrop itself is on every page that asks for it — `/`, `/subscribe` and
`/myths/[story]`, the last two through `.myth-backdrop--quiet`. The column and
the aura belong to the amphora and so exist only where it does.

## Files

| File | Role |
| --- | --- |
| `components/MythBackdrop.tsx` | The four layer elements. No props but an optional `className`; everything visual is CSS. |
| `components/AmphoraColumn.tsx` | The column's geometry, and nothing else — placement, fade and sizing are CSS |
| `app/globals.css` | The `.myth-backdrop`, `.myth-column` and `.myth-stage` blocks — the whole design, and the tuning surface |
| `content/stage/night-temple.png` | The unlit source. Not served — the two files below are built from it |
| `scripts/stage/build-sky.js` | Paints the light into it. `npm run sky` |
| `public/images/stage/night-temple.webp` | The lit sky, 1672x941, 116 KB |
| `public/images/stage/night-temple-sm.webp` | The same at 1000px, 42 KB, taken by `image-set()` under ~2x |

## The palette

| Token | Value | Carries |
| --- | --- | --- |
| `--myth-navy` | `#10243b` | the ground under the photograph, and the fallback if it never loads |
| `--myth-ink` / `--myth-champagne` | `#f0e2c7` | title, links, the rule under the title, the vessel's drawings |
| `--myth-ink-soft` | `#b9ad97` | every secondary line of text |
| `--myth-sand` | `#c3ae8e` | the two small decorative marks (the seal, the rest diamond) |
| `--myth-stone` | `#8d8982` | the column |

Contrast against the navy, measured: champagne 12.1, dusty beige 7.1, sand 6.6.
All three pass AA for body text, which is what lets the secondary voice stay
dusty rather than having to be brightened toward the primary one.

The vessel itself is brick and umber and keeps its own palette, in
`scripts/amphora/build-textures.js` — it is a fired object with a material, not
a surface taking a page colour. The temple is lit in that same brick, which is
the composition's one argument: two warm things at opposite corners of a cold
frame, answering each other.

## How it is built

Four layers, outermost first:

```
.myth-backdrop              position: fixed, the flat --myth-navy ground
  .myth-backdrop__sky         the photograph, cover-sized, under a --sky-dim wash
  .myth-backdrop__mist        two blurred clouds, the one moving thing
  .myth-backdrop__vignette  radial + vertical wash
```

and, inside the amphora's own stage box:

```
[data-amphora="stage"]
  .myth-column              the pedestal, masked to fade out downward
  [data-amphora="aura"]     champagne warmth held close to the clay
  <canvas> / <img>          the vessel
  [data-amphora="handle"]   the two grab targets
```

Three decisions carry most of the weight.

**The crop is chosen, not inherited.** The photograph is 1672x941 — 16:9 — so
on a phone held upright, `cover` scales it until barely a quarter of its width
is on screen. Which quarter is `--sky-x`, and it walks right as the
viewport narrows: 34% on a desktop, 42% under 48rem, 52% under 30rem. That
trades the fortress away deliberately. It sits on the left edge of the picture
and the vessel needs open sky behind it; on a 390px screen you cannot have
both, and the vessel wins. Pull `--sky-x` down toward 25% to get the temple
back on a phone, at the cost of putting it behind the pot.

**The light in the temple is baked into the image.** The temple burns from
within, torches run down the stair, and a wide, weak pool lifts the rock so the
structure reads as one lit thing rather than a dark hill with bright spots on
it. None of that is CSS: the sky is `cover`-sized with a crop that walks as the
viewport narrows, so a CSS glow would have to track that crop at every
breakpoint to stay on the temple, and would cost a full-viewport layer to
composite. Painted into the pixels it registers perfectly and costs nothing.

The price is that the light cannot react to anything, and that every coordinate
in `build-sky.js` is tied to this particular photograph. Replace the source and
all of them are wrong — `content/stage/README.md` says so where someone
replacing it would look.

Light is summed in linear space. Adding gamma-encoded values brightens the
midtones far faster than the highlights, which turns every pool into a flat grey
disc before its centre gets anywhere near a flame — the first pass did exactly
that and the temple blew out to white.

**The mist is a separate layer because the photograph is flat.** Its clouds are
baked into the image and cannot move independently of the constellations, so
nothing moves the image: a transparent layer of two soft radial gradients,
blurred past the point of having an edge, cycles its opacity instead. Scaling
or panning the sky would slide the stars, which is the one thing a sky may not
do.

**The column is positioned from the camera, not by eye.** The model is one unit
tall and centred on the origin, seen through a 34° lens at 2.05 units, so its
foot lands at 89.9% of the stage box's height and its foot ring measures 33% of
the box's width. The capital is set a shade above the first (`top: 88.8%`) and
comfortably wider than the second (`width: 54%`, abacus 82% of that), so the
clay sits down onto stone instead of hovering over it and the volutes are not
swallowed by the foot. Those are the same numbers `handleHitBoxes()` in
`lib/amphora.ts` is derived from — if the camera moves, both move.

## The breathing

Two layers, two periods, neither a multiple of the other, so they drift in and
out of step and the scene never visibly repeats:

| Layer | Period | Range |
| --- | --- | --- |
| `.myth-backdrop__mist` | 26s | 0.52x to 1x of `--mist-opacity` |
| `[data-amphora="aura"]` | 21s | 0.62x to 1x of `--aura` |

Opacity only — nothing translates, scales or filters on a loop, so neither
animation can shift the stars, the fortress or the vessel. The aura's own
`--aura` is raised on hover and again while a hand is on the clay, which rides
on top of the cycle rather than replacing it.

Under `prefers-reduced-motion: reduce` both stop. The mist is pinned at 0.76 of
its weight rather than removed, so the scene keeps its depth and loses only its
breath.

## Decorative layers never take the pointer

`.myth-column` and `[data-amphora="aura"]` are both `pointer-events: none`, and
the backdrop is `position: fixed` at `z-index: -1`. The only things in the stage
that can be grabbed are the two handles, exactly as before.

The column also sits at `z-index: -1` *within* the stage box, and the result
panel is lifted to `z-index: 1`. Both are needed: the stage box is positioned,
so without the lift the shaft would paint over the story title hanging below it.
The mask fades the shaft out well above the text in any case — the z-index is
the guarantee, the mask is the design.

## Tuning

All on `.myth-backdrop` unless noted.

| Property | Does |
| --- | --- |
| `--sky-x`, `--sky-y` | which part of the photograph survives the crop |
| `--sky-dim` | how far the photograph is pulled toward the ground colour. 0.1 on the homepage, 0.42 under text |
| `--mist-opacity` | weight of the drifting cloud at its fullest |
| `--focus-x/y`, `--focus-radius` | centre and reach of the darkening behind the vessel |
| `--aura` (on `[data-amphora="aura"]`) | weight of the warmth around the clay |
| `top` / `width` / `height` / mask stops (on `.myth-column`) | where the column meets the vessel, and how far down it survives |

## The stage

`.myth-stage` on the homepage `<main>` carries the page's own typography and
colour: a serif display face for the title and lead, a utility sans for the
small uppercase UI text, champagne ink, and champagne again for links and the
rule under the title.

It styles the amphora section from the outside rather than editing
`components/Amphora.tsx`, so the interaction code is provably untouched. Three
consequences worth knowing:

- **Nothing in the stage may change size.** As a flex item in a centred column
  the section would size to its widest child, and the amphora inside it is
  `w-full max-w-[20rem]` with a fixed aspect ratio — so the vessel grew and
  shrank by ~40px each time the result panel filled and emptied, dragging the
  whole centred column with it. It read as the page zooming. Two rules stop it:
  `.myth-stage > section { width: 100% }`, and a `min-height` reserve on
  `[role="status"]` (Amphora's own `min-h-28` is short once the text is set in
  the display face). Any new child of the stage that can change size needs the
  same treatment.

- **The stage fits one screen, and the amphora is what gives.** `.myth-stage` takes
  a *definite* height — `calc(100svh - var(--myth-header-h))`, which is why the
  header has a fixed height — so flex can distribute and shrink inside it. Every
  child is `flex: none` except the amphora's drag surface, which is `flex: 0 1
  auto` with `width: auto` so its 7/10 ratio derives the width from whatever
  height is left. On a roomy screen it lands at exactly the 320x457 Amphora asked
  for; on a short one it gives ground so the myth links stay visible. Its
  `min-height: 13rem` is the floor below which a short window scrolls instead.
  Gaps, padding and the two type sizes are `svh`-clamped for the same reason.

- The stage styles Amphora's parts through `data-amphora` hooks (`stage`,
  `hint`, `index`, `title`) rather than by position, because the section gained
  children when the weekly collection landed and a structural selector like
  `div:not([role])` would have swallowed them.
- Amphora renders its own `<h2>The Amphora</h2>`, which repeats the page title.
  It is visually hidden and left in the accessibility tree. Removing the
  duplication properly means editing the component.

The page colours the header and `body` through `body:has(.myth-backdrop)`, which
scopes them to this page without touching `app/layout.tsx`. In a browser without
`:has()` the nav would fall back to the default dark ink on blue — readable but
poor.

## Verifying

```bash
npm run sky      # only after editing the source image or build-sky.js
npx tsc --noEmit && npm run lint && npm run build
```

There is no automated visual check. Manually, with `npm run dev`:

1. **The column meets the vessel.** No gap and no overlap between the foot and
   the abacus, and both volutes visible either side of the foot.
2. **The aura has no edge.** It should read as warmth, never as a ring or a
   selection state, and it must not wash out the drawings.
3. **The centre is calm.** The sky behind the amphora is clearly quieter than
   the sky in the corners.
4. **The amphora still spins.** Drag a handle, flick it, press the arrow keys;
   the myth named below must be the scene facing you. The clay itself is not a
   grab target and never was.
5. **Nothing moves when the result changes.** Note the amphora's size and the
   position of the title, then cycle through all five myths and back to the
   empty state. Nothing may shift or resize — see the note under **The stage**.
6. **Narrow and wide.** 320px and 2560px: the vessel keeps open sky behind it,
   the myth list wraps rather than widening the page, and nothing scrolls
   sideways. Headless Chrome will not go below ~500px on macOS — put the page in
   a 390px iframe to see a real phone layout.
7. **The breath.** Watch for half a minute: the mist should thicken and thin
   without the stars, the fortress or the vessel moving at all.
8. **Reduced motion.** With `--force-prefers-reduced-motion`, the whole scene is
   static and still fully painted.
9. **The temple is lit, and warmly.** Its glow should read as the same hue as
   the clay across the frame, and the stair below it should be a line of
   separate flames rather than a continuous strip.
10. **Other pages.** Story pages and `/subscribe` use the same sky with
    `.myth-backdrop--quiet` — see [`cms.md`](./cms.md).
