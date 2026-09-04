"use strict";

// Turns a drawing into a black-figure stencil the texture painter can stamp.
//
// Drawings of this kind are red-figure in polarity: a light figure on a dark
// ground, with dark lines inside it. A vase is the other way round — the figure
// is solid glaze and its detail is cut back to the clay — so the conversion is
// an inversion, not a copy:
//
//   light pixels            -> glaze   (the silhouette)
//   dark pixels inside it   -> clay    (incised lines)
//   dark pixels outside it  -> nothing (the clay ground shows through)
//
// Polarity is detected from the border, so a black drawing on white paper works
// without a flag. Shapes far from the main one are dropped, which is how a title
// in the corner of a screenshot gets left behind.
//
// Note "far from", not "smaller than". A drawing whose dark lines cross its own
// shapes is not one connected region — this reference is 83 of them — so an area
// threshold deletes the thin ones: half a staff, the leaves, part of a cup.
// Grouping is done by dilating the mask enough to bridge a drawn line, labelling
// that, and keeping whatever lands in the largest blob.
//
// Coverage is kept as a float rather than a hard mask: the stencil is usually
// smaller than the patch of texture it lands on, and bilinear coverage
// thresholded at the destination is what keeps the outline clean when it is
// scaled up.

const S = require("./shared.js");

function otsu(hist, total) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let cut = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
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

function loadFigure(file, { bridge = 6, feather = 12, minSpeck = 6 } = {}) {
  const { w, h, px, channels } = S.readPNG(file);
  const n = w * h;

  const lum = new Float32Array(n);
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    const o = i * channels;
    const a = channels === 4 ? px[o + 3] / 255 : 1;
    const v = a * (0.2126 * px[o] + 0.7152 * px[o + 1] + 0.0722 * px[o + 2]);
    lum[i] = v;
    hist[Math.min(255, Math.max(0, Math.round(v)))] += 1;
  }

  const cut = otsu(hist, n);

  // Which side is the ground? Whatever most of the border is.
  let borderLight = 0;
  let borderCount = 0;
  for (let x = 0; x < w; x++) {
    for (const y of [0, h - 1]) {
      borderLight += lum[y * w + x] > cut ? 1 : 0;
      borderCount += 1;
    }
  }
  for (let y = 0; y < h; y++) {
    for (const x of [0, w - 1]) {
      borderLight += lum[y * w + x] > cut ? 1 : 0;
      borderCount += 1;
    }
  }
  const groundIsLight = borderLight > borderCount / 2;

  // Soft coverage of "figure", 0..1.
  const cover = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const d = (groundIsLight ? cut - lum[i] : lum[i] - cut) / feather;
    cover[i] = Math.min(1, Math.max(0, 0.5 + d));
  }

  // Group the drawing: dilate enough to close the drawn lines, label that, and
  // keep every original pixel that lands in the biggest blob. `bridge` has to
  // exceed half a line width and stay well under the gap to any caption.
  const solid = new Uint8Array(n);
  for (let i = 0; i < n; i++) solid[i] = cover[i] >= 0.5 ? 1 : 0;

  const grown = new Uint8Array(n);
  {
    const rowPass = new Uint8Array(n);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let hit = 0;
        for (let d = -bridge; d <= bridge && !hit; d++) {
          const nx = x + d;
          if (nx >= 0 && nx < w && solid[y * w + nx]) hit = 1;
        }
        rowPass[y * w + x] = hit;
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let hit = 0;
        for (let d = -bridge; d <= bridge && !hit; d++) {
          const ny = y + d;
          if (ny >= 0 && ny < h && rowPass[ny * w + x]) hit = 1;
        }
        grown[y * w + x] = hit;
      }
    }
  }

  const label = new Int32Array(n).fill(-1);
  const areas = [];
  const stack = [];
  for (let seed = 0; seed < n; seed++) {
    if (!grown[seed] || label[seed] !== -1) continue;
    const id = areas.length;
    let area = 0;
    stack.push(seed);
    label[seed] = id;
    while (stack.length) {
      const i = stack.pop();
      area += 1;
      const x = i % w;
      const y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (grown[j] && label[j] === -1) {
            label[j] = id;
            stack.push(j);
          }
        }
      }
    }
    areas.push(area);
  }
  if (areas.length === 0) throw new Error(`${file}: no figure found`);
  const main = areas.indexOf(Math.max(...areas));

  let x0 = w;
  let x1 = -1;
  let y0 = h;
  let y1 = -1;
  for (let i = 0; i < n; i++) {
    if (!solid[i] || label[i] !== main) {
      cover[i] = 0;
      solid[i] = 0;
      continue;
    }
    const x = i % w;
    const y = (i / w) | 0;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (x1 < x0) throw new Error(`${file}: nothing survived grouping`);
  void minSpeck;

  // Interior detail: ground-coloured pixels the outside cannot reach.
  const outside = new Uint8Array(n);
  const queue = [];
  const push = (i) => {
    if (!solid[i] && !outside[i]) {
      outside[i] = 1;
      queue.push(i);
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
  while (queue.length) {
    const i = queue.pop();
    const x = i % w;
    const y = (i / w) | 0;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }

  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  const figure = new Float32Array(cw * ch);
  const incision = new Float32Array(cw * ch);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const src = (y + y0) * w + (x + x0);
      const dst = y * cw + x;
      figure[dst] = cover[src];
      incision[dst] = outside[src] ? 0 : 1 - cover[src];
    }
  }

  return { w: cw, h: ch, figure, incision };
}

// Bilinear, clamped at the edges.
function sample(field, w, h, u, v) {
  const x = Math.min(w - 1, Math.max(0, u * w - 0.5));
  const y = Math.min(h - 1, Math.max(0, v * h - 0.5));
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const x2 = Math.min(w - 1, xi + 1);
  const y2 = Math.min(h - 1, yi + 1);
  const a = field[yi * w + xi];
  const b = field[yi * w + x2];
  const c = field[y2 * w + xi];
  const d = field[y2 * w + x2];
  return a * (1 - xf) * (1 - yf) + b * xf * (1 - yf) + c * (1 - xf) * yf + d * xf * yf;
}

module.exports = { loadFigure, sample };
