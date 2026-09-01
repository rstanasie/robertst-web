"use strict";

// Reduces an illustrated scene to a single figure the amphora importer can read.
//
//   node scripts/amphora/prepare-figure.js <scene.png> <slug> [seeds]
//   node scripts/amphora/prepare-figure.js icarus-ref.png icarus '[[150,250],[60,470]]'
//
// Writes content/myths/<slug>/figure.png, which `npm run content:sync` then
// picks up. Use it when the artwork is a picture rather than a figure — a
// figure already alone on a plain ground needs none of this and can be dropped
// straight in.
//
// Three things make a scene hard to read, and each has its own answer here:
//
//   scenery       A sun, banks of cloud, things falling. Flood the flat tint
//                 from a seed inside each one; the dark line drawn round
//                 anything belonging to the figure stops the flood at its edge.
//                 Shapes drawn with no outline at all are found without a seed.
//   mixed         Pale wings carrying dark strokes over a dark body carrying
//   polarity      pale ones. A single threshold can only have one of them, so
//                 lines are found by asking which tone is the local minority.
//   ground        The ground is one flat colour and usually most of the image,
//                 so the figure is simply everything that is not it.
//
// The output is a two-tone image in the polarity loadFigure expects — light
// silhouette, dark incised lines, dark ground — so the scene's awkwardness is
// resolved once, here, and never reaches the shared importer.

const fs = require("fs");
const path = require("path");
const S = require("./shared.js");

const [, , SRC, SLUG, SEEDS_JSON] = process.argv;
if (!SRC || !SLUG) {
  console.error("usage: prepare-figure.js <scene.png> <slug> [seeds JSON]");
  process.exit(1);
}

const ROOT = path.join(__dirname, "..", "..");
const OUT = path.join(ROOT, "content", "myths", SLUG, "figure.png");
if (!fs.existsSync(path.dirname(OUT))) {
  throw new Error(`no such myth: content/myths/${SLUG}`);
}

// Turns the reference scene into a figure the amphora importer can read.
//
// The scene is not a figure on a plain ground: there is a sun disc behind the
// left wing, banks of cloud along the bottom, and loose feathers falling. Worse
// for a naive read, the drawing is mixed polarity — the wings are pale with dark
// feather strokes, the body is dark with pale detail lines — and the wing fill
// is the very same tint as the sun and the clouds, so no colour test separates
// them. What does separate them is that every shape is drawn with a dark
// outline: a flood fill through the pale tint spreads across the sun and stops
// at the wing that crosses it.


const { w, h, px, channels: ch } = S.readPNG(SRC);
const N = w * h;

const luma = new Float32Array(N);
const isBg = new Uint8Array(N);
// The ground is one flat tint and half the image; measured, not guessed.
const BG = [188, 97, 60];
const BG_TOL = 34;

for (let i = 0; i < N; i++) {
  const r = px[i * ch], g = px[i * ch + 1], b = px[i * ch + 2];
  luma[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  const d = Math.hypot(r - BG[0], g - BG[1], b - BG[2]);
  isBg[i] = d < BG_TOL ? 1 : 0;
}

const PALE = 155;

// The sun and the clouds are flat tint laid straight on the ground with no
// outline at all, so their edges are pure anti-aliasing: a ramp from the ground
// at 120 up to the fill at 182. Flooding only the fill leaves that ramp behind,
// and on the thin rays the ramp is the whole ray. Flooding from well above the
// ground instead takes the edge with it, and is still stopped dead by the dark
// line drawn round anything that belongs to the figure.
const FLOOD_MIN = 132;
const pale = new Uint8Array(N);
for (let i = 0; i < N; i++) pale[i] = !isBg[i] && luma[i] >= FLOOD_MIN ? 1 : 0;

// --- scenery: flood the pale tint from inside the sun and the clouds --------
const scenery = new Uint8Array(N);
function flood(sx, sy) {
  const start = sy * w + sx;
  if (!pale[start] || scenery[start]) return 0;
  const stack = [start];
  let n = 0;
  while (stack.length) {
    const i = stack.pop();
    if (scenery[i] || !pale[i]) continue;
    scenery[i] = 1;
    n++;
    const x = i % w, y = (i / w) | 0;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - w);
    if (y < h - 1) stack.push(i + w);
  }
  return n;
}

const SEEDS = JSON.parse(SEEDS_JSON ?? "[]");
for (const [sx, sy] of SEEDS) {
  const n = flood(sx, sy);
  console.log(`  seed (${sx},${sy}) removed ${n} px`);
}

// The sun's rays are separate shapes with ground between them and the disc, so
// no seed reaches them. What tells them apart is that the sun is flat tint laid
// straight on the ground, drawn with no outline at all, while every part of the
// figure is drawn with one. So: take each patch of tint and look at what borders
// it. Ground all the way round means scenery; a dark line round it means it was
// drawn, and it stays.
const DARK = 110;
{
  const seen = new Uint8Array(N);
  let removed = 0;
  let kept = 0;
  for (let start = 0; start < N; start++) {
    if (!pale[start] || seen[start] || scenery[start]) continue;
    const cells = [];
    const stack = [start];
    seen[start] = 1;
    let darkEdge = 0;
    let openEdge = 0;
    while (stack.length) {
      const i = stack.pop();
      cells.push(i);
      const x = i % w, y = (i / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) { openEdge++; continue; }
        const j = yy * w + xx;
        if (pale[j]) { if (!seen[j]) { seen[j] = 1; stack.push(j); } continue; }
        if (luma[j] <= DARK) darkEdge++; else openEdge++;
      }
    }
    if (cells.length < 40) continue;
    const outlined = darkEdge / Math.max(1, darkEdge + openEdge);
    if (outlined < 0.25) {
      for (const i of cells) scenery[i] = 1;
      removed += cells.length;
    } else {
      kept += cells.length;
    }
  }
  console.log(`  unoutlined tint removed ${removed} px, outlined tint kept ${kept} px`);
}

// Removing the pale fill leaves the outline that was drawn round it — the sun's
// rays and the rim of its disc survive as solid strokes, and they are what
// bridges the falling feathers to the wing. Eat any dark pixel that borders
// scenery and never borders pale figure: a ray's outline has nothing but sun on
// one side and ground on the other, while the wing's outline has wing behind it.
const OUTLINE_PASSES = 5;
for (let pass = 0; pass < OUTLINE_PASSES; pass++) {
  const add = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (isBg[i] || scenery[i] || luma[i] >= PALE) continue;
      let bordersScenery = false;
      let bordersFigure = false;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const j = (y + dy) * w + (x + dx);
          if (scenery[j]) bordersScenery = true;
          else if (!isBg[j] && luma[j] >= PALE) bordersFigure = true;
        }
      }
      if (bordersScenery && !bordersFigure) add.push(i);
    }
  }
  if (!add.length) break;
  for (const i of add) scenery[i] = 1;
  console.log(`  outline pass ${pass + 1}: ${add.length} px`);
}

const solid = new Uint8Array(N);
for (let i = 0; i < N; i++) solid[i] = !isBg[i] && !scenery[i] ? 1 : 0;

// --- keep the figure: dilate to bridge drawn lines, label, keep the biggest --
function largestBlob(mask, bridge) {
  const grown = new Uint8Array(N);
  const tmp = new Uint8Array(N);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let hit = 0;
      for (let d = -bridge; d <= bridge && !hit; d++) {
        const xx = x + d;
        if (xx >= 0 && xx < w && mask[y * w + xx]) hit = 1;
      }
      tmp[y * w + x] = hit;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let hit = 0;
      for (let d = -bridge; d <= bridge && !hit; d++) {
        const yy = y + d;
        if (yy >= 0 && yy < h && tmp[yy * w + x]) hit = 1;
      }
      grown[y * w + x] = hit;
    }
  }

  const label = new Int32Array(N).fill(-1);
  const sizes = [];
  for (let s = 0; s < N; s++) {
    if (!grown[s] || label[s] !== -1) continue;
    const id = sizes.length;
    let n = 0;
    const stack = [s];
    label[s] = id;
    while (stack.length) {
      const i = stack.pop();
      n++;
      const x = i % w, y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = yy * w + xx;
          if (grown[j] && label[j] === -1) { label[j] = id; stack.push(j); }
        }
      }
    }
    sizes.push(n);
  }
  let best = 0;
  for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[best]) best = i;
  const out = new Uint8Array(N);
  for (let i = 0; i < N; i++) out[i] = mask[i] && label[i] === best ? 1 : 0;
  console.log(`  ${sizes.length} components, kept the largest (${sizes[best]} px grown)`);
  return out;
}

const figure = largestBlob(solid, 5);

// --- incisions: whichever tone is the local minority is a drawn line --------
// Pale wings carry dark strokes; the dark body carries pale ones. Asking which
// tone dominates the neighbourhood catches both without knowing which is which.
const R = 7;
const paleSum = new Int32Array(N);
const anySum = new Int32Array(N);
{
  const pRow = new Int32Array(N), aRow = new Int32Array(N);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let p = 0, a = 0;
      for (let d = -R; d <= R; d++) {
        const xx = x + d;
        if (xx < 0 || xx >= w) continue;
        const i = y * w + xx;
        if (!figure[i]) continue;
        a++;
        if (luma[i] >= PALE) p++;
      }
      pRow[y * w + x] = p; aRow[y * w + x] = a;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let p = 0, a = 0;
      for (let d = -R; d <= R; d++) {
        const yy = y + d;
        if (yy < 0 || yy >= h) continue;
        p += pRow[yy * w + x]; a += aRow[yy * w + x];
      }
      paleSum[y * w + x] = p; anySum[y * w + x] = a;
    }
  }
}

const incision = new Uint8Array(N);
for (let i = 0; i < N; i++) {
  if (!figure[i]) continue;
  if (anySum[i] < 8) continue;
  const paleLocal = paleSum[i] / anySum[i] > 0.5;
  const thisPale = luma[i] >= PALE;
  const thisDark = luma[i] <= 105;
  if (paleLocal ? thisDark : thisPale) incision[i] = 1;
}

// --- the figure the importer will read --------------------------------------
{
  const o = Buffer.alloc(N * 3);
  for (let i = 0; i < N; i++) {
    const v = figure[i] ? (incision[i] ? 20 : 245) : 20;
    o[i * 3] = v; o[i * 3 + 1] = v; o[i * 3 + 2] = v;
  }
  S.writePNG(OUT, o, w, h);
}

let minX = w, maxX = -1, minY = h, maxY = -1;
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (figure[y * w + x]) {
  if (x < minX) minX = x; if (x > maxX) maxX = x;
  if (y < minY) minY = y; if (y > maxY) maxY = y;
}
if (maxX < 0) throw new Error("nothing survived — check the seeds against the scene");
console.log(
  `  figure ${maxX - minX + 1}x${maxY - minY + 1}, aspect ${((maxX - minX + 1) / (maxY - minY + 1)).toFixed(2)}` +
    `  ->  content/myths/${SLUG}/figure.png`,
);
