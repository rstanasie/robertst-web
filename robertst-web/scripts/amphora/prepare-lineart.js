"use strict";

// Reduces an outline drawing to a figure the amphora importer can read.
//
//   node scripts/amphora/prepare-lineart.js <scene.png> <slug> [options JSON]
//   node scripts/amphora/prepare-lineart.js bull.png theseus '{"erase":[[128,534,200,600]]}'
//
// Companion to prepare-figure.js, which handles an illustrated scene with a
// coloured ground and an already-filled figure. This one handles the other
// common kind of reference: black line art on white paper, where the figure is
// not filled at all — its interior is the same white as the page.
//
// That difference is the whole reason this exists. Handed line art directly,
// loadFigure detects a light ground, takes the dark strokes as the figure, and
// paints a wiry outline where a black-figure vase wants a solid body. So the
// enclosed regions have to be filled first, and four things get in the way:
//
//   no fill      Flood the paper inward from the border. Whatever the flood
//                cannot reach is inside a drawn contour, and that is the glaze.
//   leaky        A contour drawn with shading strokes has gaps in it, and one
//   contours     gap drains the whole body. What closes them is counting mid
//                greys as ink for the flood only: at 170 the bull's flank
//                seals, and at 140 it drains through its own shading.
//   shading      The reference is modelled with hundreds of fine hatching
//                strokes. Incising all of them would shred the silhouette
//                where a vase painter cut a dozen lines, so only strong lines
//                are incised and the rest are simply swallowed by the glaze.
//   ground       A ground line closes a band under the figures' feet, and that
//                band fills like any other enclosed shape. No threshold can
//                tell it from a body, because it is a legitimate closed
//                contour — so it is named explicitly, in `erase`.
//
// Two subjects are kept, not one: a scene can be two figures facing each other.
// Anything too thin to be a body is removed first, which is what drops a ground
// line, a caption or a watermark without dropping a limb.
//
// Output is the polarity loadFigure expects: light silhouette, dark incised
// lines, dark ground.

const fs = require("fs");
const path = require("path");
const S = require("./shared.js");

const [, , SRC, SLUG, OPTS_JSON] = process.argv;
if (!SRC || !SLUG) {
  console.error("usage: prepare-lineart.js <scene.png> <slug> [options JSON]");
  process.exit(1);
}

const opts = JSON.parse(OPTS_JSON ?? "{}");

/** At or below this counts as a stroke when closing contours for the flood. */
const INK = opts.ink ?? 170;
/** At or below this is a line worth incising. Above it is shading. */
const INCISION = opts.incision ?? 96;
/** Contour band left solid, in pixels, so incisions never break the outline. */
const RIM = opts.rim ?? 3;
/** Half-thickness of the thinnest thing that can still be a body. */
const OPEN = opts.open ?? 3;
/** How far a contour may sit from the body it belongs to. */
const REACH = opts.reach ?? 4;
/** A component below this share of the largest one is not a subject. */
const SUBJECT_SHARE = opts.subjectShare ?? 0.08;
/** Rectangles of the reference that are scenery: [x0, y0, x1, y1], inclusive. */
const ERASE = opts.erase ?? [];

const OUT = opts.out
  ? path.resolve(opts.out)
  : path.join(__dirname, "..", "..", "content", "figures", `${SLUG}.png`);

fs.mkdirSync(path.dirname(OUT), { recursive: true });

const { w, h, px, channels: ch } = S.readPNG(SRC);
const N = w * h;

// Alpha matters: a screenshot saved as RGBA can carry transparent margins that
// would otherwise read as solid ink.
const luma = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const o = i * ch;
  const a = ch === 4 ? px[o + 3] / 255 : 1;
  luma[i] = a * (0.299 * px[o] + 0.587 * px[o + 1] + 0.114 * px[o + 2]) + (1 - a) * 255;
}

/** Separable dilation; `r` is a radius in pixels. */
function dilate(mask, r) {
  if (r <= 0) {
    return mask.slice();
  }

  const row = new Uint8Array(N);
  const out = new Uint8Array(N);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let hit = 0;
      for (let d = -r; d <= r && !hit; d++) {
        const xx = x + d;
        if (xx >= 0 && xx < w && mask[y * w + xx]) hit = 1;
      }
      row[y * w + x] = hit;
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let hit = 0;
      for (let d = -r; d <= r && !hit; d++) {
        const yy = y + d;
        if (yy >= 0 && yy < h && row[yy * w + x]) hit = 1;
      }
      out[y * w + x] = hit;
    }
  }

  return out;
}

function erode(mask, r) {
  const inverse = new Uint8Array(N);
  for (let i = 0; i < N; i++) inverse[i] = mask[i] ? 0 : 1;
  const grown = dilate(inverse, r);
  const out = new Uint8Array(N);
  for (let i = 0; i < N; i++) out[i] = grown[i] ? 0 : 1;
  return out;
}

// --- fill: whatever the paper cannot reach is inside a contour --------------
const ink = new Uint8Array(N);
for (let i = 0; i < N; i++) ink[i] = luma[i] <= INK ? 1 : 0;

const outside = new Uint8Array(N);
{
  const stack = [];
  const push = (i) => {
    if (!outside[i] && !ink[i]) {
      outside[i] = 1;
      stack.push(i);
    }
  };

  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }

  while (stack.length) {
    const i = stack.pop();
    const x = i % w;
    const y = (i / w) | 0;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }
}

const filled = new Uint8Array(N);
for (let i = 0; i < N; i++) filled[i] = outside[i] ? 0 : 1;

// Named scenery: a ground line closes a band that fills like a body.
let erased = 0;
for (const [x0, y0, x1, y1] of ERASE) {
  for (let y = Math.max(0, y0); y <= Math.min(h - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x++) {
      const i = y * w + x;
      if (filled[i]) {
        filled[i] = 0;
        erased++;
      }
    }
  }
}

{
  let n = 0;
  for (let i = 0; i < N; i++) n += filled[i];
  console.log(
    `  filled ${((100 * n) / N).toFixed(1)}% of the page at ink ${INK}` +
      (ERASE.length ? `, ${ERASE.length} rect(s) erased ${erased} px` : ""),
  );
}

// --- subjects: drop anything too thin to be a body, keep the rest -----------
const figure = new Uint8Array(N);
{
  const mass = dilate(erode(filled, OPEN), OPEN);

  const label = new Int32Array(N).fill(-1);
  const sizes = [];

  for (let seed = 0; seed < N; seed++) {
    if (!mass[seed] || label[seed] !== -1) continue;
    const id = sizes.length;
    let area = 0;
    const stack = [seed];
    label[seed] = id;
    while (stack.length) {
      const i = stack.pop();
      area++;
      const x = i % w;
      const y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = yy * w + xx;
          if (mass[j] && label[j] === -1) {
            label[j] = id;
            stack.push(j);
          }
        }
      }
    }
    sizes.push(area);
  }

  // Measured against the largest rather than against the page, so the same
  // share works whatever margins the reference happens to have.
  const largest = Math.max(...sizes, 1);
  const keep = sizes.map((size) => size >= largest * SUBJECT_SHARE);

  const kept = new Uint8Array(N);
  for (let i = 0; i < N; i++) kept[i] = mass[i] && keep[label[i]] ? 1 : 0;

  // Give the body back its own contour, and nothing further away than that.
  const reach = dilate(kept, REACH);
  for (let i = 0; i < N; i++) figure[i] = filled[i] && reach[i] ? 1 : 0;

  console.log(
    `  ${sizes.length} components, kept ${keep.filter(Boolean).length} subject(s)` +
      ` (${sizes.filter((_, k) => keep[k]).join(", ")} px)`,
  );
}

// --- incisions: strong interior lines, contour left solid -------------------
const incision = new Uint8Array(N);
{
  const inverse = new Uint8Array(N);
  for (let i = 0; i < N; i++) inverse[i] = figure[i] ? 0 : 1;
  const rim = dilate(inverse, RIM);

  for (let i = 0; i < N; i++) {
    if (figure[i] && !rim[i] && luma[i] <= INCISION) incision[i] = 1;
  }
}

// --- the figure the importer will read --------------------------------------
{
  const o = Buffer.alloc(N * 3);
  for (let i = 0; i < N; i++) {
    const v = figure[i] ? (incision[i] ? 20 : 245) : 20;
    o[i * 3] = v;
    o[i * 3 + 1] = v;
    o[i * 3 + 2] = v;
  }
  S.writePNG(OUT, o, w, h);
}

let minX = w;
let maxX = -1;
let minY = h;
let maxY = -1;
let area = 0;
let cut = 0;
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = y * w + x;
    area += figure[i];
    cut += incision[i];
    if (!figure[i]) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
}
if (maxX < 0) throw new Error("nothing survived — is this line art on a light ground?");

const fw = maxX - minX + 1;
const fh = maxY - minY + 1;
console.log(
  `  incised ${((100 * cut) / Math.max(1, area)).toFixed(1)}% of the silhouette\n` +
    `  figure ${fw}x${fh}, aspect ${(fw / fh).toFixed(2)}  ->  ${path.relative(process.cwd(), OUT)}`,
);
