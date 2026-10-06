"use strict";

// Software render of the finished asset, deliberately mirroring what
// components/AmphoraModelViewer.tsx sets up: the same camera, the same lights,
// three's own GGX BRDF, and three's Neutral tone mapping. It exists because the
// only way to judge "does this read as fired clay" is to look at a shaded frame,
// and a headless box has no WebGL.
//
//   node scripts/amphora/preview.js [out.png] [angle...]
//
// Reads the shipped asset, so what it renders is what the browser gets, WebP
// compression included.
//
// `render(angle)` is exported, and AMPHORA_RENDER_WIDTH sets the raster size,
// because build-frames.js turns the same renderer into the 2D fallback: the
// frames a reader without WebGL sees have to be this vessel under these
// lights, not a second opinion about what it looks like.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const S = require("./shared.js");

const [, , OUT_ARG, ...ANGLES] = process.argv;
const assets = path.resolve(__dirname, "../../public/models/amphora");
const GLB = path.join(assets, "amphora.glb");
const OUT = OUT_ARG || path.join(os.tmpdir(), "amphora-preview.png");

// The sheets ship as WebP; decode them so the renderer sees exactly the pixels
// the GPU will sample.
const TEX_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "amphora-preview-"));
for (const name of ["basecolor", "roughness", "normal"]) {
  execFileSync("dwebp", ["-quiet", path.join(assets, `amphora-${name}.webp`), "-o", path.join(TEX_DIR, `amphora-${name}.png`)]);
}

// --- must match AmphoraModelViewer.tsx -------------------------------------
const CAMERA_DISTANCE = 2.05;
const CAMERA_FOV = 34;
const ASPECT = 7 / 10;
const EXPOSURE = 1.0;
const HEMISPHERE = { sky: [0.62, 0.70, 0.81], ground: [0.29, 0.29, 0.28], intensity: 1.35 };
const LIGHTS = [
  { pos: [2.4, 2.9, 3.6], colour: [1.0, 0.95, 0.87], intensity: 1.55 },
  { pos: [-3.0, 0.9, 1.4], colour: [0.68, 0.76, 0.92], intensity: 0.55 },
  { pos: [-0.8, -1.6, 2.2], colour: [0.89, 0.87, 0.82], intensity: 0.26 },
];
const NORMAL_SCALE = 0.6;

const WIDTH = Number(process.env.AMPHORA_RENDER_WIDTH) || 360;
const HEIGHT = Math.round(WIDTH / ASPECT);

// --- glb -------------------------------------------------------------------
const glb = fs.readFileSync(GLB);
const jsonLength = glb.readUInt32LE(12);
const gltf = JSON.parse(glb.slice(20, 20 + jsonLength).toString("utf8"));
const binStart = 20 + jsonLength + 8;
const bin = glb.slice(binStart, binStart + glb.readUInt32LE(20 + jsonLength));
const readAccessor = (i) => {
  const a = gltf.accessors[i];
  const view = gltf.bufferViews[a.bufferView];
  const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type] * a.count;
  const at = bin.byteOffset + view.byteOffset;
  if (a.componentType === 5126) return new Float32Array(bin.buffer, at, n);
  if (a.componentType === 5123) return new Uint16Array(bin.buffer, at, n);
  return new Uint32Array(bin.buffer, at, n);
};
const prims = gltf.meshes[0].primitives.map((p) => ({
  pos: readAccessor(p.attributes.POSITION),
  nor: readAccessor(p.attributes.NORMAL),
  uv: readAccessor(p.attributes.TEXCOORD_0),
  idx: readAccessor(p.indices),
}));

// --- textures --------------------------------------------------------------
function loadTexture(name) {
  const image = S.readPNG(path.join(TEX_DIR, name));
  return {
    ...image,
    at(u, v) {
      const x = Math.min(image.w - 1, Math.max(0, Math.floor((((u % 1) + 1) % 1) * image.w)));
      const y = Math.min(image.h - 1, Math.max(0, Math.floor(Math.min(Math.max(v, 0), 0.999999) * image.h)));
      const o = (y * image.w + x) * image.channels;
      return [image.px[o], image.px[o + 1], image.px[o + 2]];
    },
  };
}
const baseTex = loadTexture("amphora-basecolor.png");
const roughTex = loadTexture("amphora-roughness.png");
const normalTex = loadTexture("amphora-normal.png");

const SRGB_TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB_TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
const linearToSrgb = (c) => {
  const v = Math.min(1, Math.max(0, c));
  return Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055));
};

// --- three's BRDF ----------------------------------------------------------
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (v) => {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const RECIPROCAL_PI = 1 / Math.PI;

function brdfGGX(normal, view, light, roughness) {
  const half = norm([view[0] + light[0], view[1] + light[1], view[2] + light[2]]);
  const dotNL = Math.max(0, dot(normal, light));
  const dotNV = Math.max(1e-4, dot(normal, view));
  const dotNH = Math.max(0, dot(normal, half));
  const dotVH = Math.max(0, dot(view, half));
  const alpha = roughness * roughness;
  const a2 = alpha * alpha;

  const denom = dotNH * dotNH * (a2 - 1) + 1;
  const D = RECIPROCAL_PI * a2 / (denom * denom);
  const gv = dotNL * Math.sqrt(dotNV * dotNV * (1 - a2) + a2);
  const gl = dotNV * Math.sqrt(dotNL * dotNL * (1 - a2) + a2);
  const V = 0.5 / Math.max(gv + gl, 1e-6);
  const fresnel = (1 - dotVH) ** 5;
  const F = 0.04 + (1 - 0.04) * fresnel; // metalness 0 -> f0 = 0.04
  return F * V * D;
}

// three's NeutralToneMapping (Khronos PBR Neutral)
function toneMap(colour) {
  const c = colour.map((v) => v * EXPOSURE);
  const start = 0.8 - 0.04;
  const desaturation = 0.15;
  const low = Math.min(...c);
  const offset = low < 0.08 ? low - 6.25 * low * low : 0.04;
  const shifted = c.map((v) => v - offset);
  const peak = Math.max(...shifted);
  if (peak < start) return shifted;
  const d = 1 - start;
  const newPeak = 1 - (d * d) / (peak + d - start);
  const scaled = shifted.map((v) => (v * newPeak) / peak);
  const g = 1 - 1 / (desaturation * (peak - newPeak) + 1);
  return scaled.map((v) => v + (newPeak - v) * g);
}

const lights = LIGHTS.map((l) => ({
  dir: norm(l.pos),
  radiance: [l.colour[0] * l.intensity, l.colour[1] * l.intensity, l.colour[2] * l.intensity],
}));

// --- render ----------------------------------------------------------------
function render(angleDeg) {
  const a = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const tanHalf = Math.tan((CAMERA_FOV * Math.PI) / 360);
  const out = Buffer.alloc(WIDTH * HEIGHT * 4);
  const depth = new Float32Array(WIDTH * HEIGHT).fill(Infinity);

  for (const prim of prims) {
    for (let t = 0; t < prim.idx.length; t += 3) {
      const verts = [0, 1, 2].map((k) => {
        const i = prim.idx[t + k];
        const [x, y, z] = [prim.pos[i * 3], prim.pos[i * 3 + 1], prim.pos[i * 3 + 2]];
        const [nx, ny, nz] = [prim.nor[i * 3], prim.nor[i * 3 + 1], prim.nor[i * 3 + 2]];
        const rx = x * cos + z * sin;
        const rz = -x * sin + z * cos;
        const rnx = nx * cos + nz * sin;
        const rnz = -nx * sin + nz * cos;
        const dist = CAMERA_DISTANCE - rz;
        return {
          sx: (((rx / (dist * tanHalf * ASPECT)) + 1) / 2) * WIDTH,
          sy: ((1 - y / (dist * tanHalf)) / 2) * HEIGHT,
          world: [rx, y, rz],
          dist,
          n: [rnx, ny, rnz],
          u: prim.uv[i * 2],
          v: prim.uv[i * 2 + 1],
        };
      });

      const [A, B, C] = verts;
      const area = (B.sx - A.sx) * (C.sy - A.sy) - (C.sx - A.sx) * (B.sy - A.sy);
      if (area >= 0) continue; // back face; screen y is flipped

      // Per-triangle tangent frame from the UVs, the same construction three
      // falls back to when the mesh carries no TANGENT attribute.
      const du1 = B.u - A.u;
      const dv1 = B.v - A.v;
      const du2 = C.u - A.u;
      const dv2 = C.v - A.v;
      const e1 = [B.world[0] - A.world[0], B.world[1] - A.world[1], B.world[2] - A.world[2]];
      const e2 = [C.world[0] - A.world[0], C.world[1] - A.world[1], C.world[2] - A.world[2]];
      const det = du1 * dv2 - du2 * dv1;
      let tangent = [1, 0, 0];
      if (Math.abs(det) > 1e-12) {
        const r = 1 / det;
        tangent = norm([
          (e1[0] * dv2 - e2[0] * dv1) * r,
          (e1[1] * dv2 - e2[1] * dv1) * r,
          (e1[2] * dv2 - e2[2] * dv1) * r,
        ]);
      }

      const minX = Math.max(0, Math.floor(Math.min(A.sx, B.sx, C.sx)));
      const maxX = Math.min(WIDTH - 1, Math.ceil(Math.max(A.sx, B.sx, C.sx)));
      const minY = Math.max(0, Math.floor(Math.min(A.sy, B.sy, C.sy)));
      const maxY = Math.min(HEIGHT - 1, Math.ceil(Math.max(A.sy, B.sy, C.sy)));

      for (let py = minY; py <= maxY; py++) {
        for (let pxi = minX; pxi <= maxX; pxi++) {
          const x = pxi + 0.5;
          const y = py + 0.5;
          const w0 = ((B.sx - x) * (C.sy - y) - (C.sx - x) * (B.sy - y)) / area;
          const w1 = ((C.sx - x) * (A.sy - y) - (A.sx - x) * (C.sy - y)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;

          const dist = w0 * A.dist + w1 * B.dist + w2 * C.dist;
          const o = py * WIDTH + pxi;
          if (dist >= depth[o]) continue;
          depth[o] = dist;

          const u = w0 * A.u + w1 * B.u + w2 * C.u;
          const v = w0 * A.v + w1 * B.v + w2 * C.v;
          let normal = norm([0, 1, 2].map((k) => w0 * A.n[k] + w1 * B.n[k] + w2 * C.n[k]));

          // tangent-space normal map
          const nm = normalTex.at(u, v);
          const tn = [
            (nm[0] / 255 * 2 - 1) * NORMAL_SCALE,
            (nm[1] / 255 * 2 - 1) * NORMAL_SCALE,
            nm[2] / 255 * 2 - 1,
          ];
          const T = norm([
            tangent[0] - normal[0] * dot(tangent, normal),
            tangent[1] - normal[1] * dot(tangent, normal),
            tangent[2] - normal[2] * dot(tangent, normal),
          ]);
          const Bi = [
            normal[1] * T[2] - normal[2] * T[1],
            normal[2] * T[0] - normal[0] * T[2],
            normal[0] * T[1] - normal[1] * T[0],
          ];
          normal = norm([0, 1, 2].map((k) => T[k] * tn[0] + Bi[k] * tn[1] + normal[k] * tn[2]));

          const base = baseTex.at(u, v);
          const albedo = [SRGB_TO_LINEAR[base[0]], SRGB_TO_LINEAR[base[1]], SRGB_TO_LINEAR[base[2]]];
          const roughness = Math.min(1, Math.max(0.03, roughTex.at(u, v)[1] / 255));

          const world = [0, 1, 2].map((k) => w0 * A.world[k] + w1 * B.world[k] + w2 * C.world[k]);
          const viewDir = norm([-world[0], -world[1], CAMERA_DISTANCE - world[2]]);

          // hemisphere light, three's formulation
          const hemi = 0.5 * normal[1] + 0.5;
          const indirect = [0, 1, 2].map((k) =>
            (HEMISPHERE.ground[k] + (HEMISPHERE.sky[k] - HEMISPHERE.ground[k]) * hemi) * HEMISPHERE.intensity);

          const colour = [0, 1, 2].map((k) => indirect[k] * albedo[k] * RECIPROCAL_PI);
          for (const light of lights) {
            const dotNL = dot(normal, light.dir);
            if (dotNL <= 0) continue;
            const spec = brdfGGX(normal, viewDir, light.dir, roughness);
            for (let k = 0; k < 3; k++) {
              const irradiance = dotNL * light.radiance[k];
              colour[k] += irradiance * (albedo[k] * RECIPROCAL_PI + spec);
            }
          }

          const mapped = toneMap(colour);
          const c = o * 4;
          out[c] = linearToSrgb(mapped[0]);
          out[c + 1] = linearToSrgb(mapped[1]);
          out[c + 2] = linearToSrgb(mapped[2]);
          out[c + 3] = 255;
        }
      }
    }
  }
  return out;
}

module.exports = { render, WIDTH, HEIGHT };

if (require.main !== module) return;

const angles = ANGLES.length ? ANGLES.map(Number) : [0, 60, 120, 180, 240, 300];
const strip = Buffer.alloc(WIDTH * angles.length * HEIGHT * 3);
angles.forEach((angle, i) => {
  const frame = render(angle);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const src = (y * WIDTH + x) * 4;
      const dst = (y * WIDTH * angles.length + i * WIDTH + x) * 3;
      // flat mid-grey behind the vase, so the silhouette is readable
      const alpha = frame[src + 3] / 255;
      for (let k = 0; k < 3; k++) strip[dst + k] = Math.round(frame[src + k] * alpha + 26 * (1 - alpha));
    }
  }
  let covered = 0;
  for (let p = 0; p < WIDTH * HEIGHT; p++) if (frame[p * 4 + 3] > 0) covered += 1;
  console.log(`  ${String(angle).padStart(3)}deg  ${((covered / (WIDTH * HEIGHT)) * 100).toFixed(1)}% of frame`);
});
S.writePNG(OUT, strip, WIDTH * angles.length, HEIGHT);
console.log(`preview -> ${OUT}`);
