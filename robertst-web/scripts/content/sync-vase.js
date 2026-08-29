"use strict";

// Regenerates data/vase-panels.json — the figure list the amphora asset
// pipeline paints from.
//
// The vessel has to agree with the active week: which myth is at which angle,
// and which ones are sealed and therefore painted obscured. This is the handoff
// between content/ and scripts/amphora/.

const fs = require("fs");
const path = require("path");

const C = require("./lib.js");

const angles = C.vaseSlotAngles();
const week = C.activeWeek();

const panels = week.entries
  .filter((entry) => entry.vaseSlot !== null)
  .sort((a, b) => a.vaseSlot - b.vaseSlot);

if (panels.length !== angles.length) {
  throw new Error(`week ${week.week} fills ${panels.length} of ${angles.length} vase slots`);
}

const file = {
  _generated: `npm run content:sync from content/weeks/${week.week}.json — do not edit`,
  week: week.week,
  panels: panels.map((entry) => ({
    key: entry.mythSlug,
    name: C.readMyth(entry.mythSlug).title,
    angle: angles[entry.vaseSlot],
    slot: entry.vaseSlot,
    access: entry.access,
  })),
};

fs.writeFileSync(path.join(C.root, "data/vase-panels.json"), `${JSON.stringify(file, null, 2)}\n`);
console.log(`week ${week.week} -> data/vase-panels.json`);
for (const panel of file.panels) {
  console.log(`  slot ${panel.slot}  ${String(panel.angle).padStart(3)}deg  ${panel.key} (${panel.access})`);
}
