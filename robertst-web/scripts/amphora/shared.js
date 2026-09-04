"use strict";

const fs = require("fs");
const zlib = require("zlib");

// Shared vessel definition. Geometry, textures and the preview renderer all read
// from here so the profile, the UV mapping and the painted bands cannot drift.

// --- UV / rotation contract (the app depends on this) -----------------------
//   position(theta) = (r*sin(theta), y, r*cos(theta))   theta = 0 faces +Z (camera)
//   u = ((theta + PI) / (2*PI)) mod 1                   u = 0.5 faces the camera
//   rotating the group by A degrees moves surface theta to theta + A
//   so the surface facing the camera at amphora angle A has u = ((180 - A)/360) mod 1
// ---------------------------------------------------------------------------

const SEGMENTS = 72;
const RINGS = 64;
const TARGET_HEIGHT = 1;

// Texture space. The body occupies the top BODY_V_MAX of the sheet; the strip
// below it is the handles' own little atlas page.
const TEX_W = 2048;
const TEX_H = 1024;
const BODY_V_MAX = 0.875; // 896 of 1024 rows; the strip below is the handle atlas
const HANDLE_V0 = BODY_V_MAX;
const HANDLE_V1 = 1;

// Neck-amphora profile: [height, radius]. Widest point sits just under halfway
// up, the lower body is a long taper to a narrow foot, and both the foot and the
// lip flare. That combination is what keeps the silhouette from reading spherical.
const PROFILE = [
  [0.000, 0.128],
  [0.012, 0.141],
  [0.030, 0.132],
  [0.048, 0.104],
  [0.070, 0.092],
  [0.105, 0.112],
  [0.150, 0.146],
  [0.205, 0.183],
  [0.265, 0.216],
  [0.330, 0.243],
  [0.400, 0.261],
  [0.465, 0.269],
  [0.520, 0.267],
  [0.580, 0.257],
  [0.635, 0.239],
  [0.685, 0.214],
  [0.730, 0.184],
  [0.768, 0.151],
  [0.800, 0.122],
  [0.830, 0.108],
  [0.870, 0.101],
  [0.905, 0.100],
  [0.933, 0.105],
  [0.953, 0.120],
  [0.972, 0.141],
  [0.988, 0.143],
  [1.000, 0.131],
];

// Centripetal Catmull-Rom (Barry-Goldman form). Uniform parameterisation
// overshoots badly where the profile turns sharply (foot, lip), inventing bulges
// that were never authored.
function catmullRom(points, samples) {
  const pts = [points[0], ...points, points[points.length - 1]];

  // Knot spacing d = |dP|^0.5 is what makes this centripetal rather than uniform.
  const knots = [0];
  for (let i = 0; i < pts.length - 1; i++) {
    const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    knots.push(knots[i] + Math.max(Math.sqrt(d), 1e-4));
  }

  const out = [];
  for (let s = 0; s < samples; s++) {
    const g = (s / (samples - 1)) * (points.length - 1);
    const i = Math.min(Math.floor(g), points.length - 2);
    const local = g - i;

    const [t0, t1, t2, t3] = [knots[i], knots[i + 1], knots[i + 2], knots[i + 3]];
    const t = t1 + local * (t2 - t1);
    const [p0, p1, p2, p3] = [pts[i], pts[i + 1], pts[i + 2], pts[i + 3]];

    const lerp = (a, b, ta, tb, c) => {
      const span = tb - ta;
      return ((tb - t) * a[c] + (t - ta) * b[c]) / span;
    };
    const axis = (c) => {
      const a1 = lerp(p0, p1, t0, t1, c);
      const a2 = lerp(p1, p2, t1, t2, c);
      const a3 = lerp(p2, p3, t2, t3, c);
      const b1 = (((t2 - t) * a1 + (t - t0) * a2) / (t2 - t0));
      const b2 = (((t3 - t) * a2 + (t - t1) * a3) / (t3 - t1));
      return ((t2 - t) * b1 + (t - t1) * b2) / (t2 - t1);
    };
    out.push([axis(0), axis(1)]);
  }
  return out;
}

function buildProfile() {
  const points = catmullRom(PROFILE, RINGS);

  const arc = [0];
  for (let j = 1; j < points.length; j++) {
    arc.push(arc[j - 1] + Math.hypot(points[j][0] - points[j - 1][0], points[j][1] - points[j - 1][1]));
  }
  const arcTotal = arc[arc.length - 1];

  // v = 0 at the vase mouth, BODY_V_MAX at the foot.
  const vOf = (j) => (1 - arc[j] / arcTotal) * BODY_V_MAX;
  const maxRadius = Math.max(...points.map((p) => p[1]));

  const radiusAtY = (y) => {
    for (let j = 1; j < points.length; j++) {
      if (points[j][0] >= y) {
        const span = points[j][0] - points[j - 1][0] || 1;
        const f = (y - points[j - 1][0]) / span;
        return points[j - 1][1] + f * (points[j][1] - points[j - 1][1]);
      }
    }
    return points[points.length - 1][1];
  };

  // v -> surface radius, for sizing ornament so motifs stay square on the vase.
  const radiusAtV = (v) => {
    const target = (1 - v / BODY_V_MAX) * arcTotal;
    for (let j = 1; j < arc.length; j++) {
      if (arc[j] >= target) {
        const span = arc[j] - arc[j - 1] || 1;
        const f = (target - arc[j - 1]) / span;
        return points[j - 1][1] + f * (points[j][1] - points[j - 1][1]);
      }
    }
    return points[points.length - 1][1];
  };

  const vAtY = (y) => {
    for (let j = 1; j < points.length; j++) {
      if (points[j][0] >= y) {
        const span = points[j][0] - points[j - 1][0] || 1;
        const f = (y - points[j - 1][0]) / span;
        return vOf(j - 1) + f * (vOf(j) - vOf(j - 1));
      }
    }
    return vOf(points.length - 1);
  };

  return { points, arc, arcTotal, vOf, vAtY, maxRadius, radiusAtY, radiusAtV };
}

// Handle centre-line: a cubic Bezier from the neck, out over the shoulder and
// back down onto it. Attachment points sit slightly inside the wall so the ends
// are buried rather than butted against the surface.
const HANDLE = {
  topY: 0.898,
  bottomY: 0.694,
  topInset: 0.016,
  bottomInset: 0.026,
  c1: [0.272, 0.918],
  c2: [0.284, 0.744],
  thicknessRadial: 0.0205,
  thicknessLateral: 0.0295,
  sectionExponent: 2.6,
  ridge: 0.16,
  endBulge: 0.62,
  bulgeSpan: 0.2,
};

function handlePath(profile, side) {
  const p0 = [side * (profile.radiusAtY(HANDLE.topY) - HANDLE.topInset), HANDLE.topY];
  const p3 = [side * (profile.radiusAtY(HANDLE.bottomY) - HANDLE.bottomInset), HANDLE.bottomY];
  const p1 = [side * HANDLE.c1[0], HANDLE.c1[1]];
  const p2 = [side * HANDLE.c2[0], HANDLE.c2[1]];
  return (t) => {
    const m = 1 - t;
    return [
      m * m * m * p0[0] + 3 * m * m * t * p1[0] + 3 * m * t * t * p2[0] + t * t * t * p3[0],
      m * m * m * p0[1] + 3 * m * m * t * p1[1] + 3 * m * t * t * p2[1] + t * t * t * p3[1],
    ];
  };
}

// --- PNG ------------------------------------------------------------------
function crc32(buf) {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// Writes 8-bit RGB. Per-row filter is chosen from sub/up/none, which matters a
// lot for the smooth clay gradients that dominate these sheets.
function writePNG(file, rgb, w, h) {
  const stride = w * 3;
  const raw = Buffer.alloc(h * (stride + 1));
  const sub = Buffer.alloc(stride);
  const up = Buffer.alloc(stride);

  for (let y = 0; y < h; y++) {
    const row = rgb.slice(y * stride, (y + 1) * stride);
    const prev = y > 0 ? rgb.slice((y - 1) * stride, y * stride) : null;

    let sumNone = 0;
    let sumSub = 0;
    let sumUp = 0;
    for (let i = 0; i < stride; i++) {
      const left = i >= 3 ? row[i - 3] : 0;
      const above = prev ? prev[i] : 0;
      sub[i] = (row[i] - left) & 255;
      up[i] = (row[i] - above) & 255;
      const abs = (v) => (v < 128 ? v : 256 - v);
      sumNone += abs(row[i]);
      sumSub += abs(sub[i]);
      sumUp += abs(up[i]);
    }

    const base = y * (stride + 1);
    if (sumSub <= sumNone && sumSub <= sumUp) {
      raw[base] = 1;
      sub.copy(raw, base + 1);
    } else if (sumUp <= sumNone) {
      raw[base] = 2;
      up.copy(raw, base + 1);
    } else {
      raw[base] = 0;
      row.copy(raw, base + 1);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]));
  return fs.statSync(file).size;
}

function readPNG(file) {
  const b = fs.readFileSync(file);
  let o = 8;
  let w = 0;
  let h = 0;
  let colour = 6;
  const idat = [];
  while (o < b.length) {
    const len = b.readUInt32BE(o);
    const type = b.slice(o + 4, o + 8).toString();
    if (type === "IHDR") {
      w = b.readUInt32BE(o + 8);
      h = b.readUInt32BE(o + 12);
      colour = b[o + 17];
    }
    if (type === "IDAT") idat.push(b.slice(o + 8, o + 8 + len));
    o += 12 + len;
  }
  const channels = colour === 2 ? 3 : 4;
  const stride = w * channels;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(w * h * channels);

  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? px[y * stride + i - channels] : 0;
      const above = y > 0 ? px[(y - 1) * stride + i] : 0;
      const upLeft = y > 0 && i >= channels ? px[(y - 1) * stride + i - channels] : 0;
      let value = raw[src + i];
      if (filter === 1) value += left;
      else if (filter === 2) value += above;
      else if (filter === 3) value += (left + above) >> 1;
      else if (filter === 4) {
        const p = left + above - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - above);
        const pc = Math.abs(p - upLeft);
        value += pa <= pb && pa <= pc ? left : pb <= pc ? above : upLeft;
      }
      px[y * stride + i] = value & 255;
    }
  }
  return { w, h, px, channels };
}

// --- deterministic noise ---------------------------------------------------
function hash2(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

// Tiles seamlessly across `period` in x so the wrap at u = 0 is invisible.
function valueNoise(x, y, period, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const smooth = (t) => t * t * (3 - 2 * t);
  const sx = smooth(xf);
  const sy = smooth(yf);
  const wrap = (v) => ((v % period) + period) % period;
  const c = (dx, dy) => hash2(wrap(xi + dx), yi + dy, seed);
  const a = c(0, 0) + (c(1, 0) - c(0, 0)) * sx;
  const b = c(0, 1) + (c(1, 1) - c(0, 1)) * sx;
  return a + (b - a) * sy;
}

function fbm(x, y, period, seed, octaves) {
  let sum = 0;
  let amp = 0.5;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const scale = 1 << o;
    sum += amp * valueNoise(x * scale, y * scale, period * scale, seed + o * 977);
    total += amp;
    amp *= 0.5;
  }
  return sum / total;
}

module.exports = {
  SEGMENTS,
  RINGS,
  TARGET_HEIGHT,
  TEX_W,
  TEX_H,
  BODY_V_MAX,
  HANDLE_V0,
  HANDLE_V1,
  PROFILE,
  HANDLE,
  buildProfile,
  handlePath,
  writePNG,
  readPNG,
  fbm,
  valueNoise,
  hash2,
};

// Handles get their own page in the sheet: u across the arc, v around the girth.
module.exports.HANDLE_U1 = 0.3125;
