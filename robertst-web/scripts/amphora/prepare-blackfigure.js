"use strict";

// Turns a black-figure reference into a figure the amphora importer can read.
//
//   node scripts/amphora/prepare-blackfigure.js <ref.png> <slug> [options]
//   node scripts/amphora/prepare-blackfigure.js athena-ref.png athena '{"erase":[[0,120,90,150]]}'
//
// The third preparer, because references arrive in three polarities and this is
// the one the other two cannot take:
//
//   prepare-lineart.js      ink outlines on white paper
//   prepare-figure.js       an illustrated scene, mixed polarity, with scenery
//   this                    an actual black-figure vase: solid dark figures on
//                           a flat clay ground, their detail reserved *through*
//                           the figure in the ground's own colour
//
// That last part is why it is short. The importer wants a light silhouette with
// dark lines inside it; a black-figure photograph is already exactly that,
// inverted — the glaze is the silhouette and the reserved lines are the
// incisions, and both fall out of one threshold. There is no flood fill here
// and no component grouping, because there is nothing to separate: every dark
// pixel is either figure or lettering, and lettering is what `erase` is for.
//
// Options, as JSON:
//   erase   [[x0, y0, x1, y1], ...]  painted back to ground before anything
//           else. Vase painters signed their work and labelled their gods, and
//           a name beside a figure is dark exactly like the figure is.
//   cut     luminance threshold, 0-255. Measured by Otsu when absent.
//   speck   dark blobs smaller than this many pixels are dropped. Default 24.
//   incise  widens the reserved lines inside the figure, in source pixels.
//           A panel is painted at roughly six tenths of the size a reference
//           is drawn at, so a two-pixel incision is sub-pixel by the time it
//           reaches the clay and simply is not there. Widening it here is the
//           only place the loss can be undone: by the time the stencil is
//           sampled, the line is already gone. Default 0.

const fs = require("fs");
const path = require("path");
const S = require("./shared.js");

const [, , SRC, SLUG, OPTIONS_JSON] = process.argv;

if (!SRC || !SLUG) {
  console.error("usage: prepare-blackfigure.js <ref.png> <slug> [options JSON]");
  process.exit(1);
}

const options = OPTIONS_JSON ? JSON.parse(OPTIONS_JSON) : {};
const ERASE = options.erase ?? [];
const SPECK = options.speck ?? 24;
const INCISE = options.incise ?? 0;

const ROOT = path.join(__dirname, "..", "..");
const OUT = path.join(ROOT, "content", "figures", `${SLUG}.png`);

const { w, h, px, channels } = S.readPNG(SRC);
const n = w * h;

// --- threshold --------------------------------------------------------------
const lum = new Float32Array(n);
const hist = new Uint32Array(256);

for (let i = 0; i < n; i++) {
  const o = i * channels;
  const alpha = channels === 4 ? px[o + 3] / 255 : 1;
  // Unpainted corners of a photographed sherd are transparent, not pale, and
  // would otherwise read as the darkest thing in the picture.
  const value = alpha * (0.2126 * px[o] + 0.7152 * px[o + 1] + 0.0722 * px[o + 2]) + (1 - alpha) * 255;
  lum[i] = value;
  hist[Math.min(255, Math.max(0, Math.round(value)))] += 1;
}

function otsu() {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];

  let sumB = 0;
  let wB = 0;
  let best = 0;
  let cut = 128;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = n - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const between = wB * wF * Math.pow(sumB / wB - (sum - sumB) / wF, 2);
    if (between > best) {
      best = between;
      cut = t;
    }
  }

  return cut;
}

const CUT = options.cut ?? otsu();
const dark = new Uint8Array(n);
for (let i = 0; i < n; i++) dark[i] = lum[i] < CUT ? 1 : 0;

for (const [x0, y0, x1, y1] of ERASE) {
  for (let y = Math.max(0, y0); y < Math.min(h, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) dark[y * w + x] = 0;
  }
}

// --- drop specks ------------------------------------------------------------
// Compression noise and the stipple of a photographed surface, not drawing.
const label = new Int32Array(n).fill(-1);
const sizes = [];
const queue = new Int32Array(n);

for (let seed = 0; seed < n; seed++) {
  if (!dark[seed] || label[seed] !== -1) continue;

  const id = sizes.length;
  let head = 0;
  let tail = 0;
  queue[tail++] = seed;
  label[seed] = id;

  while (head < tail) {
    const at = queue[head++];
    const x = at % w;
    const y = (at - x) / w;

    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const next = ny * w + nx;
      if (!dark[next] || label[next] !== -1) continue;
      label[next] = id;
      queue[tail++] = next;
    }
  }

  sizes.push(tail);
}

let dropped = 0;
for (let i = 0; i < n; i++) {
  if (dark[i] && sizes[label[i]] < SPECK) {
    dark[i] = 0;
    dropped += 1;
  }
}

// --- widen the incisions ----------------------------------------------------
// Only inward. The outer contour of the figure is its silhouette and must not
// move, so the widening is forbidden anywhere near the ground: without that,
// thickening the lines inside a figure also eats a ring off the outside of it.
if (INCISE > 0) {
  const outside = new Uint8Array(n);
  const stack = [];

  for (let x = 0; x < w; x++) {
    for (const y of [0, h - 1]) {
      const at = y * w + x;
      if (!dark[at] && !outside[at]) { outside[at] = 1; stack.push(at); }
    }
  }
  for (let y = 0; y < h; y++) {
    for (const x of [0, w - 1]) {
      const at = y * w + x;
      if (!dark[at] && !outside[at]) { outside[at] = 1; stack.push(at); }
    }
  }

  while (stack.length > 0) {
    const at = stack.pop();
    const x = at % w;
    const y = (at - x) / w;

    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const next = ny * w + nx;
      if (dark[next] || outside[next]) continue;
      outside[next] = 1;
      stack.push(next);
    }
  }

  // Round, not square. A box dilation widens a diagonal line by a factor of
  // 1.4 more than a vertical one and leaves stepped corners wherever two lines
  // meet — which is exactly the blockiness a widened incision shows up as once
  // the figure is painted large.
  const dilate = (mask, radius) => {
    const out = new Uint8Array(n);
    const reach = [];
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= radius * radius) reach.push([dx, dy]);
      }
    }

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!mask[y * w + x]) continue;
        for (const [dx, dy] of reach) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          out[ny * w + nx] = 1;
        }
      }
    }
    return out;
  };

  const enclosed = new Uint8Array(n);
  for (let i = 0; i < n; i++) enclosed[i] = !dark[i] && !outside[i] ? 1 : 0;

  const wider = dilate(enclosed, INCISE);
  const nearGround = dilate(outside, INCISE);
  let widened = 0;

  for (let i = 0; i < n; i++) {
    if (dark[i] && wider[i] && !nearGround[i]) {
      dark[i] = 0;
      widened += 1;
    }
  }

  console.log(`  incisions widened by ${INCISE}px (${widened} px cut back to clay)`);
}

// --- write ------------------------------------------------------------------
// The inversion the importer wants: glaze becomes the light silhouette, the
// reserved lines inside it and the ground outside it both become dark.
const out = Buffer.alloc(n * 3);
let painted = 0;

for (let i = 0; i < n; i++) {
  const value = dark[i] ? 245 : 20;
  out[i * 3] = value;
  out[i * 3 + 1] = value;
  out[i * 3 + 2] = value;
  if (dark[i]) painted += 1;
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
S.writePNG(OUT, out, w, h);

const kept = sizes.filter((size) => size >= SPECK).length;
console.log(`${SRC} -> ${path.relative(ROOT, OUT)}`);
console.log(`  ${w}x${h}, cut ${CUT}, ${(painted / n * 100).toFixed(1)}% figure`);
console.log(`  ${kept} shapes kept, ${sizes.length - kept} specks dropped (${dropped} px)`);
