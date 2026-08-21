"use strict";

// Regenerates the amphora's model and textures into public/models/amphora/.
//   node scripts/amphora/build.js
// The myth angles are read out of data/myths.ts so the painted panels and the
// snap targets can never disagree.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const here = __dirname;
const root = path.resolve(here, "../..");
const out = path.join(root, "public/models/amphora");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "amphora-"));

const source = fs.readFileSync(path.join(root, "data/myths.ts"), "utf8");
const myths = {};
for (const [, key, angle] of source.matchAll(/(\w+):\s*\{[^}]*?angle:\s*(-?[\d.]+)/gs)) {
  myths[key] = { angle: Number(angle) };
}
if (!Object.keys(myths).length) throw new Error("no myths with angles found in data/myths.ts");
console.log(`myths: ${Object.entries(myths).map(([k, m]) => `${k}@${m.angle}deg`).join(", ")}`);

const layoutPath = path.join(scratch, "layout.json");
const mythsPath = path.join(scratch, "myths.json");
fs.writeFileSync(mythsPath, JSON.stringify(myths));

const run = (script, args) => {
  execFileSync(process.execPath, [path.join(here, script), ...args], { stdio: "inherit" });
};
run("build-model.js", [path.join(out, "amphora.glb"), layoutPath]);
run("build-textures.js", [scratch, layoutPath, mythsPath]);

// The generators emit PNG because that is what Node can write losslessly; the
// shipped asset is WebP. Quality is per-sheet: base colour carries crisp painted
// edges, the other two are smooth and compress hard.
const QUALITY = { basecolor: 93, roughness: 90, normal: 92 };
let shipped = 0;
for (const [name, quality] of Object.entries(QUALITY)) {
  const png = path.join(scratch, `amphora-${name}.png`);
  const webp = path.join(out, `amphora-${name}.webp`);
  execFileSync("cwebp", ["-quiet", "-q", String(quality), "-m", "6", png, "-o", webp]);
  const bytes = fs.statSync(webp).size;
  shipped += bytes;
  console.log(`  amphora-${name}.webp  ${(bytes / 1024).toFixed(0).padStart(4)} KB  (q${quality}, from ${(fs.statSync(png).size / 1024).toFixed(0)} KB png)`);
}
const model = fs.statSync(path.join(out, "amphora.glb")).size;
console.log(`shipped: ${((model + shipped) / 1024).toFixed(0)} KB total (${(model / 1024).toFixed(0)} KB glb + ${(shipped / 1024).toFixed(0)} KB textures)`);
console.log(`intermediates in ${scratch}`);
