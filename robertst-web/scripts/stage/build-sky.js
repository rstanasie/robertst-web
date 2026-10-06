"use strict";

// Lights the backdrop: the temple burning from within, torches down the stair,
// and a warm lift across the whole acropolis.
//
//   node scripts/stage/build-sky.js
//
// Baked into the image rather than layered over it in CSS. The sky is
// `background-size: cover` with a crop that walks as the viewport narrows, so
// a CSS glow would have to track that crop at every breakpoint to stay on the
// temple — and would be one more full-viewport layer to composite. Painted
// into the pixels it registers perfectly and costs nothing at runtime.
//
// Coordinates are in the source image's own 1672x941 space, read off the
// photograph. If the source is ever replaced, every one of them is wrong.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "../..");
const SRC = path.join(root, "content/stage/night-temple.png");
const OUT_DIR = path.join(root, "public/images/stage");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "sky-"));

/**
 * The light is the amphora's own clay, pushed up to the brightness of a flame:
 * the vessel reads as the one warm thing in a cold sky, and the temple answers
 * it across the frame in the same hue. Cooling slightly toward the edge of
 * each pool is what stops a glow reading as a flat decal.
 */
const FLAME = [1.0, 0.5, 0.2];
const EMBER = [0.8, 0.36, 0.15];

/** The colonnade: light from inside the building, between the columns. */
const TEMPLE = { x0: 249, x1: 361, y0: 393, y1: 425 };

/** The gatehouse arch, two thirds of the way down the rock. */
const GATE = { x: 433, y: 508 };

/**
 * The stair, traced down from the gate. Torches are spaced along it rather
 * than placed one by one, so the run can be retraced without re-authoring
 * every flame.
 */
const STAIR = [
  [432, 522], [412, 536], [392, 548], [374, 560], [358, 570],
  [340, 578], [324, 586], [312, 592], [302, 600],
];

/** The rock the whole thing stands on, lifted just enough to belong to it. */
const ACROPOLIS = { x: 272, y: 522, rx: 300, ry: 175 };

const SIZES = [
  { width: 1672, quality: 82, name: "night-temple.webp" },
  { width: 1000, quality: 80, name: "night-temple-sm.webp" },
];

// --- read ------------------------------------------------------------------
execFileSync("cwebp", ["-quiet", "-lossless", SRC, "-o", path.join(scratch, "src.webp")]);
execFileSync("dwebp", ["-quiet", path.join(scratch, "src.webp"), "-ppm", "-o", path.join(scratch, "src.ppm")]);

const ppm = fs.readFileSync(path.join(scratch, "src.ppm"));
let cursor = 0;
const token = () => {
  while (ppm[cursor] <= 32) cursor += 1;
  let out = "";
  while (ppm[cursor] > 32) out += String.fromCharCode(ppm[cursor++]);
  return out;
};
token();
const W = Number(token());
const H = Number(token());
token();
cursor += 1;
const pixels = cursor;

// --- light -----------------------------------------------------------------
// Added in linear light. Summing gamma-encoded values brightens the midtones
// far faster than the highlights, which turns every pool of light into a flat
// grey disc before its centre has got anywhere near a flame.
const toLinear = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  toLinear[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

const fromLinear = (value) => {
  const c = Math.min(1, Math.max(0, value));
  const encoded = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(encoded * 255);
};

const light = new Float32Array(W * H * 3);

const add = (x, y, amount, colour) => {
  if (x < 0 || y < 0 || x >= W || y >= H || amount <= 0) return;
  const o = (y * W + x) * 3;
  light[o] += amount * colour[0];
  light[o + 1] += amount * colour[1];
  light[o + 2] += amount * colour[2];
};

/**
 * One pool of light. `squash` widens it horizontally — a flame seen through
 * columns spills sideways along the architrave rather than in a circle, and a
 * perfectly round glow is the thing that reads as a sticker.
 */
function pool(cx, cy, radius, strength, colour, squash = 1) {
  const rx = radius * squash;
  const x0 = Math.max(0, Math.floor(cx - rx));
  const x1 = Math.min(W - 1, Math.ceil(cx + rx));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(H - 1, Math.ceil(cy + radius));

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / radius;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= 1) continue;
      // Squared smoothstep: a soft shoulder and a long tail, so the pool has a
      // bright heart and no edge anywhere.
      const falloff = (1 - d * d) * (1 - d * d);
      add(x, y, strength * falloff, colour);
    }
  }
}

// The building, lit from inside: a row of pools along the colonnade so the
// light comes through the gaps rather than off the front, one broader pool for
// the glow standing in the air around it, and a flare along the architrave.
const columns = 7;
for (let i = 0; i < columns; i++) {
  const x = TEMPLE.x0 + ((i + 0.5) / columns) * (TEMPLE.x1 - TEMPLE.x0);
  const y = TEMPLE.y0 + (TEMPLE.y1 - TEMPLE.y0) * 0.62;
  pool(x, y, 14, 0.2, FLAME);
}
pool((TEMPLE.x0 + TEMPLE.x1) / 2, (TEMPLE.y0 + TEMPLE.y1) / 2, 46, 0.16, FLAME, 1.45);
pool((TEMPLE.x0 + TEMPLE.x1) / 2, (TEMPLE.y0 + TEMPLE.y1) / 2, 125, 0.085, EMBER, 1.3);

// The gate, which is the one other opening with something behind it.
pool(GATE.x, GATE.y, 12, 0.22, FLAME);
pool(GATE.x, GATE.y, 52, 0.09, EMBER, 1.15);

// Torches down the stair. Spacing is in pixels along the run rather than per
// vertex, so the flames stay evenly spread however the polyline is retraced,
// and each one is jittered a little: a line of identical dots reads as a
// runway, not as fire.
const SPACING = 9;
let carried = 0;
let torch = 0;
for (let i = 1; i < STAIR.length; i++) {
  const [ax, ay] = STAIR[i - 1];
  const [bx, by] = STAIR[i];
  const run = Math.hypot(bx - ax, by - ay);

  for (let along = SPACING - carried; along < run; along += SPACING) {
    const t = along / run;
    const wobble = ((torch * 97) % 11) / 11 - 0.5;
    pool(ax + (bx - ax) * t, ay + (by - ay) * t, 4, 0.2 + wobble * 0.07, FLAME);
    pool(ax + (bx - ax) * t, ay + (by - ay) * t, 12, 0.045, EMBER);
    torch += 1;
  }

  carried = (carried + run) % SPACING;
}

// And the rock itself, so the structure reads as one lit thing rather than as
// a dark hill with bright spots on it.
pool(ACROPOLIS.x, ACROPOLIS.y, ACROPOLIS.ry, 0.075, EMBER, ACROPOLIS.rx / ACROPOLIS.ry);

// --- composite and write ---------------------------------------------------
const lit = Buffer.alloc(W * H * 3);
for (let i = 0; i < W * H; i++) {
  for (let k = 0; k < 3; k++) {
    lit[i * 3 + k] = fromLinear(toLinear[ppm[pixels + i * 3 + k]] + light[i * 3 + k]);
  }
}

const litPath = path.join(scratch, "lit.ppm");
fs.writeFileSync(litPath, Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`), lit]));

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  const out = path.join(OUT_DIR, size.name);
  execFileSync("cwebp", [
    "-quiet", "-q", String(size.quality), "-m", "6",
    "-resize", String(size.width), "0",
    litPath, "-o", out,
  ]);
  console.log(`  ${size.name}  ${size.width}px  ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
}

console.log(`lit ${torch} torches on the stair`);
