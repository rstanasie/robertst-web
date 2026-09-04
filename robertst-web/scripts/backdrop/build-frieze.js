"use strict";

// Bakes the homepage backdrop frieze into a single seamless SVG tile.
//
// The figural scenes are not re-drawn here: they are the same op lists the
// amphora's own texture is painted from, so the procession on the page really
// is the artwork on the vase. Ornaments (meander, palmette, lotus, rosette,
// bead-and-reel) are authored below, because the vase has no meander band.
//
// The tile is two band-pitch cells tall, so consecutive diagonal bands on the
// page alternate between the figural register and the ornamental one. The band
// edges themselves are drawn in CSS, not here — see app/globals.css.

const fs = require("fs");
const path = require("path");

const { prometheus, medusa, icarus } = require("../amphora/figures.js");

// --- tuning ----------------------------------------------------------------
// Tile units. 100 units = one band pitch on the page, so everything here is
// expressed as a fraction of band pitch and scales with it.
const PITCH = 100;
const CELLS = 2;                 // band pitches per tile => vertical repeat
const TILE_W = 560;              // tile length; larger = sparser procession
const BAND = 72;                 // band interior, as a share of PITCH
const FIGURE_H = 52;             // silhouette height in the figural register
const ORNAMENT_H = 30;           // motif height in the ornamental register
const INTERSTITIAL_H = 19;       // small motifs between the figures
const MEANDER_PERIODS = 46;      // even, so the alternating fret tiles cleanly
const BEAD_PERIODS = 40;

// Baked emphasis. The page dials the whole layer with --weave-opacity; these
// only set the hierarchy *within* the frieze.
const OPACITY = { figures: 1, ornaments: 0.8, dividers: 0.6 };

const COLOURS = {
  glaze: "#bbd6ef",   // pale blue standing in for the black slip
  clay: "#06152f",    // the page ground, so incisions cut back to it
  red: "#c0754e",     // desaturated terracotta, the added red
  white: "#efe4d0",   // muted cream, the added white
};

// --- reusing the vase's own motifs -----------------------------------------
function expect(condition, message) {
  if (!condition) throw new Error(`frieze: ${message}`);
}

const flamePoly = prometheus.filter((op) => op.k === "poly" && op.c === "red");
expect(flamePoly.length === 1, "expected exactly one added-red polygon (the torch flame) in prometheus");
// The flame alone reads as a star. Taking the two ops before it (the torch
// shaft and its head) and the two after (the incised tongues) gives a lit
// torch, which is legible at ornament size.
const torchAt = prometheus.indexOf(flamePoly[0]);
const torch = prometheus.slice(torchAt - 2, torchAt + 3);
expect(
  torch.length === 5 && torch[0].k === "stroke" && torch[1].k === "poly" && torch[3].c === "glaze" && torch[4].c === "glaze",
  "prometheus's torch is no longer a shaft, a head, the flame and two incisions",
);

// the eight snakes, then the gorgoneion
const gorgon = medusa.slice(-21);
expect(
  gorgon.slice(0, 8).every((op) => op.k === "stroke" && op.taper === 0.72),
  "medusa's snake run is no longer the 8 ops preceding the gorgoneion",
);

// --- authored ornaments ----------------------------------------------------
function palmette() {
  const ops = [];
  const petals = 11;
  for (let i = 0; i < petals; i++) {
    const a = ((160 - (140 * i) / (petals - 1)) * Math.PI) / 180;
    const reach = 1 - 0.1 * (Math.abs(i - (petals - 1) / 2) / ((petals - 1) / 2));
    ops.push({
      k: "stroke",
      pts: [
        [Math.cos(a) * 0.17, 0.1 + Math.sin(a) * 0.17],
        [Math.cos(a) * reach, 0.1 + Math.sin(a) * reach],
      ],
      w: 0.078,
      taper: 0.45,
      c: "glaze",
    });
  }
  ops.push({ k: "poly", pts: [[0, 0.34], [0.14, 0.18], [0.11, 0.02], [0, -0.06], [-0.11, 0.02], [-0.14, 0.18]], c: "glaze" });
  ops.push({ k: "stroke", pts: [[-0.07, 0.05], [-0.24, 0.01], [-0.32, 0.13], [-0.23, 0.21]], w: 0.055, taper: 0.3, c: "glaze" });
  ops.push({ k: "stroke", pts: [[0.07, 0.05], [0.24, 0.01], [0.32, 0.13], [0.23, 0.21]], w: 0.055, taper: 0.3, c: "glaze" });
  return ops;
}

function serpent() {
  return [
    { k: "stroke", pts: [[0.46, 0.62], [0.26, 0.34], [0.0, 0.16], [-0.24, 0.42], [-0.5, 0.2]], w: 0.23, taper: 0.55, c: "glaze" },
    { k: "poly", pts: [[0.4, 0.7], [0.6, 0.86], [0.66, 0.76], [0.5, 0.6]], c: "glaze" },
    { k: "stroke", pts: [[0.62, 0.83], [0.8, 0.95]], w: 0.038, taper: 0, c: "glaze" },
    { k: "stroke", pts: [[0.62, 0.83], [0.78, 0.85]], w: 0.038, taper: 0, c: "glaze" },
    { k: "ell", c: [0.5, 0.74], r: [0.035, 0.03], col: "clay" },
  ];
}

function lotus() {
  return [
    { k: "poly", pts: [[0, 1], [0.13, 0.55], [0.1, 0.16], [0, 0.04], [-0.1, 0.16], [-0.13, 0.55]], c: "glaze" },
    { k: "poly", pts: [[-0.16, 0.14], [-0.42, 0.52], [-0.46, 0.8], [-0.3, 0.6], [-0.14, 0.36]], c: "glaze" },
    { k: "poly", pts: [[0.16, 0.14], [0.42, 0.52], [0.46, 0.8], [0.3, 0.6], [0.14, 0.36]], c: "glaze" },
    { k: "stroke", pts: [[0, 0.1], [0, -0.14]], w: 0.06, taper: 0, c: "glaze" },
    { k: "ell", c: [0, 0.6], r: [0.05, 0.1], col: "clay" },
  ];
}

function rosette() {
  const ops = [{ k: "ell", c: [0, 0.5], r: [0.5, 0.5], col: "glaze" }];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    ops.push({ k: "ell", c: [Math.cos(a) * 0.3, 0.5 + Math.sin(a) * 0.3], r: [0.13, 0.13], col: "clay" });
  }
  ops.push({ k: "ell", c: [0, 0.5], r: [0.12, 0.12], col: "clay" });
  ops.push({ k: "ell", c: [0, 0.5], r: [0.05, 0.05], col: "glaze" });
  return ops;
}

// Alternating Greek fret between two rails. Height 1, one period per x unit.
function meander(periods) {
  const ops = [
    { k: "stroke", pts: [[0, 0], [periods, 0]], w: 0.09, taper: 0, c: "glaze" },
    { k: "stroke", pts: [[0, 1], [periods, 1]], w: 0.09, taper: 0, c: "glaze" },
  ];
  for (let i = 0; i < periods; i++) {
    const key = i % 2 === 0
      ? [[0.18, 0.04], [0.18, 0.78], [0.7, 0.78], [0.7, 0.34], [0.42, 0.34], [0.42, 0.56]]
      : [[0.18, 0.96], [0.18, 0.22], [0.7, 0.22], [0.7, 0.66], [0.42, 0.66], [0.42, 0.44]];
    ops.push({ k: "stroke", pts: key.map(([x, y]) => [i + x, y]), w: 0.1, taper: 0, c: "glaze" });
  }
  return ops;
}

function beadReel(periods) {
  const ops = [
    { k: "stroke", pts: [[0, 0.06], [periods, 0.06]], w: 0.08, taper: 0, c: "glaze" },
    { k: "stroke", pts: [[0, 0.94], [periods, 0.94]], w: 0.08, taper: 0, c: "glaze" },
  ];
  for (let i = 0; i < periods; i++) {
    ops.push({ k: "ell", c: [i + 0.25, 0.5], r: [0.22, 0.22], col: "glaze" });
    ops.push({ k: "stroke", pts: [[i + 0.72, 0.22], [i + 0.72, 0.78]], w: 0.14, taper: 0, c: "glaze" });
  }
  return ops;
}

// --- op geometry -----------------------------------------------------------
function bboxOf(ops) {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  const add = (x, y, pad) => {
    x0 = Math.min(x0, x - pad);
    x1 = Math.max(x1, x + pad);
    y0 = Math.min(y0, y - pad);
    y1 = Math.max(y1, y + pad);
  };
  for (const op of ops) {
    if (op.k === "ell") add(op.c[0], op.c[1], Math.max(op.r[0], op.r[1]));
    else for (const [x, y] of op.pts) add(x, y, op.k === "stroke" ? op.w / 2 : 0);
  }
  return { x0, x1, y0, y1, w: x1 - x0, h: y1 - y0 };
}

// Maps figure units (x right, y up) into tile units (y down), optionally
// mirrored. Widths scale with the unit so strokes keep their proportions.
function place(ops, { unit, ox, oy, flip = false }) {
  const sx = flip ? -unit : unit;
  const at = ([x, y]) => [ox + x * sx, oy - y * unit];
  return ops.map((op) => {
    if (op.k === "ell") return { ...op, c: at(op.c), r: [op.r[0] * unit, op.r[1] * unit], ring: op.ring === undefined ? undefined : op.ring * unit };
    return { ...op, pts: op.pts.map(at), w: op.w === undefined ? undefined : op.w * unit };
  });
}

// --- op -> SVG -------------------------------------------------------------
// Tile units run 0..560, so a tenth of a unit is already well under a device
// pixel at any sane band pitch. Rounding here is most of what keeps the tile
// small enough to be a background image.
const num = (n) => {
  const r = Math.round(n * 10) / 10;
  return Object.is(r, -0) ? "0" : String(r);
};

const subpath = (pts) => `M${pts.map(([x, y]) => `${num(x)} ${num(y)}`).join("L")}Z`;

const signedArea = (pts) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
};

// All subpaths of one op are wound the same way, so a nonzero fill unions them
// instead of punching holes where a round join overlaps its segment.
const wound = (pts) => (signedArea(pts) < 0 ? [...pts].reverse() : pts);

const ellipseArc = (cx, cy, rx, ry, sweep) =>
  `M${num(cx - rx)} ${num(cy)}` +
  `A${num(rx)} ${num(ry)} 0 1 ${sweep} ${num(cx + rx)} ${num(cy)}` +
  `A${num(rx)} ${num(ry)} 0 1 ${sweep} ${num(cx - rx)} ${num(cy)}Z`;

function discPolygon(cx, cy, r) {
  const steps = Math.max(6, Math.min(24, Math.round(r * 4)));
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

function opToPath(op) {
  const fill = COLOURS[op.k === "ell" ? op.col : op.c];

  if (op.k === "poly") {
    return `<path fill="${fill}" d="${subpath(wound(op.pts))}"/>`;
  }

  if (op.k === "ell") {
    const outer = ellipseArc(op.c[0], op.c[1], op.r[0], op.r[1], 0);
    if (op.ring === undefined) return `<path fill="${fill}" d="${outer}"/>`;
    const scale = 1 - op.ring / Math.min(op.r[0], op.r[1]);
    // opposite sweep, so nonzero leaves the middle open
    const inner = ellipseArc(op.c[0], op.c[1], op.r[0] * scale, op.r[1] * scale, 1);
    return `<path fill="${fill}" d="${outer}${inner}"/>`;
  }

  // Tapered polyline, matching the texture rasteriser: a quad per segment plus
  // a round join at every vertex.
  const lengths = [0];
  for (let i = 1; i < op.pts.length; i++) {
    lengths.push(lengths[i - 1] + Math.hypot(op.pts[i][0] - op.pts[i - 1][0], op.pts[i][1] - op.pts[i - 1][1]));
  }
  const total = lengths[lengths.length - 1] || 1;
  const halfAt = (i) => (op.w * (1 - op.taper * (lengths[i] / total))) / 2;

  const parts = [];
  for (let i = 0; i + 1 < op.pts.length; i++) {
    const [a, b] = [op.pts[i], op.pts[i + 1]];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / len;
    const ny = (b[0] - a[0]) / len;
    const wa = halfAt(i);
    const wb = halfAt(i + 1);
    parts.push(wound([
      [a[0] + nx * wa, a[1] + ny * wa],
      [b[0] + nx * wb, b[1] + ny * wb],
      [b[0] - nx * wb, b[1] - ny * wb],
      [a[0] - nx * wa, a[1] - ny * wa],
    ]));
  }
  for (let i = 0; i < op.pts.length; i++) {
    const half = halfAt(i);
    // Joins narrower than this are sub-pixel on the page; the segment quads
    // already meet closely enough there.
    if (half > 0.45) parts.push(wound(discPolygon(op.pts[i][0], op.pts[i][1], half)));
  }
  return `<path fill="${fill}" d="${parts.map(subpath).join("")}"/>`;
}

// --- registers -------------------------------------------------------------
// Distributes items across the full tile width with equal gaps, half a gap at
// each end, so the row tiles without a seam.
function layoutRow(items, width) {
  const total = items.reduce((sum, item) => sum + item.width, 0);
  const gap = (width - total) / items.length;
  expect(gap > 0, `row is wider than the tile (${num(total)} of ${width}); raise TILE_W or drop an item`);
  let x = gap / 2;
  const placed = items.map((item) => {
    const at = x;
    x += item.width + gap;
    return { ...item, x: at };
  });
  return { placed, gap };
}

// One item = ops, the scale to draw them at, and how it sits in the register.
// `align: "ground"` stands the item's lowest point on the ground line, which is
// what makes the figures read as a procession; `align: "float"` centres it, the
// way a vase painter's filling ornament hangs in the field. Motifs lifted out
// of a scene carry that scene's coordinates, so both cases have to work off the
// bounding box rather than off the local origin.
function item(ops, unit, align, flip = false) {
  const box = bboxOf(ops);
  return { ops, box, unit, align, flip, width: box.w * unit };
}

const figureUnit = FIGURE_H / Math.max(...[prometheus, medusa, icarus].map((f) => bboxOf(f).h));
const fig = (ops) => item(ops, figureUnit, "ground");
const orn = (ops, share = 1, flip = false) => item(ops, (ORNAMENT_H * share) / bboxOf(ops).h, "float", flip);
const small = (ops, share = 1) => item(ops, (INTERSTITIAL_H * share) / bboxOf(ops).h, "float");

function renderRow(items, width, { ground, centre, opacity }) {
  const { placed, gap } = layoutRow(items, width);
  const paths = placed.map((entry) => {
    const { box, unit, flip } = entry;
    const ox = flip ? entry.x + entry.width + box.x0 * unit : entry.x - box.x0 * unit;
    const oy = entry.align === "ground"
      ? ground + box.y0 * unit
      : centre + (box.y0 + box.h / 2) * unit;
    return place(entry.ops, { unit, ox, oy, flip }).map(opToPath).join("");
  });
  return { svg: `<g opacity="${opacity}">${paths.join("")}</g>`, gap };
}

function renderStrip(ops, { periods, width, centre, opacity }) {
  const unit = width / periods;
  const placed = place(ops, { unit, ox: 0, oy: centre + unit / 2 });
  return { svg: `<g opacity="${opacity}">${placed.map(opToPath).join("")}</g>`, height: unit };
}

// --- compose ---------------------------------------------------------------
const TILE_H = PITCH * CELLS;
const bandCentre = BAND / 2;
const gutterCentre = BAND + (PITCH - BAND) / 2;

const figural = renderRow(
  [fig(prometheus), small(palmette()), fig(medusa), small(lotus(), 0.92), fig(icarus), small(rosette(), 0.8)],
  TILE_W,
  { ground: bandCentre + FIGURE_H / 2, centre: bandCentre, opacity: OPACITY.figures },
);

const ornamental = renderRow(
  // the two serpents flank the gorgoneion, as they do around her head
  [orn(palmette()), orn(serpent(), 0.82), orn(torch, 1.05), orn(gorgon), orn(lotus(), 0.95), orn(serpent(), 0.82, true), orn(rosette(), 0.7)],
  TILE_W,
  { ground: PITCH + bandCentre + ORNAMENT_H / 2, centre: PITCH + bandCentre, opacity: OPACITY.ornaments },
);

const fret = renderStrip(meander(MEANDER_PERIODS), {
  periods: MEANDER_PERIODS,
  width: TILE_W,
  centre: gutterCentre,
  opacity: OPACITY.dividers,
});

const beads = renderStrip(beadReel(BEAD_PERIODS), {
  periods: BEAD_PERIODS,
  width: TILE_W,
  centre: PITCH + gutterCentre,
  opacity: OPACITY.dividers,
});

const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_W}" height="${TILE_H}" ` +
  `viewBox="0 0 ${TILE_W} ${TILE_H}" shape-rendering="geometricPrecision">` +
  figural.svg +
  fret.svg +
  ornamental.svg +
  beads.svg +
  `</svg>\n`;

const outDir = path.join(__dirname, "..", "..", "public", "images", "backdrop");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "myth-frieze.svg");
fs.writeFileSync(outFile, svg);

console.log(`tile            ${TILE_W} x ${TILE_H} (aspect ${num(TILE_W / TILE_H)})`);
console.log(`band            0..${BAND} of every ${PITCH} => --band-width should be ${num((BAND / PITCH) * 100)}% of --band-pitch`);
console.log(`figure unit     ${num(figureUnit)}  (silhouettes ${FIGURE_H} tall)`);
console.log(`figural gap     ${num(figural.gap)}`);
console.log(`ornament gap    ${num(ornamental.gap)}`);
console.log(`meander height  ${num(fret.height)}   bead height ${num(beads.height)}`);
console.log(`wrote           ${path.relative(process.cwd(), outFile)}  ${(svg.length / 1024).toFixed(1)} KB`);
