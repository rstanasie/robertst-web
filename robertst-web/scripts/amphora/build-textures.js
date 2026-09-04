"use strict";

// Paints the amphora's three sheets: base colour, roughness and normal.
//
// The belly carries one continuous frieze — one figure per entry in
// data/vase-panels.json and nothing between them: the figures share a single
// register of reserved clay, the way a running frieze does. A sealed entry
// is painted like the others and then obscured: the picture is blurred and two
// glaze cords are tied across it. That happens at the end of the base-colour
// pass, because the cords have to stay crisp over a blurred figure.
//
// Everything is rasterised into a material-id buffer first, at 2x, and only then
// shaded. That keeps the wear, fire clouds and glaze thinning as one coherent
// pass over clean masks instead of a stack of colour blends, and it means the
// roughness map is derived from exactly the same masks the colour is.

const fs = require("fs");
const path = require("path");
const S = require("./shared.js");
const FIGURES = require("./figures.js");
const { loadFigure, sample } = require("./figure-image.js");

const [, , OUT_DIR, LAYOUT_PATH, PANELS_PATH] = process.argv;
const layout = JSON.parse(fs.readFileSync(LAYOUT_PATH, "utf8"));
const SS = 2;
const W = S.TEX_W;
const H = S.TEX_H;
const SW = W * SS;
const SH = H * SS;
const ROUGH_W = 1024;
const ROUGH_H = 512;
const NORMAL_W = 1024;
const NORMAL_H = 512;

// --- material ids ----------------------------------------------------------
const CLAY = 0;
const GLAZE = 1;
const RED = 2;
const WHITE = 3;
const PALE = 4; // unglazed clay, e.g. the underside of the foot

const id = new Uint8Array(SW * SH).fill(CLAY);

// --- rasteriser (x wraps, y clips) -----------------------------------------
const put = (x, y, value) => {
  if (y < 0 || y >= SH) return;
  const xi = ((Math.round(x) % SW) + SW) % SW;
  id[y * SW + xi] = value;
};
const span = (x0, x1, y, value) => {
  if (y < 0 || y >= SH) return;
  for (let x = Math.round(x0); x <= Math.round(x1); x++) put(x, y, value);
};

function fillPoly(points, value) {
  const ys = points.map((p) => p[1]);
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const y1 = Math.min(SH - 1, Math.ceil(Math.max(...ys)));
  for (let y = y0; y <= y1; y++) {
    const cy = y + 0.5;
    const crossings = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      if ((a[1] <= cy && b[1] > cy) || (b[1] <= cy && a[1] > cy)) {
        crossings.push(a[0] + ((cy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
    }
    crossings.sort((p, q) => p - q);
    for (let i = 0; i + 1 < crossings.length; i += 2) span(crossings[i], crossings[i + 1], y, value);
  }
}

function fillDisc(cx, cy, rx, ry, value) {
  const y0 = Math.max(0, Math.floor(cy - ry));
  const y1 = Math.min(SH - 1, Math.ceil(cy + ry));
  for (let y = y0; y <= y1; y++) {
    const dy = (y + 0.5 - cy) / ry;
    if (Math.abs(dy) > 1) continue;
    const dx = rx * Math.sqrt(1 - dy * dy);
    span(cx - dx, cx + dx, y, value);
  }
}

function ringDisc(cx, cy, rx, ry, width, value) {
  const y0 = Math.max(0, Math.floor(cy - ry - width));
  const y1 = Math.min(SH - 1, Math.ceil(cy + ry + width));
  for (let y = y0; y <= y1; y++) {
    for (let x = Math.floor(cx - rx - width); x <= Math.ceil(cx + rx + width); x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      const d = Math.hypot(nx, ny);
      const inner = 1 - width / Math.min(rx, ry);
      if (d <= 1 && d >= inner) put(x, y, value);
    }
  }
}

// Thick polyline with optional taper toward the far end, round joins.
function strokePath(points, width, taper, value) {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    lengths.push(lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  }
  const total = lengths[lengths.length - 1] || 1;
  const widthAt = (i) => (width * (1 - taper * (lengths[i] / total))) / 2;

  for (let i = 0; i + 1 < points.length; i++) {
    const [a, b] = [points[i], points[i + 1]];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const wa = widthAt(i);
    const wb = widthAt(i + 1);
    fillPoly([
      [a[0] + nx * wa, a[1] + ny * wa],
      [b[0] + nx * wb, b[1] + ny * wb],
      [b[0] - nx * wb, b[1] - ny * wb],
      [a[0] - nx * wa, a[1] - ny * wa],
    ], value);
    fillDisc(a[0], a[1], wa, wa, value);
  }
  const last = points.length - 1;
  fillDisc(points[last][0], points[last][1], widthAt(last), widthAt(last), value);
}

const fillRows = (v0, v1, value) => {
  for (let y = Math.max(0, Math.round(v0 * SH)); y < Math.min(SH, Math.round(v1 * SH)); y++) {
    for (let x = 0; x < SW; x++) id[y * SW + x] = value;
  }
};

// --- surface metrics -------------------------------------------------------
const V = layout.v;
const profile = S.buildProfile();
const pxV = layout.pxPerUnitV * SS; // supersampled px per unit of real surface height
const radiusAtV = (v) => profile.radiusAtV(Math.min(Math.max(v, 0), S.BODY_V_MAX));
// supersampled px per unit of real horizontal distance, at this height
const pxUAt = (v) => SW / (2 * Math.PI * Math.max(radiusAtV(v), 0.02));

const X = (u) => u * SW;
const Y = (v) => v * SH;

// --- bands -----------------------------------------------------------------
fillRows(0, V.lipBottom, GLAZE);
fillRows(V.lipBottom, V.lipBottom + 0.0022, CLAY);
fillRows(V.neckTop, V.neckBottom, GLAZE);
fillRows(V.neckTop + 0.030, V.neckTop + 0.0345, RED);
fillRows(V.ornamentTop, V.ornamentBottom, CLAY);
fillRows(V.panelTop, V.panelBottom, CLAY);
fillRows(V.lowerTop, V.lowerBottom, GLAZE);
fillRows(V.rayTop, V.rayBottom, CLAY);
fillRows(V.footTop, S.BODY_V_MAX, GLAZE);
fillRows(S.BODY_V_MAX - 0.010, S.BODY_V_MAX, PALE);

// Encircling lines. Greek painters framed every zone; these are what stop the
// bands reading as flat colour blocks.
function encircle(v, thickness, value) {
  fillRows(v - thickness / 2, v + thickness / 2, value);
}
encircle(V.ornamentTop - 0.0035, 0.0045, GLAZE);
encircle(V.ornamentBottom + 0.0035, 0.0045, GLAZE);
encircle(V.panelTop - 0.0016, 0.0022, RED);
encircle(V.panelBottom + 0.0060, 0.0075, GLAZE);
encircle(V.panelBottom + 0.0135, 0.0026, RED);
encircle(V.lowerBottom + 0.0030, 0.0038, GLAZE);
encircle(V.rayBottom + 0.0032, 0.0042, GLAZE);
encircle(V.footTop - 0.0090, 0.0026, RED);

// --- rosette chain on the shoulder ----------------------------------------
{
  const vMid = (V.ornamentTop + V.ornamentBottom) / 2;
  const bandReal = ((V.ornamentBottom - V.ornamentTop) * SH) / pxV;
  const circumference = 2 * Math.PI * radiusAtV(vMid);
  const count = Math.max(6, Math.round(circumference / (bandReal * 0.94)));
  const step = SW / count;
  const rx = bandReal * 0.40 * pxUAt(vMid);
  const ry = bandReal * 0.40 * pxV;
  const cy = Y(vMid);

  for (let i = 0; i < count; i++) {
    const cx = (i + 0.5) * step;
    fillDisc(cx, cy, rx, ry, GLAZE);
    for (let p = 0; p < 8; p++) {
      const a = (p / 8) * Math.PI * 2 + Math.PI / 8;
      fillDisc(cx + Math.cos(a) * rx * 0.60, cy + Math.sin(a) * ry * 0.60, rx * 0.26, ry * 0.26, CLAY);
    }
    fillDisc(cx, cy, rx * 0.30, ry * 0.30, CLAY);
    fillDisc(cx, cy, rx * 0.13, ry * 0.13, GLAZE);
    // linking dots between rosettes
    fillDisc(cx + step / 2, cy, rx * 0.15, ry * 0.15, GLAZE);
  }
}

// --- ray band above the foot ----------------------------------------------
{
  const vTop = V.rayTop + 0.0035;
  const vBottom = V.rayBottom - 0.0035;
  const bandReal = ((vBottom - vTop) * SH) / pxV;
  const circumference = 2 * Math.PI * radiusAtV((vTop + vBottom) / 2);
  const count = Math.max(10, Math.round(circumference / (bandReal * 0.52)));
  const step = SW / count;
  const half = step * 0.30;
  for (let i = 0; i < count; i++) {
    const cx = (i + 0.5) * step;
    fillPoly([
      [cx - half, Y(vBottom)],
      [cx + half, Y(vBottom)],
      [cx + half * 0.34, Y(vTop) + 6],
      [cx, Y(vTop)],
      [cx - half * 0.34, Y(vTop) + 6],
    ], GLAZE);
  }
}

// --- figure placement ------------------------------------------------------
// Centres come straight from the UV contract: a myth at amphora angle A is
// painted at u = ((180 - A) / 360) mod 1.
const ROOT = path.join(__dirname, "..", "..");
const PANELS = JSON.parse(fs.readFileSync(PANELS_PATH, "utf8")).map((panel) => ({
  key: panel.key,
  access: panel.access,
  airborne: Boolean(panel.airborne),
  u: (((180 - panel.angle) / 360) % 1 + 1) % 1,
  stencil: panel.figure ? loadFigure(path.join(ROOT, panel.figure)) : null,
  ops: FIGURES[panel.key] ?? (panel.access === "locked" ? FIGURES.veiled : null),
}));
const SLOT_U = 1 / PANELS.length;
/** Half-width of a sealed panel's blur, in slots. Also the edge a wide figure
    beside one must stay clear of, so it is declared once for both. */
const SEALED_HALF = 0.46;

// --- figural scenes --------------------------------------------------------
function bbox(ops) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const grow = (x, y, pad) => {
    minX = Math.min(minX, x - pad);
    maxX = Math.max(maxX, x + pad);
    minY = Math.min(minY, y - pad);
    maxY = Math.max(maxY, y + pad);
  };
  for (const op of ops) {
    if (op.k === "poly") for (const p of op.pts) grow(p[0], p[1], 0);
    if (op.k === "stroke") for (const p of op.pts) grow(p[0], p[1], op.w / 2);
    if (op.k === "ell") grow(op.c[0], op.c[1], Math.max(op.r[0], op.r[1]));
  }
  return { minX, maxX, minY, maxY };
}

const FIGURE_FILL = 0.90; // of the panel's painted height
const FIGURE_TOP = 1.15;  // authored y that lands at the top of that height
const FIGURE_SPAN = 0.78; // of the slot's width, at its widest figure
const panelRealHeight = ((V.panelBottom - V.panelTop) * SH) / pxV;
const groundV = V.panelBottom - 0.020;

for (const panel of PANELS) {
  if (!panel.stencil && !panel.ops) {
    throw new Error(
      `nothing to paint for "${panel.key}". Put a drawing at ` +
        `content/figures/${panel.key}.png, or author a scene in scripts/amphora/figures.js.`,
    );
  }
}

// One scale for every figure, so they keep the relative sizes they were drawn
// at — and narrow enough that the widest of them fits its share of the belly.
// With five slots instead of three, width is the binding constraint, not height.
const slotRealWidth = (layout.bellyCircumference ?? 2 * Math.PI * layout.maxRadius) * SLOT_U;
const widest = Math.max(...PANELS.map((panel) => { const b = bbox(panel.ops ?? FIGURES.veiled); return b.maxX - b.minX; }));
const FIGURE_UNIT = Math.min(
  (panelRealHeight * FIGURE_FILL) / FIGURE_TOP,
  (slotRealWidth * FIGURE_SPAN) / widest,
);
console.log(
  `frieze: ${PANELS.length} figures, unit ${FIGURE_UNIT.toFixed(4)} ` +
    `(height would allow ${((panelRealHeight * FIGURE_FILL) / FIGURE_TOP).toFixed(4)}, ` +
    `slot width ${((slotRealWidth * FIGURE_SPAN) / widest).toFixed(4)})`,
);

// Rectangles to blur, and the cord pixels that must stay crisp inside them.
const sealedRects = [];
const crisp = new Uint8Array(SW * SH);

const slotRealWidthCap = slotRealWidth * FIGURE_SPAN;

// A figure with its wings spread is wide and, held to the width every other
// figure is cut to, ends up half their height — small enough on the belly to
// read as a mistake. So it is allowed to spill into the field either side, as
// far as its actual neighbours leave free.
//
// What a neighbour occupies is not the same for all of them. A painted one
// takes its own figure width. A sealed one is blurred across 0.46 of a slot
// either side of its centre, and a wingtip caught in that blur would look like
// a fault in the render, so the blur is the edge that counts. Derived from the
// week rather than fixed, so it follows the collection: if Orpheus is a
// preview next week, Icarus gets the room back.
const NEIGHBOUR_GAP = 0.02; // of a slot, kept clear either side

function spreadAllowance(index) {
  let half = Infinity;
  for (const step of [-1, 1]) {
    const neighbour = PANELS[(index + step + PANELS.length) % PANELS.length];
    const theirs = neighbour.access === "locked" ? SEALED_HALF : FIGURE_SPAN / 2;
    half = Math.min(half, 1 - theirs - NEIGHBOUR_GAP);
  }
  return Math.max(FIGURE_SPAN, 2 * half) * slotRealWidth;
}

for (const [index, panel] of PANELS.entries()) {
  const sx = pxUAt(0.5 * (V.panelTop + V.panelBottom));

  if (panel.stencil) {
    // Real units first, then into texels, because a texel is not square on the
    // belly: the sheet is stretched about 1.5x horizontally at the widest point.
    const st = panel.stencil;
    let realH = panelRealHeight * FIGURE_FILL;
    let realW = realH * (st.w / st.h);
    const cap = panel.airborne ? spreadAllowance(index) : slotRealWidthCap;
    if (realW > cap) {
      realH *= cap / realW;
      realW = cap;
    }
    console.log(
      `  ${panel.key}: ${realW.toFixed(4)} x ${realH.toFixed(4)}` +
        ` (${((100 * realH) / (panelRealHeight * FIGURE_FILL)).toFixed(0)}% of the panel height` +
        `, ${((100 * realW) / slotRealWidth).toFixed(0)}% of a slot)`,
    );

    const drawW = realW * sx;
    const drawH = realH * pxV;
    const left = X(panel.u) - drawW / 2;
    // A wide figure is a short one, since the slot caps its width, and standing
    // that on the ground line leaves a band of empty clay over its head. For a
    // figure that flies the empty clay is the sky, so it is split above and
    // below and the figure floats in the middle of the panel instead.
    const maxDrawH = panelRealHeight * FIGURE_FILL * pxV;
    const bottom = panel.airborne
      ? Y(groundV) - (maxDrawH - drawH) / 2
      : Y(groundV);

    for (let y = Math.floor(bottom - drawH); y < Math.ceil(bottom); y++) {
      const v = (y + 0.5 - (bottom - drawH)) / drawH;
      if (v < 0 || v >= 1) continue;
      for (let x = Math.floor(left); x < Math.ceil(left + drawW); x++) {
        const u = (x + 0.5 - left) / drawW;
        if (u < 0 || u >= 1) continue;
        if (sample(st.figure, st.w, st.h, u, v) > 0.5) put(x, y, GLAZE);
        else if (sample(st.incision, st.w, st.h, u, v) > 0.5) put(x, y, CLAY);
      }
    }
    continue;
  }

  const box = bbox(panel.ops);
  const unit = FIGURE_UNIT;
  const cx = X(panel.u) - ((box.minX + box.maxX) / 2) * unit * sx;
  const baseY = Y(groundV);

  const to = (p) => [cx + p[0] * unit * sx, baseY - p[1] * unit * pxV];
  const paint = (c) => ({ glaze: GLAZE, clay: CLAY, red: RED, white: WHITE }[c]);

  for (const op of panel.ops) {
    if (op.k === "poly") fillPoly(op.pts.map(to), paint(op.c));
    else if (op.k === "stroke") {
      strokePath(op.pts.map(to), op.w * unit * sx, op.taper || 0, paint(op.c));
    } else if (op.k === "ell") {
      const centre = to(op.c);
      const rx = op.r[0] * unit * sx;
      const ry = op.r[1] * unit * pxV;
      if (op.ring) ringDisc(centre[0], centre[1], rx, ry, op.ring * unit * sx, paint(op.col));
      else fillDisc(centre[0], centre[1], rx, ry, paint(op.col));
    }
  }

  if (panel.access === "locked") {
    // Two cords tied across the picture: the frieze's way of saying "not this
    // one". Painted into the id buffer so they behave as glaze under the light,
    // and recorded so the blur below leaves them alone.
    const halfW = SLOT_U * SW * 0.29;
    const cx = X(panel.u);
    const yTop = Y(V.panelTop + 0.020);
    const yBottom = Y(V.panelBottom - 0.020);
    const cordW = 0.0095 * sx;

    // Rasterised with a marker value rather than straight to GLAZE: the veiled
    // figure underneath is glaze too, so a before/after diff would miss exactly
    // the pixels where the cords cross it — and those are the ones that have to
    // survive the blur.
    const CORD = 200;
    for (const [from, to] of [
      [[cx - halfW, yTop], [cx + halfW, yBottom]],
      [[cx + halfW, yTop], [cx - halfW, yBottom]],
    ]) {
      const mid = [(from[0] + to[0]) / 2 + cordW * 0.7, (from[1] + to[1]) / 2];
      strokePath([from, mid, to], cordW, 0, CORD);
    }
    for (let i = 0; i < id.length; i++) {
      if (id[i] === CORD) {
        crisp[i] = 1;
        id[i] = GLAZE;
      }
    }

    sealedRects.push({
      x0: Math.max(0, Math.floor((cx - SLOT_U * SW * SEALED_HALF) / SS)),
      x1: Math.min(W, Math.ceil((cx + SLOT_U * SW * SEALED_HALF) / SS)),
      y0: Math.max(0, Math.floor(Y(V.panelTop) / SS)),
      y1: Math.min(H, Math.ceil(Y(V.panelBottom) / SS)),
    });
    continue;
  }

  // A short painted inscription, the way vase painters labelled their figures.
  // Deliberately faux-Greek: it should read as paint, not as a caption.
  const marks = [
    [[0, 0], [0.5, 1], [1, 0]],                       // lambda
    [[0, 0], [1, 0], [0.5, 1], [0, 0]],               // delta
    [[1, 1], [0, 1], [0.6, 0.5], [0, 0], [1, 0]],     // sigma
    [[0, 0], [0, 1], [1, 1]],                         // gamma
    [[0.5, 0], [0.5, 1]],                             // iota
    [[0, 0], [0, 1], [1, 0], [1, 1]],                 // nu
    [[0, 1], [1, 0], [0.5, 0.5], [0, 0], [1, 1]],     // chi
    [[0, 0], [1, 1], [0, 1], [1, 0]],                 // xi-ish
    [[0.5, 0], [0.5, 1], [0, 0.75], [1, 0.75], [0.5, 0.35]], // phi
    [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]],         // omicron
    [[0, 0], [0, 1], [1, 1], [1, 0.5], [0, 0.5]],     // rho
  ];
  const glyphH = 0.0155 * pxV;
  const glyphW = 0.0098 * sx;
  let seed = 0;
  for (let i = 0; i < panel.key.length; i++) seed += panel.key.charCodeAt(i) * (i + 3);
  let gx = X(panel.u) + 0.128 * sx;
  const gy = Y(V.panelTop + 0.042);
  for (let i = 0; i < 5; i++) {
    const mark = marks[(seed * (i + 1) * 5 + i * i) % marks.length];
    strokePath(mark.map(([mx, my]) => [gx + mx * glyphW, gy + (1 - my) * glyphH]), 0.0026 * sx, 0, GLAZE);
    gx += glyphW * 1.9;
  }
}

// --- handle strip ----------------------------------------------------------
{
  const u1 = S.HANDLE_U1 * 2;
  const y0 = Math.round(S.HANDLE_V0 * SH);
  const y1 = SH;
  const rows = y1 - y0;
  for (let y = y0; y < y1; y++) {
    const g = (y - y0) / rows;
    const crest = Math.min(g, 1 - g); // 0 on the outer ridge, 0.5 on the inner face
    for (let x = 0; x < Math.round(u1 * SW); x++) {
      // reserved line down each outer edge, the rest glazed
      id[y * SW + x] = crest > 0.088 && crest < 0.116 ? CLAY : GLAZE;
    }
    for (let x = Math.round(u1 * SW); x < SW; x++) id[y * SW + x] = CLAY;
  }
}

// --- noise fields ----------------------------------------------------------
function field(w, h, freqU, freqV, seed, octaves) {
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      data[y * w + x] = S.fbm((x / w) * freqU, (y / h) * freqV, freqU, seed, octaves);
    }
  }
  return {
    sample(u, v) {
      const fx = (((u % 1) + 1) % 1) * w - 0.5;
      const fy = Math.min(Math.max(v, 0), 0.999999) * h - 0.5;
      const x0 = Math.floor(fx);
      const y0 = Math.max(0, Math.min(h - 1, Math.floor(fy)));
      const y1 = Math.min(h - 1, y0 + 1);
      const tx = fx - x0;
      const ty = fy - Math.floor(fy);
      const wrap = (i) => ((i % w) + w) % w;
      const a = data[y0 * w + wrap(x0)];
      const b = data[y0 * w + wrap(x0 + 1)];
      const c = data[y1 * w + wrap(x0)];
      const d = data[y1 * w + wrap(x0 + 1)];
      return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    },
  };
}

const cloudField = field(256, 128, 4, 3, 1301, 4);
const thinField = field(512, 256, 17, 12, 5507, 3);
const chipField = field(1536, 768, 150, 96, 9109, 2);
const lossField = field(384, 192, 26, 18, 7331, 3);
const stainField = field(256, 128, 9, 7, 6113, 4);
const dampField = field(128, 64, 3, 3, 3301, 2);
const sheenField = field(192, 96, 11, 8, 2749, 3);

// Where a vase actually gets worn: the lip, the widest point of the belly and
// the foot ring take the knocks; the recessed zones are protected.
function exposure(v) {
  const peak = (centre, width) => Math.exp(-(((v - centre) / width) ** 2));
  return Math.min(1,
    1.00 * peak(0.010, 0.030) +
    0.85 * peak(V.panelBottom + 0.02, 0.075) +
    0.55 * peak((V.panelTop + V.panelBottom) / 2, 0.110) +
    0.95 * peak(S.BODY_V_MAX - 0.02, 0.040) +
    0.45 * peak(V.neckBottom, 0.035));
}

// Baked contact shadow. The wall's own concavity plus the pockets under the
// handles; without it the silhouette reads as a decal on a balloon.
function concavity(v) {
  const d = 0.012;
  const mid = profile.radiusAtV(Math.min(Math.max(v, 0), S.BODY_V_MAX));
  const above = profile.radiusAtV(Math.min(Math.max(v - d, 0), S.BODY_V_MAX));
  const below = profile.radiusAtV(Math.min(Math.max(v + d, 0), S.BODY_V_MAX));
  return Math.max(0, (above + below) / 2 - mid) / 0.012;
}
const handleAnchors = [
  { v: profile.vAtY(0.884), spread: 0.030 },
  { v: profile.vAtY(0.651), spread: 0.038 },
];
function occlusion(u, v) {
  let ao = 1 - 0.30 * Math.min(1, concavity(v));
  const du = Math.min(Math.abs(u - 0.25), Math.abs(u - 0.75), Math.abs(u + 0.25), Math.abs(u - 1.25));
  const lateral = Math.exp(-((du / 0.052) ** 2));
  for (const anchor of handleAnchors) {
    ao -= 0.26 * lateral * Math.exp(-(((v - anchor.v) / anchor.spread) ** 2));
  }
  // the whole underbelly sits away from the light
  ao -= 0.10 * Math.max(0, (v - 0.45) / 0.43);
  return Math.max(0.55, ao);
}
const aoTable = new Float32Array(512 * 256);
for (let y = 0; y < 256; y++) {
  for (let x = 0; x < 512; x++) aoTable[y * 512 + x] = occlusion(x / 512, (y / 256) * 1.0);
}
const sampleAO = (u, v) => {
  const x = Math.min(511, Math.max(0, Math.round((((u % 1) + 1) % 1) * 512)));
  const y = Math.min(255, Math.max(0, Math.round(v * 256)));
  return aoTable[y * 512 + x];
};

// --- palette (sRGB) --------------------------------------------------------
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const CLAY_COOL = [176, 91, 41];
const CLAY_BASE = [205, 116, 55];
const CLAY_WARM = [227, 155, 92];
const CLAY_PALE = [201, 149, 105];
const GLAZE_DEEP = [22, 18, 17];
const GLAZE_THIN = [104, 55, 31];
const GLAZE_BARE = [147, 84, 46];
const ADDED_RED = [152, 55, 33];
const ADDED_WHITE = [227, 214, 187];
const CHIP_EDGE = [163, 96, 58];
const ENCRUST = [198, 186, 163];

function shade(material, sx, sy) {
  const u = sx / SW;
  const v = sy / SH;
  const cloud = cloudField.sample(u, v);
  const thin = thinField.sample(u, v);
  const grit = S.hash2(sx, sy, 7717);
  const wear = exposure(v);

  let colour;
  if (material === GLAZE || material === RED) {
    // Glaze fired unevenly and went red-brown where it was laid on thin. Wear
    // takes it back to bare clay in patches.
    // chips need two scales: where loss is plausible at all, and the fine
    // speckle inside those zones. One field alone gives camouflage blotches.
    const chip = chipField.sample(u, v) * 0.62
      + Math.max(0, lossField.sample(u, v) - 0.52) * 0.72
      + 0.16 * wear + 0.05 * (grit - 0.5);
    const base = material === RED ? ADDED_RED : GLAZE_DEEP;
    const thinness = Math.max(0, thin - 0.62) / 0.38;
    colour = mix(base, material === RED ? mix(ADDED_RED, GLAZE_BARE, 0.5) : GLAZE_THIN, thinness * 0.72);
    if (chip > 0.700) {
      const depth = Math.min(1, (chip - 0.700) / 0.075);
      colour = mix(colour, mix(mix(colour, CHIP_EDGE, 0.7), CHIP_EDGE, depth * 0.8), Math.min(1, depth * 1.4));
    }
  } else if (material === WHITE) {
    const flake = chipField.sample(u, v) * 0.7 + Math.max(0, lossField.sample(u, v) - 0.55) * 0.8 + 0.14 * wear;
    colour = mix(ADDED_WHITE, mix(ADDED_WHITE, CLAY_WARM, 0.7), Math.min(1, Math.max(0, flake - 0.60) / 0.24));
  } else {
    // Reserved clay: fire clouds, then the paler stripe of the unglazed foot.
    const t = Math.min(1, Math.max(0, (cloud - 0.32) / 0.36));
    colour = mix(mix(CLAY_COOL, CLAY_BASE, Math.min(1, t * 2)), CLAY_WARM, Math.max(0, t * 2 - 1));
    if (material === PALE) colour = mix(colour, CLAY_PALE, 0.75);
    // slip abrasion dulls the reserved ground where it was handled
    colour = mix(colour, CLAY_PALE, Math.min(0.4, Math.max(0, chipField.sample(u, v) - 0.66) * 1.1 * wear));
  }

  // encrustation, ground-in and pooling in the recesses
  const stain = stainField.sample(u, v);
  const damp = dampField.sample(u, v);
  const crust = Math.max(0, stain - 0.60) / 0.40 * (0.30 + 0.55 * Math.max(0, (v - 0.30) / 0.58));
  colour = mix(colour, ENCRUST, Math.min(0.26, crust * 0.34));

  // clay inclusions
  const speck = (grit - 0.5) * (material === GLAZE ? 1.6 : 3.2);
  colour = [colour[0] + speck, colour[1] + speck * 0.85, colour[2] + speck * 0.7];

  // baked occlusion and a slow overall value drift
  const ao = sampleAO(u, v) * (0.965 + 0.07 * damp);
  return [colour[0] * ao, colour[1] * ao, colour[2] * ao];
}

// --- base colour -----------------------------------------------------------
const basecolour = Buffer.alloc(W * H * 3);
const glazeCoverage = new Float32Array(W * H);
const wearCoverage = new Float32Array(W * H);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    let r = 0;
    let g = 0;
    let b = 0;
    let glaze = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const px = x * SS + sx;
        const py = y * SS + sy;
        const material = id[py * SW + px];
        const c = shade(material, px, py);
        r += c[0];
        g += c[1];
        b += c[2];
        if (material === GLAZE || material === RED) glaze += 1;
      }
    }
    const n = SS * SS;
    const o = (y * W + x) * 3;
    basecolour[o] = Math.min(255, Math.max(0, Math.round(r / n)));
    basecolour[o + 1] = Math.min(255, Math.max(0, Math.round(g / n)));
    basecolour[o + 2] = Math.min(255, Math.max(0, Math.round(b / n)));
    glazeCoverage[y * W + x] = glaze / n;
    wearCoverage[y * W + x] = Math.max(0, chipField.sample(x / W, y / H) - 0.62) * exposure(y / H);
  }
}

// --- obscuring the sealed figures ------------------------------------------
// A sealed slot is painted like any other and then put out of reach here: the
// picture is blurred, and the cords tied across it are held back from the blur
// so they stay crisp. Doing it on the shaded colour rather than on the material
// ids is deliberate — the glaze is still glaze, so roughness and relief stay
// correct and the obscured figure still catches the light like pottery.
if (sealedRects.length > 0) {
  // Two separable box passes approximate a gaussian and stay cheap. The radius
  // is a fraction of the sheet so it survives a change of texture resolution.
  const RADIUS = Math.max(3, Math.round(W / 150));
  const PASSES = 2;

  // A cord pixel at output resolution is any with cord in its supersampled
  // footprint. The cords blur with everything else and are then put back, which
  // leaves them crisp with a soft shadow where the blur pulled them outward.
  const isCord = (x, y) => {
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        if (crisp[(y * SS + sy) * SW + (x * SS + sx)]) return true;
      }
    }
    return false;
  };

  for (const rect of sealedRects) {
    const w = rect.x1 - rect.x0;
    const h = rect.y1 - rect.y0;
    const kept = [];
    for (let y = rect.y0; y < rect.y1; y++) {
      for (let x = rect.x0; x < rect.x1; x++) {
        if (!isCord(x, y)) continue;
        const o = (y * W + x) * 3;
        kept.push([o, basecolour[o], basecolour[o + 1], basecolour[o + 2]]);
      }
    }

    for (let pass = 0; pass < PASSES; pass++) {
      // horizontal, wrapping: the belly is a cylinder and a slot may cross u = 0
      const row = new Float32Array(w * 3);
      for (let y = rect.y0; y < rect.y1; y++) {
        for (let i = 0; i < w; i++) {
          let r = 0;
          let g = 0;
          let b = 0;
          for (let d = -RADIUS; d <= RADIUS; d++) {
            const o = (y * W + ((rect.x0 + i + d + W) % W)) * 3;
            r += basecolour[o];
            g += basecolour[o + 1];
            b += basecolour[o + 2];
          }
          const n = RADIUS * 2 + 1;
          row[i * 3] = r / n;
          row[i * 3 + 1] = g / n;
          row[i * 3 + 2] = b / n;
        }
        for (let i = 0; i < w; i++) {
          const o = (y * W + rect.x0 + i) * 3;
          basecolour[o] = Math.round(row[i * 3]);
          basecolour[o + 1] = Math.round(row[i * 3 + 1]);
          basecolour[o + 2] = Math.round(row[i * 3 + 2]);
        }
      }

      // vertical, clamped: the panel does not wrap top to bottom
      const column = new Float32Array(h * 3);
      for (let x = rect.x0; x < rect.x1; x++) {
        for (let j = 0; j < h; j++) {
          let r = 0;
          let g = 0;
          let b = 0;
          let n = 0;
          for (let d = -RADIUS; d <= RADIUS; d++) {
            const y = Math.min(rect.y1 - 1, Math.max(rect.y0, rect.y0 + j + d));
            const o = (y * W + x) * 3;
            r += basecolour[o];
            g += basecolour[o + 1];
            b += basecolour[o + 2];
            n += 1;
          }
          column[j * 3] = r / n;
          column[j * 3 + 1] = g / n;
          column[j * 3 + 2] = b / n;
        }
        for (let j = 0; j < h; j++) {
          const o = ((rect.y0 + j) * W + x) * 3;
          basecolour[o] = Math.round(column[j * 3]);
          basecolour[o + 1] = Math.round(column[j * 3 + 1]);
          basecolour[o + 2] = Math.round(column[j * 3 + 2]);
        }
      }
    }

    for (const [o, r, g, b] of kept) {
      basecolour[o] = r;
      basecolour[o + 1] = g;
      basecolour[o + 2] = b;
    }
  }
  console.log(`sealed: ${sealedRects.length} slot(s) blurred (radius ${RADIUS}px x ${PASSES}) and corded`);
}

// --- roughness (glTF metallicRoughness: G = roughness, B = metalness) ------
// The single most important value here is the *contrast*: fired glaze keeps a
// low satin sheen, the reserved clay body is almost fully matte, and worn spots
// are rougher still. Uniform roughness is what reads as plastic.
const CLAY_ROUGH = 0.94;
const GLAZE_ROUGH = 0.55;
const WORN_ROUGH = 0.985;
const roughness = Buffer.alloc(ROUGH_W * ROUGH_H * 3);
const scaleX = W / ROUGH_W;
const scaleY = H / ROUGH_H;
for (let y = 0; y < ROUGH_H; y++) {
  for (let x = 0; x < ROUGH_W; x++) {
    let glaze = 0;
    let worn = 0;
    let n = 0;
    for (let sy = 0; sy < scaleY; sy++) {
      for (let sx = 0; sx < scaleX; sx++) {
        const i = Math.min(H - 1, y * scaleY + sy) * W + Math.min(W - 1, x * scaleX + sx);
        glaze += glazeCoverage[i];
        worn += wearCoverage[i];
        n += 1;
      }
    }
    glaze /= n;
    worn = Math.min(1, (worn / n) * 2.4);
    const jitter = (sheenField.sample(x / ROUGH_W, y / ROUGH_H) - 0.5) * 0.10;
    let value = CLAY_ROUGH + (GLAZE_ROUGH - CLAY_ROUGH) * glaze;
    value = value + (WORN_ROUGH - value) * worn + jitter;
    // Written grayscale so lossy compression has no chroma to smear. glTF reads
    // roughness from green; metalness is pinned to zero by the material factor.
    const encoded = Math.min(255, Math.max(0, Math.round(value * 255)));
    const o = (y * ROUGH_W + x) * 3;
    roughness[o] = encoded;
    roughness[o + 1] = encoded;
    roughness[o + 2] = encoded;
  }
}

// --- normal map ------------------------------------------------------------
// Height is throwing ridges plus clay grain plus a slight relief where the glaze
// sits proud of the slip. The gradients are then scaled to hit a target mean
// tilt: authoring amplitudes by hand gets the *relative* weights right but the
// absolute strength wrong by an order of magnitude, which corrugates the vase.
const TARGET_MEAN_TILT_DEG = 3.2;
const MAX_TILT_DEG = 22;

const ridgeField = field(64, 384, 2, 3, 2207, 2);
const grainField = field(512, 256, 74, 48, 8821, 2);
const dentField = field(160, 80, 7, 6, 4409, 3);

// Soft glaze mask: a hard id lookup puts a one-texel cliff around every painted
// line, which reads as an embossed outline rather than a brushed edge.
const glazeSoft = new Float32Array(NORMAL_W * NORMAL_H);
{
  const kx = W / NORMAL_W;
  const ky = H / NORMAL_H;
  for (let y = 0; y < NORMAL_H; y++) {
    for (let x = 0; x < NORMAL_W; x++) {
      let sum = 0;
      let n = 0;
      for (let sy = -1; sy <= ky; sy++) {
        for (let sx = -1; sx <= kx; sx++) {
          const px = ((Math.round(x * kx + sx) % W) + W) % W;
          const py = Math.min(H - 1, Math.max(0, Math.round(y * ky + sy)));
          sum += glazeCoverage[py * W + px];
          n += 1;
        }
      }
      glazeSoft[y * NORMAL_W + x] = sum / n;
    }
  }
}

function height(x, y) {
  const u = x / NORMAL_W;
  const v = y / NORMAL_H;
  const bodyV = Math.min(v, S.BODY_V_MAX);

  // wheel ridges: horizontal, drifting in density and fading in and out
  const density = 200 + 70 * ridgeField.sample(u * 0.15, bodyV);
  const amplitude = 0.30 + 0.70 * ridgeField.sample(u, bodyV * 1.6);
  let h = amplitude * Math.sin(bodyV * density) * (v < S.BODY_V_MAX ? 1 : 0.3);

  h += 2.6 * (dentField.sample(u, v) - 0.5);
  h += 0.9 * (grainField.sample(u, v) - 0.5);
  h += 0.35 * (S.hash2(x, y, 1553) - 0.5);
  h += 1.4 * glazeSoft[y * NORMAL_W + x];
  return h;
}

const heights = new Float32Array(NORMAL_W * NORMAL_H);
for (let y = 0; y < NORMAL_H; y++) {
  for (let x = 0; x < NORMAL_W; x++) heights[y * NORMAL_W + x] = height(x, y);
}

// One texel spans more real distance vertically than horizontally, so the two
// gradients carry different weights or the ridges shear as the vase turns.
const aspect = (layout.pxPerUnitUAtBelly / W) / (layout.pxPerUnitV / (H * S.BODY_V_MAX));
const gradient = new Float32Array(NORMAL_W * NORMAL_H * 2);
let sumSquared = 0;
for (let y = 0; y < NORMAL_H; y++) {
  for (let x = 0; x < NORMAL_W; x++) {
    const at = (dx, dy) =>
      heights[Math.min(NORMAL_H - 1, Math.max(0, y + dy)) * NORMAL_W + (((x + dx) % NORMAL_W) + NORMAL_W) % NORMAL_W];
    const dhdx = ((at(1, 0) - at(-1, 0)) / 2) * aspect;
    const dhdy = (at(0, 1) - at(0, -1)) / 2;
    const o = (y * NORMAL_W + x) * 2;
    gradient[o] = dhdx;
    gradient[o + 1] = dhdy;
    sumSquared += dhdx * dhdx + dhdy * dhdy;
  }
}
const rms = Math.sqrt(sumSquared / (NORMAL_W * NORMAL_H));
const strength = rms > 1e-9 ? Math.tan((TARGET_MEAN_TILT_DEG * Math.PI) / 180) / rms : 0;
const maxSlope = Math.tan((MAX_TILT_DEG * Math.PI) / 180);

const normal = Buffer.alloc(NORMAL_W * NORMAL_H * 3);
let peakTilt = 0;
for (let y = 0; y < NORMAL_H; y++) {
  for (let x = 0; x < NORMAL_W; x++) {
    const o = (y * NORMAL_W + x) * 2;
    let sx = gradient[o] * strength;
    let sy = gradient[o + 1] * strength;
    const slope = Math.hypot(sx, sy);
    if (slope > maxSlope) {
      sx *= maxSlope / slope;
      sy *= maxSlope / slope;
    }
    peakTilt = Math.max(peakTilt, Math.min(slope, maxSlope));
    // glTF tangent space: +X along +u, +Y along the bitangent (up the sheet)
    const nx = -sx;
    const ny = sy;
    const len = Math.hypot(nx, ny, 1);
    const t = (y * NORMAL_W + x) * 3;
    normal[t] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
    normal[t + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
    normal[t + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
  }
}
console.log(`  normal tilt: mean ${TARGET_MEAN_TILT_DEG.toFixed(1)}deg, peak ${((Math.atan(peakTilt) * 180) / Math.PI).toFixed(1)}deg`);

// --- write -----------------------------------------------------------------
const dir = OUT_DIR;
fs.mkdirSync(dir, { recursive: true });
const sizes = {
  basecolor: S.writePNG(path.join(dir, "amphora-basecolor.png"), basecolour, W, H),
  roughness: S.writePNG(path.join(dir, "amphora-roughness.png"), roughness, ROUGH_W, ROUGH_H),
  normal: S.writePNG(path.join(dir, "amphora-normal.png"), normal, NORMAL_W, NORMAL_H),
};
let total = 0;
for (const [name, bytes] of Object.entries(sizes)) {
  total += bytes;
  console.log(`  ${name.padEnd(10)} ${(bytes / 1024).toFixed(0).padStart(5)} KB`);
}
console.log(`textures -> ${dir} (${(total / 1024).toFixed(0)} KB total)`);
let glazePixels = 0;
for (const c of glazeCoverage) glazePixels += c;
console.log(`  glaze covers ${((glazePixels / (W * H)) * 100).toFixed(1)}% of the sheet`);
