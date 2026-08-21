"use strict";

// Structural checks on the shipped asset. These exist because the model and the
// texture are generated separately but have to agree about one thing: which
// painted panel faces the camera at a given rotation. If that contract breaks,
// the vessel snaps to a myth and shows a different one, and nothing in the app
// would notice.
//
//   node scripts/amphora/verify.js

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const S = require("./shared.js");

const root = path.resolve(__dirname, "../..");
const dir = path.join(root, "public/models/amphora");

let failures = 0;
function check(name, condition, detail) {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  console.log(`${ok ? "  ok  " : "FAIL  "}${name}${detail ? `  (${detail})` : ""}`);
}

// --- glb -------------------------------------------------------------------
const glb = fs.readFileSync(path.join(dir, "amphora.glb"));
check("glb magic", glb.readUInt32LE(0) === 0x46546c67);
check("glb version 2", glb.readUInt32LE(4) === 2);
check("glb length matches file", glb.readUInt32LE(8) === glb.length, `${glb.readUInt32LE(8)} vs ${glb.length}`);

const jsonLength = glb.readUInt32LE(12);
check("json chunk type", glb.readUInt32LE(16) === 0x4e4f534a);
const gltf = JSON.parse(glb.slice(20, 20 + jsonLength).toString("utf8"));
const binLength = glb.readUInt32LE(20 + jsonLength);
check("bin chunk type", glb.readUInt32LE(24 + jsonLength) === 0x004e4942);
const bin = glb.slice(28 + jsonLength, 28 + jsonLength + binLength);
check("buffer length declared correctly", gltf.buffers[0].byteLength <= bin.length,
  `${gltf.buffers[0].byteLength} <= ${bin.length}`);

check("single material", gltf.materials.length === 1);
const material = gltf.materials[0];
check("roughness comes from the texture", material.pbrMetallicRoughness.roughnessFactor === 1);
check("has base colour texture", material.pbrMetallicRoughness.baseColorTexture !== undefined);
check("has metallic-roughness texture", material.pbrMetallicRoughness.metallicRoughnessTexture !== undefined);
check("has normal texture", material.normalTexture !== undefined);
check("normal scale is subtle", material.normalTexture.scale > 0 && material.normalTexture.scale <= 1,
  String(material.normalTexture.scale));
check("webp extension declared", gltf.extensionsRequired?.includes("EXT_texture_webp"));
check("every texture routes through the webp extension",
  gltf.textures.every((t) => t.extensions?.EXT_texture_webp?.source !== undefined && t.source === undefined));
check("images are webp", gltf.images.every((i) => i.uri.endsWith(".webp") && i.mimeType === "image/webp"));
check("all images present on disk", gltf.images.every((i) => fs.existsSync(path.join(dir, i.uri))));
check("wrapS repeats (rotation is seamless)", gltf.samplers[0].wrapS === 10497);
check("wrapT clamps (no wrap at rim or foot)", gltf.samplers[0].wrapT === 33071);
check("mipmaps requested", gltf.samplers[0].minFilter === 9987);

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
  indexType: gltf.accessors[p.indices].componentType,
}));
check("two primitives (body, handles)", prims.length === 2);
check("16-bit indices", prims.every((p) => p.indexType === 5123));

for (const [i, prim] of prims.entries()) {
  const count = prim.pos.length / 3;
  check(`prim ${i}: indices in range`, prim.idx.every((v) => v < count));
  check(`prim ${i}: triangle count`, prim.idx.length % 3 === 0);
  let worstNormal = 0;
  for (let v = 0; v < count; v++) {
    worstNormal = Math.max(worstNormal, Math.abs(Math.hypot(prim.nor[v * 3], prim.nor[v * 3 + 1], prim.nor[v * 3 + 2]) - 1));
  }
  check(`prim ${i}: normals unit length`, worstNormal < 1e-3, `max error ${worstNormal.toExponential(1)}`);
  let uMin = Infinity;
  let uMax = -Infinity;
  let vMin = Infinity;
  let vMax = -Infinity;
  for (let v = 0; v < count; v++) {
    uMin = Math.min(uMin, prim.uv[v * 2]);
    uMax = Math.max(uMax, prim.uv[v * 2]);
    vMin = Math.min(vMin, prim.uv[v * 2 + 1]);
    vMax = Math.max(vMax, prim.uv[v * 2 + 1]);
  }
  check(`prim ${i}: uvs inside the sheet`, uMin >= -1e-6 && uMax <= 1 + 1e-6 && vMin >= -1e-6 && vMax <= 1 + 1e-6,
    `u ${uMin.toFixed(3)}..${uMax.toFixed(3)} v ${vMin.toFixed(3)}..${vMax.toFixed(3)}`);
}

// --- placement -------------------------------------------------------------
const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
for (const prim of prims) {
  for (let i = 0; i < prim.pos.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      bounds.min[c] = Math.min(bounds.min[c], prim.pos[i + c]);
      bounds.max[c] = Math.max(bounds.max[c], prim.pos[i + c]);
    }
  }
}
const height = bounds.max[1] - bounds.min[1];
check("height normalised to 1", Math.abs(height - 1) < 1e-5, height.toFixed(6));
for (const [axis, c] of [["x", 0], ["y", 1], ["z", 2]]) {
  const centre = (bounds.min[c] + bounds.max[c]) / 2;
  check(`centred on ${axis}`, Math.abs(centre) < 1e-4, centre.toExponential(1));
}
const bodyBounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
for (let i = 0; i < prims[0].pos.length; i += 3) {
  for (let c = 0; c < 3; c++) {
    bodyBounds.min[c] = Math.min(bodyBounds.min[c], prims[0].pos[i + c]);
    bodyBounds.max[c] = Math.max(bodyBounds.max[c], prims[0].pos[i + c]);
  }
}
const bodyWidth = bodyBounds.max[0] - bodyBounds.min[0];
const bodyDepth = bodyBounds.max[2] - bodyBounds.min[2];
check("body is a lathe (width == depth)", Math.abs(bodyWidth - bodyDepth) < 1e-4,
  `${bodyWidth.toFixed(5)} vs ${bodyDepth.toFixed(5)}`);
const slenderness = height / bodyWidth;
check("silhouette is a vessel, not a sphere", slenderness > 1.6 && slenderness < 2.2,
  `height/diameter ${slenderness.toFixed(2)}`);
check("handles stay inside the belly silhouette",
  prims[1].pos.filter((_, i) => i % 3 === 0).every((x) => Math.abs(x) <= bodyWidth / 2 + 1e-6),
  `handle |x| max ${Math.max(...[...prims[1].pos].filter((_, i) => i % 3 === 0).map(Math.abs)).toFixed(4)} vs belly radius ${(bodyWidth / 2).toFixed(4)}`);

// Handle ends have to sit inside the wall or the joins show as open pipe.
const profile = S.buildProfile();
{
  const radiusAt = (y) => profile.radiusAtY(y + 0.5); // model space is centred on y
  let buried = 0;
  let exposed = 0;
  for (let i = 0; i < prims[1].pos.length; i += 3) {
    const [x, y, z] = [prims[1].pos[i], prims[1].pos[i + 1], prims[1].pos[i + 2]];
    if (Math.hypot(x, z) < radiusAt(y)) buried += 1;
    else exposed += 1;
  }
  check("handle ends are buried in the wall", buried > 40, `${buried} vertices inside the surface`);
  check("most of each handle stands clear", exposed > buried * 3, `${exposed} outside vs ${buried} inside`);
}

// --- the UV / rotation contract -------------------------------------------
// position(theta) = (r sin, y, r cos); u = ((theta + PI) / 2PI) mod 1; three's
// rotation.y by A maps surface theta to theta + A. So the panel facing the
// camera at angle A must be the one painted at u = ((180 - A)/360) mod 1.
const myths = {};
const source = fs.readFileSync(path.join(root, "data/myths.ts"), "utf8");
for (const [, key, angle] of source.matchAll(/(\w+):\s*\{[^}]*?angle:\s*(-?[\d.]+)/gs)) {
  myths[key] = Number(angle);
}
check("myth angles parsed", Object.keys(myths).length >= 2, JSON.stringify(myths));

// mirrors nearestStory / shortestDelta in lib/amphora.ts
const shortestDelta = (from, to) => ((to - from + 540) % 360) - 180;
const nearestStory = (angle) =>
  Object.keys(myths).reduce((best, key) =>
    Math.abs(shortestDelta(angle, myths[key])) < Math.abs(shortestDelta(angle, myths[best])) ? key : best);
const panelOf = (u) => {
  let best = null;
  let bestDistance = Infinity;
  for (const [key, angle] of Object.entries(myths)) {
    const pu = (((180 - angle) / 360) % 1 + 1) % 1;
    const d = Math.min(Math.abs(u - pu), 1 - Math.abs(u - pu));
    if (d < bestDistance) {
      bestDistance = d;
      best = key;
    }
  }
  return best;
};

// Read the answer off the real geometry: rotate the body, find the belly vertex
// closest to the camera axis, and see which panel its u lands in.
const bellyRadius = bodyWidth / 2;
const candidates = [];
for (let i = 0; i < prims[0].pos.length; i += 3) {
  const [x, y, z] = [prims[0].pos[i], prims[0].pos[i + 1], prims[0].pos[i + 2]];
  if (Math.hypot(x, z) > bellyRadius * 0.985) candidates.push({ x, y, z, u: prims[0].uv[(i / 3) * 2] });
}
check("found belly vertices to sample", candidates.length > 20, `${candidates.length}`);

// A tie is legitimate exactly where the front-facing texel sits on a panel
// boundary: there nearestStory is a coin toss too, and both answers are right.
const uFacet = 1 / S.SEGMENTS;
const boundaries = Object.values(myths).map((angle) => (((180 - angle) / 360) % 1 + 1) % 1)
  .flatMap((u) => [u + 1 / (2 * Object.keys(myths).length), u - 1 / (2 * Object.keys(myths).length)])
  .map((u) => ((u % 1) + 1) % 1);
const distanceToBoundary = (u) =>
  Math.min(...boundaries.map((b) => Math.min(Math.abs(u - b), 1 - Math.abs(u - b))));

let mismatches = 0;
let ties = 0;
for (let angle = 0; angle < 360; angle += 1) {
  const a = (angle * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  let front = null;
  for (const c of candidates) {
    const rx = c.x * cos + c.z * sin;
    const rz = -c.x * sin + c.z * cos;
    if (rz <= 0) continue;
    const offAxis = Math.abs(rx);
    if (!front || offAxis < front.offAxis) front = { offAxis, u: c.u };
  }
  if (panelOf(front.u) === nearestStory(angle)) continue;
  if (distanceToBoundary(front.u) <= uFacet / 2 + 1e-6) ties += 1;
  else mismatches += 1;
}
check("painted panel matches the snap target", mismatches === 0,
  `${mismatches} mismatches, ${ties} boundary ties`);
check("boundary ties are confined to the seams", ties <= Object.keys(myths).length * 2 * 3,
  `${ties} angles`);

// --- textures --------------------------------------------------------------
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "amphora-verify-"));
for (const image of gltf.images) {
  const webp = path.join(dir, image.uri);
  const png = path.join(scratch, `${path.basename(image.uri, ".webp")}.png`);
  execFileSync("dwebp", ["-quiet", webp, "-o", png]);
  const decoded = S.readPNG(png);
  const powerOfTwo = (n) => (n & (n - 1)) === 0;
  check(`${image.uri} decodes`, decoded.w > 0 && decoded.h > 0, `${decoded.w}x${decoded.h}`);
  check(`${image.uri} is power-of-two (mipmaps)`, powerOfTwo(decoded.w) && powerOfTwo(decoded.h));
  check(`${image.uri} is 2:1 (matches the sheet)`, decoded.w === decoded.h * 2);
}
{
  const rough = S.readPNG(path.join(scratch, "amphora-roughness.png"));
  let minRough = 255;
  let maxRough = 0;
  let metalMax = 0;
  for (let i = 0; i < rough.w * rough.h; i++) {
    const o = i * rough.channels;
    minRough = Math.min(minRough, rough.px[o + 1]);
    maxRough = Math.max(maxRough, rough.px[o + 1]);
    metalMax = Math.max(metalMax, rough.px[o + 2]);
  }
  check("metalness is pinned off at the material", material.pbrMetallicRoughness.metallicFactor === 0);
  check("roughness sheet is grayscale (no chroma to smear)", Math.abs(metalMax - maxRough) <= 3,
    `blue max ${metalMax} vs green max ${maxRough}`);
  check("nothing is glossy", minRough / 255 > 0.4, `min roughness ${(minRough / 255).toFixed(2)}`);
  check("clay reaches near-matte", maxRough / 255 > 0.88, `max roughness ${(maxRough / 255).toFixed(2)}`);
  check("glaze and slip differ in sheen", (maxRough - minRough) / 255 > 0.25,
    `spread ${((maxRough - minRough) / 255).toFixed(2)}`);
}
{
  const normal = S.readPNG(path.join(scratch, "amphora-normal.png"));
  let worst = 0;
  let sum = 0;
  for (let i = 0; i < normal.w * normal.h; i++) {
    const o = i * normal.channels;
    const x = (normal.px[o] / 255) * 2 - 1;
    const y = (normal.px[o + 1] / 255) * 2 - 1;
    const z = (normal.px[o + 2] / 255) * 2 - 1;
    const tilt = (Math.acos(Math.min(1, Math.max(0, z / (Math.hypot(x, y, z) || 1)))) * 180) / Math.PI;
    worst = Math.max(worst, tilt);
    sum += tilt;
  }
  const mean = sum / (normal.w * normal.h);
  check("normal map is surface texture, not corrugation", mean < 6 && worst < 30,
    `mean tilt ${mean.toFixed(1)}deg, peak ${worst.toFixed(1)}deg`);
  check("normal map actually perturbs the surface", mean > 0.8, `mean tilt ${mean.toFixed(1)}deg`);
}

const totalBytes = glb.length + gltf.images.reduce((n, i) => n + fs.statSync(path.join(dir, i.uri)).size, 0);
check("shipped payload under 700 KB", totalBytes < 700 * 1024, `${(totalBytes / 1024).toFixed(0)} KB`);

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
