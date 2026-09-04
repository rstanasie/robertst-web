# Homepage backdrop, the myth procession

The wallpaper behind the amphora on `/`. Wide diagonal bands rising to the right,
each carrying a register of Greek frieze artwork, under a radial vignette that
calms the middle of the page so the vessel stays the focal point.

It exists only on the homepage. `/about` and `/myths/[story]` are untouched.

## Files

| File | Role |
| --- | --- |
| `components/MythBackdrop.tsx` | The four layer elements. No props but an optional `className`; everything visual is CSS. |
| `app/globals.css` | The `.myth-backdrop` and `.myth-stage` blocks — the whole design, and the tuning surface |
| `scripts/backdrop/build-frieze.js` | Generates the frieze tile. `npm run backdrop` |
| `public/images/backdrop/myth-frieze.svg` | The generated tile (77 KB, ~22 KB over the wire) |

## How it is built

Four layers, outermost first:

```
.myth-backdrop              position: fixed, the flat #06152F ground
  .myth-backdrop__weave     rotate(--band-angle), oversized to cover the corners
    .myth-backdrop__bands     repeating-linear-gradient: hollow bands + borders
    .myth-backdrop__frieze    the tile, repeated
  .myth-backdrop__vignette  radial + vertical wash
```

Two decisions carry most of the weight.

**The frame rotates, not the gradients.** Inside `__weave` the bands are simply
horizontal and the tile is a plain vertical repeat, so the artwork cannot drift
out of its band no matter what the angle is. `inset: -45%` is what stops the
rotation from exposing the viewport corners.

**Bands and frieze are two layers, not two backgrounds on one.** They share an
origin, so they stay aligned, but each keeps its own `opacity`. That is what lets
the borders read clearly while the illustrations stay at a whisper.

The backdrop is `position: fixed`, so it does not scroll — content moves over a
still wallpaper. It sits at `z-index: -1` as a sibling of `<main>`, which puts it
behind the header too; nesting it inside a `<main>` that had its own stacking
context would paint it over the nav instead.

## Tuning

All of these are custom properties on `.myth-backdrop`, so a devtools edit or an
override on any ancestor is enough to try a value.

| Property | Default | Effect |
| --- | --- | --- |
| `--band-angle` | `-32deg` | Band direction. Negative rises to the right. |
| `--band-pitch` | `230px` | **Stripe width.** One band plus its gutter. Band width and the frieze scale both follow it, so this is the single size dial. |
| `--band-fill` | `0.72` | Share of the pitch the band occupies. Must match `BAND / PITCH` in the generator — see below. |
| `--band-rule` | `2px` | Thickness of the two hairline borders. |
| `--band-edge` | cream | Border colour. |
| `--band-wash` | pale blue, 0.13 | The hollow interior. Keep it near-transparent. |
| `--band-opacity` | `0.22` | **Weight of the bands.** |
| `--frieze-opacity` | `0.17` | **Weight of the illustrations.** |
| `--focus-x` / `--focus-y` | `50%` / `52%` | Centre of the vignette. Aim it at the amphora, not at the viewport. |

`--myth-header-h` (on `:root`) is the other load-bearing value: the stage's height
is the viewport minus it, so the two must agree.
| `--focus-radius` | `62%` | How far the calm centre reaches. |

The vignette stops are darker than `--ground` on purpose. Lighten the ground and
they must be re-derived, or the "vignette" turns into a glow.

Breakpoints only change `--band-pitch`, `--band-rule` and `--focus-radius`:
124px pitch under 30rem, 156px under 48rem, 286px over 100rem.

One counter-intuitive point: the vignette radii are percentages of the viewport
box, so on a tall narrow phone the same number reaches much further down the page
than across it. The radius therefore gets *smaller* as the viewport narrows, not
larger.

## Illustration density

Density and the choice of motifs are **not** CSS — they are baked into the tile.
The dials are at the top of `scripts/backdrop/build-frieze.js`:

| Constant | Effect |
| --- | --- |
| `TILE_W` | Tile length in tile units. Larger = the same motifs spread further apart. |
| `FIGURE_H`, `ORNAMENT_H`, `INTERSTITIAL_H` | Motif heights, as a share of band pitch |
| `BAND` | Band share of the pitch. Mirror any change into `--band-fill`. |
| `OPACITY` | Relative emphasis *within* the frieze; `--frieze-opacity` scales the lot. |
| the two `renderRow(...)` calls | Which motifs appear, in what order |

Run `npm run backdrop` after any change.

Horizontal density cannot move to CSS, because `background-size` uses `auto`
width to preserve the tile's aspect: compressing the tile horizontally would
squash the figures. Scale is CSS, spacing is the generator.

## The tile

`100` tile units = one band pitch, so everything in the generator is a fraction
of band pitch and scales with it. The tile is two pitches tall, which is why
consecutive bands differ:

```
y   0.. 72   figural register   Prometheus · palmette · Medusa · lotus · Icarus · rosette
y  72..100   gutter             alternating Greek fret between two rails
y 100..172   ornament register  palmette · serpent · torch · gorgoneion · lotus · serpent · rosette
y 172..200   gutter             bead-and-reel
```

Each row is laid out with equal gaps and *half* a gap at each end, so the row
tiles horizontally without a seam. The fret needs an even `MEANDER_PERIODS` for
the same reason — its keys alternate.

### The artwork is the amphora's own

The three figures are not redrawn. `build-frieze.js` imports the same op lists
that `scripts/amphora/figures.js` gives the vase texture and renders them to SVG
paths, so the procession on the page really is the painting on the pot. The
torch, and the gorgoneion with her snakes, are lifted out of those same scenes.

Reused fragments are found by shape rather than by index where possible, and
every extraction is guarded — if `figures.js` is re-authored, `npm run backdrop`
fails with a message naming the assumption that broke instead of silently
emitting a mangled motif.

Four things had to match the texture rasteriser for the reuse to be faithful:
paint order (later ops cut back through earlier ones), the tapered-polyline
model (a quad per segment plus a round join at every vertex), the ring form of
`ell`, and the four-colour palette. Colour is where it deliberately diverges —
the glaze becomes pale blue, and the reserved clay becomes the page's own
`#06152F`, so an incised line still reads as cutting back to the ground:

| Vase | Page |
| --- | --- |
| `glaze` black slip | `#bbd6ef` pale blue |
| `clay` reserved ground | `#06152f` the page ground |
| `red` added colour | `#c0754e` desaturated terracotta |
| `white` added colour | `#efe4d0` muted cream |

The meander, bead-and-reel, palmette, lotus, rosette and serpent are authored in
the generator — the vase has no meander band, so there was nothing to reuse.

All subpaths of one op are wound the same direction before being emitted, so a
`nonzero` fill unions a stroke's quads and joins instead of punching holes where
they overlap. Rings are the one exception: their inner ellipse is wound the other
way on purpose.

Path coordinates are rounded to a tenth of a tile unit, which is well under a
device pixel at any sane pitch, and round joins narrower than 0.45 units are
dropped. That rounding is most of what keeps the tile small enough to be a
background image.

## The stage

`.myth-stage` on the homepage `<main>` carries the page's own typography and
colour: a serif display face for the title and lead, a utility sans for the
small uppercase UI text, cream ink, and a terracotta accent for links and the
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
npm run backdrop
npx tsc --noEmit && npm run lint && npm run build
```

There is no automated visual check. Manually, with `npm run dev`:

1. **Band direction.** Bands rise from bottom-left to top-right.
2. **Bands read as bands.** Two cream hairlines with a near-empty interior — not
   filled stripes, and not so faint the structure disappears.
3. **The centre is calm.** The pattern behind the amphora is clearly quieter than
   the pattern in the corners.
4. **The frieze stays inside its bands.** Nothing straddles a border; the
   meander and bead rows sit in the gutters between bands.
5. **Alternating registers.** Consecutive bands carry different content.
6. **Seams.** Look along a band for an obvious repeat boundary; there should be
   none, in either register or either gutter.
7. **The amphora still spins.** Drag, flick, and press the button; the myth named
   below must be the scene facing you.
8. **Nothing moves when the result changes.** Note the amphora's size and the
   position of the title, then cycle through all three myths and back to the
   empty state. Nothing may shift or resize — see the note under **The stage**.
9. **Narrow and wide.** 320px and 2560px: bands stay in proportion, nothing
   overflows sideways, the vignette still centres on the vessel.
10. **Other pages.** `/about` is unstyled, as before. Story pages use the same
    ground with `.myth-backdrop--quiet` — see
    [`cms.md`](./cms.md).
