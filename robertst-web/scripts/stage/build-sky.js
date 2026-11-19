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
 * The light is the amphora's own clay — #c26847, normalised and lifted to the
 * brightness of a flame rather than invented as a fire colour. The vessel is
 * the one warm thing in a cold sky and the temple answers it across the frame
 * in very nearly the same hue, which is what makes them read as one scene
 * rather than as an object standing in front of a picture.
 *
 * Warmer than the clay, and deliberately: a flame a good step more orange than
 * the thing it lights still reads as the source, and the clay reads as lit.
 * Matched exactly the two flatten into each other, and matched too closely —
 * which the first attempt was — the fire goes pink and stops looking like
 * fire at all.
 */
const FLAME = [1.0, 0.52, 0.16];
const EMBER = [0.86, 0.42, 0.13];

/** The moon is the only cold light in the scene, and the only one from above. */
const MOONLIGHT = [0.78, 0.84, 1.0];

/**
 * Where it hangs. Clear sky, high and to the right — the side the vessel's key
 * light comes from, so the pot and the sky agree about where the night's one
 * light source is.
 *
 * Further right than it looks it should be: `cover` crops this plate before
 * anyone sees it, so the position that matters is where it lands on screen,
 * not where it sits in the file. Much further right than this and it is behind
 * the bank of cloud at the plate's edge.
 */
const MOON = { x: 1330, y: 300, radius: 28, bite: 10 };

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

/**
 * Where the scene gets warmed, 0 to 1.
 *
 * Adding orange light to a white lamp gives a brighter white lamp — the
 * photograph's own temple and stair lights are near-white, and no amount of
 * additive orange will make them read as fire, because adding to something
 * already near the top of the range only moves it toward white faster.
 *
 * So the lit parts are also *filtered*: the existing pixels are multiplied
 * toward WARM before anything is added to them, which takes the blue out of
 * the light that is already there. Add and multiply together are what turn a
 * white lamp orange; either alone cannot.
 */
const tint = new Float32Array(W * H);

/** Raises red, holds green, cuts blue. A sheet of orange gel over the lamp. */
const WARM = [1.2, 0.76, 0.33];

const add = (x, y, amount, colour) => {
  if (x < 0 || y < 0 || x >= W || y >= H || amount <= 0) return;
  const o = (y * W + x) * 3;
  light[o] += amount * colour[0];
  light[o + 1] += amount * colour[1];
  light[o + 2] += amount * colour[2];
};

/** Lays the gel over an area, with the same soft-shouldered falloff as a pool. */
function warm(cx, cy, radius, strength, squash = 1) {
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
      const falloff = (1 - d * d) * (1 - d * d);
      const at = y * W + x;
      tint[at] = Math.min(1, tint[at] + strength * falloff);
    }
  }
}

/**
 * One pool of light.
 *
 * Note what strength buys. Light is summed, so a strong pool runs its centre
 * to white and the colour survives only at the rim: past about 0.3 the hue is
 * gone from the middle whatever `colour` says. An orange temple is therefore
 * made of weak wide pools rather than bright narrow ones — the halo is where
 * the colour actually lives. `squash` widens it horizontally — a flame seen through
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

/**
 * A crescent: everything inside one disc and outside another, offset. Drawn
 * this way rather than as an arc because the terminator of a real crescent is
 * an ellipse — a stroked arc gives two sharp horns and a flat inner edge, and
 * reads as a logo.
 */
function crescent(cx, cy, radius, bite, strength, colour) {
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(W - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(H - 1, Math.ceil(cy + radius));
  // The shadowed limb is a disc of the same size pushed down and to the left,
  // which is where the sun would be if the moon is lit from the upper right.
  const shadow = { x: cx - bite * 0.78, y: cy + bite * 0.62, radius };

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const inside = 1 - Math.hypot(x - cx, y - cy) / radius;
      if (inside <= 0) continue;

      const outside = Math.hypot(x - shadow.x, y - shadow.y) / shadow.radius - 1;
      if (outside <= 0) continue;

      // Both edges feathered over a pixel or two, so the limb is not a stair.
      const edge = Math.min(1, inside * radius * 0.6) * Math.min(1, outside * radius * 0.6);
      add(x, y, strength * edge, colour);
    }
  }
}

// The moon, its halo, and the wash of it across the sky on that side.
crescent(MOON.x, MOON.y, MOON.radius, MOON.bite, 1.15, MOONLIGHT);
// Two haloes and both weak. A tight bright one reads as fog round the moon
// rather than as moonlight.
pool(MOON.x, MOON.y, 110, 0.03, MOONLIGHT);
pool(MOON.x, MOON.y, 360, 0.028, MOONLIGHT, 1.25);

// The gel, over everything that already carries a light in the photograph.
warm(TEMPLE.x0 + (TEMPLE.x1 - TEMPLE.x0) / 2, TEMPLE.y0 + 16, 54, 1, 1.6);
warm((TEMPLE.x0 + TEMPLE.x1) / 2, (TEMPLE.y0 + TEMPLE.y1) / 2, 130, 0.62, 1.4);
warm(GATE.x, GATE.y, 50, 1, 1.1);

// The building, lit from inside: a row of pools along the colonnade so the
// light comes through the gaps rather than off the front, one broader pool for
// the glow standing in the air around it, and a flare along the architrave.
const columns = 7;
for (let i = 0; i < columns; i++) {
  const x = TEMPLE.x0 + ((i + 0.5) / columns) * (TEMPLE.x1 - TEMPLE.x0);
  const y = TEMPLE.y0 + (TEMPLE.y1 - TEMPLE.y0) * 0.62;
  pool(x, y, 18, 0.1, FLAME);
}
pool((TEMPLE.x0 + TEMPLE.x1) / 2, (TEMPLE.y0 + TEMPLE.y1) / 2, 52, 0.11, FLAME, 1.45);
pool((TEMPLE.x0 + TEMPLE.x1) / 2, (TEMPLE.y0 + TEMPLE.y1) / 2, 140, 0.185, EMBER, 1.3);

// The gate, which is the one other opening with something behind it.
pool(GATE.x, GATE.y, 14, 0.2, FLAME);
pool(GATE.x, GATE.y, 62, 0.19, EMBER, 1.15);

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
    pool(ax + (bx - ax) * t, ay + (by - ay) * t, 5, 0.2 + wobble * 0.07, FLAME);
    pool(ax + (bx - ax) * t, ay + (by - ay) * t, 22, 0.115, EMBER);
    torch += 1;
  }

  carried = (carried + run) % SPACING;
}

// And down the stair, so the way up is lit in the same fire as the gate at the
// top of it rather than in the photograph's own cold white.
for (let i = 1; i < STAIR.length; i++) {
  const [ax, ay] = STAIR[i - 1];
  const [bx, by] = STAIR[i];
  const run = Math.hypot(bx - ax, by - ay);

  for (let along = 0; along < run; along += 5) {
    const t = along / run;
    warm(ax + (bx - ax) * t, ay + (by - ay) * t, 28, 0.42);
  }
}

// And the rock itself, so the structure reads as one lit thing rather than as
// a dark hill with bright spots on it.
pool(ACROPOLIS.x, ACROPOLIS.y, ACROPOLIS.ry, 0.095, EMBER, ACROPOLIS.rx / ACROPOLIS.ry);

// --- composite and write ---------------------------------------------------
const lit = Buffer.alloc(W * H * 3);
for (let i = 0; i < W * H; i++) {
  const gel = tint[i];
  for (let k = 0; k < 3; k++) {
    const source = toLinear[ppm[pixels + i * 3 + k]] * (1 + gel * (WARM[k] - 1));
    lit[i * 3 + k] = fromLinear(source + light[i * 3 + k]);
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
