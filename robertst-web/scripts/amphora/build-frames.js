"use strict";

// Renders the 2D fallback: 36 turntable frames, 10 degrees apart, into
// public/images/amphora/frames/.
//
//   node scripts/amphora/build-frames.js
//
// These are what a reader without WebGL sees, so they are rendered from the
// shipped glb through the same software renderer, camera and lights as
// preview.js — which is the point. Frames drawn any other way drift from the
// 3D viewer every time the vessel is repainted, and the handle hit boxes in
// lib/amphora.ts are computed from this projection, so a fallback at a
// different camera puts the grab targets in the wrong place.
//
// Written as PAM rather than PNG because the frames need an alpha channel and
// shared.js's PNG writer is RGB; cwebp reads PAM directly.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

process.env.AMPHORA_RENDER_WIDTH = process.env.AMPHORA_RENDER_WIDTH || "720";
const { render, WIDTH, HEIGHT } = require("./preview.js");

const FRAME_COUNT = 36;
const QUALITY = 82;
const out = path.resolve(__dirname, "../../public/images/amphora/frames");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "amphora-frames-"));

fs.mkdirSync(out, { recursive: true });

const header = Buffer.from(
  `P7\nWIDTH ${WIDTH}\nHEIGHT ${HEIGHT}\nDEPTH 4\nMAXVAL 255\nTUPLTYPE RGB_ALPHA\nENDHDR\n`,
  "ascii",
);

let total = 0;

for (let frame = 0; frame < FRAME_COUNT; frame++) {
  const degrees = Math.round((frame * 360) / FRAME_COUNT);
  const name = `amphora-${String(degrees).padStart(3, "0")}`;
  const pam = path.join(scratch, `${name}.pam`);
  const webp = path.join(out, `${name}.webp`);

  fs.writeFileSync(pam, Buffer.concat([header, Buffer.from(render(degrees))]));
  execFileSync("cwebp", ["-quiet", "-q", String(QUALITY), "-m", "6", "-alpha_q", "100", pam, "-o", webp]);

  const bytes = fs.statSync(webp).size;
  total += bytes;
  process.stdout.write(`  ${name}.webp  ${(bytes / 1024).toFixed(0).padStart(3)} KB\r`);
}

console.log(
  `\n36 frames at ${WIDTH}x${HEIGHT} -> ${(total / 1024).toFixed(0)} KB total (q${QUALITY})`,
);
