"use strict";

// Builds public/models/amphora/amphora.glb and writes layout.json, the handoff
// that lets build-textures.js paint bands at the right height on the real wall.

const fs = require("fs");
const path = require("path");
const S = require("./shared.js");

const TUBE_RADIAL = 14;
const TUBE_PATH = 34;
const HANDLE_OVERSHOOT = 0.065; // pushes the tube ends inside the wall

const profile = S.buildProfile();

function primitive() {
  return { positions: [], normals: [], uvs: [], indices: [] };
}
function vertex(prim, position, normal, uv) {
  prim.positions.push(...position);
  prim.normals.push(...normal);
  prim.uvs.push(...uv);
  return prim.positions.length / 3 - 1;
}
function triangle(prim, a, b, c, reference) {
  const p = (i) => prim.positions.slice(i * 3, i * 3 + 3);
  const [pa, pb, pc] = [p(a), p(b), p(c)];
  const e1 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
  const e2 = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
  const geo = [
    e1[1] * e2[2] - e1[2] * e2[1],
    e1[2] * e2[0] - e1[0] * e2[2],
    e1[0] * e2[1] - e1[1] * e2[0],
  ];
  const ref = reference || prim.normals.slice(a * 3, a * 3 + 3);
  const dot = geo[0] * ref[0] + geo[1] * ref[1] + geo[2] * ref[2];
  if (dot >= 0) prim.indices.push(a, b, c);
  else prim.indices.push(a, c, b);
}

// --- body: pure lathe, analytic normals ------------------------------------
const body = primitive();
const grid = [];
for (let j = 0; j < profile.points.length; j++) {
  const [y, r] = profile.points[j];
  const prev = profile.points[Math.max(0, j - 1)];
  const next = profile.points[Math.min(profile.points.length - 1, j + 1)];
  const dy = next[0] - prev[0];
  const dr = next[1] - prev[1];
  const row = [];
  for (let i = 0; i <= S.SEGMENTS; i++) {
    const u = i / S.SEGMENTS;
    const theta = 2 * Math.PI * u - Math.PI;
    const sin = Math.sin(theta);
    const cos = Math.cos(theta);
    const n = [dy * sin, -dr, dy * cos];
    const len = Math.hypot(...n) || 1;
    row.push(vertex(body, [r * sin, y, r * cos], [n[0] / len, n[1] / len, n[2] / len], [u, profile.vOf(j)]));
  }
  grid.push(row);
}
for (let j = 0; j < profile.points.length - 1; j++) {
  for (let i = 0; i < S.SEGMENTS; i++) {
    triangle(body, grid[j][i], grid[j][i + 1], grid[j + 1][i]);
    triangle(body, grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]);
  }
}

// Flat discs closing the foot and the mouth. The mouth disc sits a hair below
// the rim so the lip reads as a wall with thickness rather than a sealed dome.
function cap(prim, y, r, normalY, v) {
  const centre = vertex(prim, [0, y, 0], [0, normalY, 0], [0.5, v]);
  const ring = [];
  for (let i = 0; i <= S.SEGMENTS; i++) {
    const theta = 2 * Math.PI * (i / S.SEGMENTS) - Math.PI;
    ring.push(vertex(prim, [r * Math.sin(theta), y, r * Math.cos(theta)], [0, normalY, 0], [i / S.SEGMENTS, v]));
  }
  for (let i = 0; i < S.SEGMENTS; i++) triangle(prim, centre, ring[i], ring[i + 1], [0, normalY, 0]);
}
const foot = profile.points[0];
const mouth = profile.points[profile.points.length - 1];
cap(body, foot[0], foot[1], -1, profile.vOf(0));
cap(body, mouth[0] - 0.012, mouth[1] * 0.86, 1, profile.vOf(profile.points.length - 1) + 0.004);

// --- handles ---------------------------------------------------------------
const handles = primitive();

// Squarish superellipse, broader around the vase than it is thick. A circle
// section is what makes a handle read as a length of pipe.
function section(angle) {
  const n = S.HANDLE.sectionExponent;
  const power = (c) => Math.sign(c) * Math.abs(c) ** (2 / n);
  const cos = Math.cos(angle);
  const crest = 1 + S.HANDLE.ridge * Math.max(0, cos) ** 6;
  return {
    outward: S.HANDLE.thicknessRadial * power(cos) * crest,
    lateral: S.HANDLE.thicknessLateral * power(Math.sin(angle)),
  };
}

// Fat at both joins, slightly waisted at the apex.
function girth(t) {
  const edge = Math.min(Math.max(Math.min(t, 1 - t), 0) / S.HANDLE.bulgeSpan, 1);
  const bulge = S.HANDLE.endBulge * (1 - edge) ** 2;
  return (1 + bulge) * (1 - 0.13 * Math.sin(Math.PI * Math.min(Math.max(t, 0), 1)));
}

const handleRows = [];
function handle(side) {
  const curve = S.handlePath(profile, side);
  const t0 = -HANDLE_OVERSHOOT;
  const t1 = 1 + HANDLE_OVERSHOOT;
  const rows = [];
  let length = 0;
  let last = null;

  for (let s = 0; s <= TUBE_PATH; s++) {
    const t = t0 + (t1 - t0) * (s / TUBE_PATH);
    const p = curve(t);
    if (last) length += Math.hypot(p[0] - last[0], p[1] - last[1]);
    last = p;

    const ahead = curve(t + 0.001);
    const behind = curve(t - 0.001);
    const tan = [ahead[0] - behind[0], ahead[1] - behind[1]];
    const tl = Math.hypot(...tan) || 1;
    // In-plane outward normal, flipped so it always points away from the axis.
    const out = [tan[1] / tl, -tan[0] / tl];
    if (out[0] * side < 0) {
      out[0] = -out[0];
      out[1] = -out[1];
    }

    const scale = girth(t);
    const row = [];
    for (let a = 0; a <= TUBE_RADIAL; a++) {
      const angle = (a / TUBE_RADIAL) * 2 * Math.PI;
      const { outward, lateral } = section(angle);
      row.push({
        position: [
          p[0] + out[0] * outward * scale,
          p[1] + out[1] * outward * scale,
          lateral * scale,
        ],
        pathT: Math.min(Math.max(t, 0), 1),
        ring: a,
        centre: p,
      });
    }
    rows.push(row);
  }
  handleRows.push({ rows, length, side });
}
handle(1);
handle(-1);

// Handle UVs live in the strip under the body: u along the arc, v around the girth.
const handleLength = handleRows[0].length;
for (const { rows, side } of handleRows) {
  const indexed = rows.map((row, s) =>
    row.map((v) => {
      const u = (s / TUBE_PATH) * S.HANDLE_U1;
      const g = v.ring / TUBE_RADIAL;
      const uv = [side > 0 ? u : S.HANDLE_U1 * 2 - u, S.HANDLE_V0 + g * (S.HANDLE_V1 - S.HANDLE_V0)];
      const outward = [v.position[0] - v.centre[0], v.position[1] - v.centre[1], v.position[2]];
      return { index: vertex(handles, v.position, outward, uv), outward };
    }),
  );
  for (let s = 0; s < TUBE_PATH; s++) {
    for (let a = 0; a < TUBE_RADIAL; a++) {
      const ref = indexed[s][a].outward;
      triangle(handles, indexed[s][a].index, indexed[s][a + 1].index, indexed[s + 1][a].index, ref);
      triangle(handles, indexed[s][a + 1].index, indexed[s + 1][a + 1].index, indexed[s + 1][a].index, ref);
    }
  }
  // Close both ends; they are buried in the wall but must not read as open pipe.
  for (const [s, dir] of [[0, -1], [TUBE_PATH, 1]]) {
    const centre = rows[s][0].centre;
    const tangent = s === 0
      ? [rows[0][0].centre[0] - rows[1][0].centre[0], rows[0][0].centre[1] - rows[1][0].centre[1], 0]
      : [rows[s][0].centre[0] - rows[s - 1][0].centre[0], rows[s][0].centre[1] - rows[s - 1][0].centre[1], 0];
    const tl = Math.hypot(...tangent) || 1;
    const normal = [tangent[0] / tl, tangent[1] / tl, 0];
    const hub = vertex(handles, [centre[0], centre[1], 0], normal, [
      side > 0 ? (s / TUBE_PATH) * S.HANDLE_U1 : S.HANDLE_U1 * 2 - (s / TUBE_PATH) * S.HANDLE_U1,
      (S.HANDLE_V0 + S.HANDLE_V1) / 2,
    ]);
    const ring = indexed[s].map((v) => v.index);
    for (let a = 0; a < TUBE_RADIAL; a++) triangle(handles, hub, ring[a], ring[a + 1], normal);
    void dir;
  }
}

// Smooth the handle normals from the faces: taper, crest and end bulges all bend
// the surface in ways the section normal alone does not describe.
{
  const count = handles.positions.length / 3;
  const accumulated = new Float64Array(count * 3);
  const key = new Map();
  const weld = new Int32Array(count);
  for (let i = 0; i < count; i++) {
    const k = [0, 1, 2].map((c) => handles.positions[i * 3 + c].toFixed(6)).join(",");
    if (!key.has(k)) key.set(k, i);
    weld[i] = key.get(k);
  }
  for (let t = 0; t < handles.indices.length; t += 3) {
    const [a, b, c] = [handles.indices[t], handles.indices[t + 1], handles.indices[t + 2]];
    const p = (i) => handles.positions.slice(i * 3, i * 3 + 3);
    const [pa, pb, pc] = [p(a), p(b), p(c)];
    const e1 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
    const e2 = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
    const n = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
    for (const v of [a, b, c]) for (let c2 = 0; c2 < 3; c2++) accumulated[weld[v] * 3 + c2] += n[c2];
  }
  for (let i = 0; i < count; i++) {
    const w = weld[i];
    const n = [accumulated[w * 3], accumulated[w * 3 + 1], accumulated[w * 3 + 2]];
    const len = Math.hypot(...n);
    if (len > 1e-9) for (let c = 0; c < 3; c++) handles.normals[i * 3 + c] = n[c] / len;
  }
}

// --- centre on the rotation axis, normalise the height ----------------------
const allY = [];
for (const prim of [body, handles]) {
  for (let i = 1; i < prim.positions.length; i += 3) allY.push(prim.positions[i]);
}
const minY = Math.min(...allY);
const maxY = Math.max(...allY);
const scale = S.TARGET_HEIGHT / (maxY - minY);
const centreY = (minY + maxY) / 2;
for (const prim of [body, handles]) {
  for (let i = 0; i < prim.positions.length; i += 3) {
    prim.positions[i] *= scale;
    prim.positions[i + 1] = (prim.positions[i + 1] - centreY) * scale;
    prim.positions[i + 2] *= scale;
  }
}

// --- serialise --------------------------------------------------------------
const bin = [];
let offset = 0;
const bufferViews = [];
const accessors = [];

function accessor(data, { type, componentType, count, minMax }) {
  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  const padding = (4 - (offset % 4)) % 4;
  if (padding) {
    bin.push(Buffer.alloc(padding));
    offset += padding;
  }
  bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: buf.length });
  bin.push(buf);
  offset += buf.length;
  const out = { bufferView: bufferViews.length - 1, componentType, count, type };
  if (minMax) {
    out.min = minMax[0];
    out.max = minMax[1];
  }
  accessors.push(out);
  return accessors.length - 1;
}

function bounds(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      min[c] = Math.min(min[c], positions[i + c]);
      max[c] = Math.max(max[c], positions[i + c]);
    }
  }
  return [min, max];
}

function serialise(prim, material) {
  const count = prim.positions.length / 3;
  if (count > 65535) throw new Error(`primitive too large for 16-bit indices: ${count}`);
  return {
    attributes: {
      POSITION: accessor(new Float32Array(prim.positions), { type: "VEC3", componentType: 5126, count, minMax: bounds(prim.positions) }),
      NORMAL: accessor(new Float32Array(prim.normals), { type: "VEC3", componentType: 5126, count }),
      TEXCOORD_0: accessor(new Float32Array(prim.uvs), { type: "VEC2", componentType: 5126, count }),
    },
    indices: accessor(new Uint16Array(prim.indices), { type: "SCALAR", componentType: 5123, count: prim.indices.length }),
    material,
    mode: 4,
  };
}

// One material for the whole vessel. Clay body, black glaze, wear and the sheen
// difference between paint and slip are all painted, not modelled.
const primitives = [serialise(body, 0), serialise(handles, 0)];
const binary = Buffer.concat(bin);

const json = {
  asset: { version: "2.0", generator: "robertst-web amphora generator" },
  scene: 0,
  scenes: [{ name: "AmphoraScene", nodes: [0] }],
  nodes: [{ name: "Amphora", mesh: 0 }],
  meshes: [{ name: "Amphora", primitives }],
  materials: [{
    name: "AmphoraClay",
    pbrMetallicRoughness: {
      baseColorTexture: { index: 0 },
      metallicRoughnessTexture: { index: 1 },
      // Zero at the factor, not just in the texture's blue channel: lossy WebP
      // bleeds chroma between channels, and a few percent of stray metalness is
      // enough to put a plastic sheen back on the clay.
      metallicFactor: 0,
      roughnessFactor: 1,
    },
    normalTexture: { index: 2, scale: 0.6 },
    doubleSided: false,
  }],
  // WebP only. It is a third the bytes of PNG on these sheets, three supports
  // the extension, and if a browser somehow cannot decode it the loader errors
  // and the viewer drops to the 2D frame turntable, which is already WebP too.
  extensionsUsed: ["EXT_texture_webp"],
  extensionsRequired: ["EXT_texture_webp"],
  textures: [
    { sampler: 0, extensions: { EXT_texture_webp: { source: 0 } } },
    { sampler: 0, extensions: { EXT_texture_webp: { source: 1 } } },
    { sampler: 0, extensions: { EXT_texture_webp: { source: 2 } } },
  ],
  samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 33071 }],
  images: [
    { uri: "amphora-basecolor.webp", mimeType: "image/webp" },
    { uri: "amphora-roughness.webp", mimeType: "image/webp" },
    { uri: "amphora-normal.webp", mimeType: "image/webp" },
  ],
  accessors,
  bufferViews,
  buffers: [{ byteLength: binary.length }],
};

const jsonBuf = Buffer.from(JSON.stringify(json), "utf8");
const jsonChunk = Buffer.concat([jsonBuf, Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20)]);
const binChunk = Buffer.concat([binary, Buffer.alloc((4 - (binary.length % 4)) % 4, 0)]);

const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
const jsonHeader = Buffer.alloc(8);
jsonHeader.writeUInt32LE(jsonChunk.length, 0);
jsonHeader.writeUInt32LE(0x4e4f534a, 4);
const binHeader = Buffer.alloc(8);
binHeader.writeUInt32LE(binChunk.length, 0);
binHeader.writeUInt32LE(0x004e4942, 4);

const out = process.argv[2];
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk]));

// --- layout handoff ---------------------------------------------------------
const arcLength = profile.arcTotal * scale;
const bellyCircumference = 2 * Math.PI * profile.maxRadius * scale;
const bodyRows = S.BODY_V_MAX * S.TEX_H;

const layout = {
  texture: { width: S.TEX_W, height: S.TEX_H, bodyVMax: S.BODY_V_MAX },
  handleStrip: { v0: S.HANDLE_V0, v1: S.HANDLE_V1, u1: S.HANDLE_U1 },
  // pixels per unit of real surface distance, for keeping ornament square
  pxPerUnitV: bodyRows / arcLength,
  pxPerUnitUAtBelly: S.TEX_W / bellyCircumference,
  arcLength,
  bellyCircumference,
  maxRadius: profile.maxRadius * scale,
  // painted zone boundaries, expressed in v because that is what the sheet uses
  v: Object.fromEntries(
    Object.entries({
      rim: 1.0,
      lipBottom: 0.951,
      neckTop: 0.928,
      neckBottom: 0.770,
      ornamentTop: 0.766,
      ornamentBottom: 0.690,
      panelTop: 0.684,
      panelBottom: 0.322,
      lowerTop: 0.318,
      lowerBottom: 0.122,
      rayTop: 0.118,
      rayBottom: 0.064,
      footTop: 0.060,
      footBottom: 0.0,
    }).map(([k, y]) => [k, profile.vAtY(y)]),
  ),
  radiusAtV: {},
  handle: { length: handleLength * scale, girthMax: 2 * Math.PI * S.HANDLE.thicknessLateral * scale },
};
for (const [k, v] of Object.entries(layout.v)) layout.radiusAtV[k] = profile.radiusAtV(v) * scale;

fs.writeFileSync(process.argv[3], JSON.stringify(layout, null, 2));

const triangles = (body.indices.length + handles.indices.length) / 3;
console.log(`glb -> ${out}`);
console.log(`  vertices ${(body.positions.length + handles.positions.length) / 3}, triangles ${triangles}, ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
console.log(`  height ${(maxY - minY) * scale}, widest radius ${(profile.maxRadius * scale).toFixed(4)} (H/D ${(1 / (2 * profile.maxRadius)).toFixed(2)})`);
console.log(`  profile arc ${arcLength.toFixed(3)}, belly circumference ${bellyCircumference.toFixed(3)}`);
console.log(`  handle arc ${(handleLength * scale).toFixed(3)}, strip ${(S.HANDLE_U1 * S.TEX_W).toFixed(0)}x${((S.HANDLE_V1 - S.HANDLE_V0) * S.TEX_H).toFixed(0)} px`);
console.log(`  belly panel v ${layout.v.panelTop.toFixed(3)}..${layout.v.panelBottom.toFixed(3)}`);
