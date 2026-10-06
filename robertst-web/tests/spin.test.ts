import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  chooseStory,
  emptySpinMemory,
  rememberOpened,
  rememberSpin,
  SPIN_RULES,
} from "@/lib/spin/rules";
import type { SpinCandidate, SpinMemory } from "@/lib/spin/rules";
import { parseSpinMemory } from "@/lib/spin/storage";

const WEEK: SpinCandidate[] = [
  { key: "prometheus", readable: true },
  { key: "dionysos", readable: true },
  { key: "icarus", readable: true },
  { key: "orpheus", readable: false },
  { key: "pandora", readable: false },
];

const SEALED: SpinCandidate[] = WEEK.map((story) => ({ ...story, readable: false }));

/** A random source that reads from a script, so every draw is stated. */
const scripted = (...values: number[]) => {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
};

/** The whole pool, one draw per slot, so nothing is left to chance. */
function everyOutcome(candidates: SpinCandidate[], memory: SpinMemory): string[] {
  const seen = new Set<string>();

  // 200 evenly spaced tickets covers any weighting these rules can produce.
  for (let i = 0; i < 200; i += 1) {
    const key = chooseStory(candidates, memory, () => i / 200);
    if (key) seen.add(key);
  }

  return [...seen];
}

/** Plays `keys` through the memory as if each had been a completed spin. */
const after = (keys: string[], candidates = WEEK, from = emptySpinMemory()) =>
  keys.reduce((memory, key) => rememberSpin(memory, key, candidates), from);

describe("spin selection", () => {
  it("stands a story down after it has come up twice running", () => {
    const memory = after(["icarus", "icarus"]);
    assert.ok(!everyOutcome(WEEK, memory).includes("icarus"));
  });

  it("lets it back in on the spin after that", () => {
    const memory = after(["icarus", "icarus", "dionysos"]);
    assert.ok(everyOutcome(WEEK, memory).includes("icarus"));
  });

  it("does not stand anything down for a single appearance", () => {
    assert.deepEqual(
      everyOutcome(WEEK, after(["icarus"])).sort(),
      WEEK.map((story) => story.key).sort(),
    );
  });

  it("offers only readable stories after two sealed results", () => {
    const memory = after(["orpheus", "pandora"]);
    assert.equal(memory.blocked, 2);
    assert.deepEqual(everyOutcome(WEEK, memory).sort(), ["dionysos", "icarus", "prometheus"]);
  });

  it("counts a readable result as breaking the sealed streak", () => {
    const memory = after(["orpheus", "icarus", "pandora"]);
    assert.equal(memory.blocked, 1);
    assert.ok(everyOutcome(WEEK, memory).includes("orpheus"));
  });

  it("guarantees something readable inside the first three spins", () => {
    // Two spins that landed on sealed panels, by whatever route.
    const memory = after(["orpheus", "orpheus"]);
    const outcomes = everyOutcome(WEEK, memory);

    assert.equal(outcomes.length > 0, true);
    assert.ok(outcomes.every((key) => WEEK.find((s) => s.key === key)?.readable));
  });

  it("keeps the guarantee even when the streak was broken by a sealed-then-sealed pair", () => {
    // A week where the only sealed story is the one that keeps coming up: the
    // third spin is the last inside the guarantee and must be readable.
    const memory: SpinMemory = { ...after(["orpheus"]), blocked: 0 };
    assert.equal(memory.spins, 1);
    assert.equal(memory.foundReadable, false);

    const third: SpinMemory = { ...memory, spins: 2 };
    assert.ok(everyOutcome(WEEK, third).every((key) => WEEK.find((s) => s.key === key)?.readable));
  });

  it("asks for nothing once a readable story has already been found", () => {
    const memory: SpinMemory = { ...after(["icarus", "orpheus"]), spins: 2 };
    assert.equal(memory.foundReadable, true);
    assert.ok(everyOutcome(WEEK, memory).includes("pandora"));
  });

  it("lets the only readable story repeat rather than withhold it", () => {
    const week: SpinCandidate[] = [
      { key: "icarus", readable: true },
      { key: "orpheus", readable: false },
      { key: "pandora", readable: false },
    ];

    // Twice running, which would normally stand it down — but it is the only
    // thing the reader can read, and the guarantee outranks the repeat rule.
    const memory = after(["icarus", "icarus"], week);
    const forced: SpinMemory = { ...memory, blocked: SPIN_RULES.blockedLimit };

    assert.deepEqual(everyOutcome(week, forced), ["icarus"]);
  });

  it("still offers something when nothing at all is readable", () => {
    const memory = after(["orpheus", "pandora"], SEALED);
    const outcomes = everyOutcome(SEALED, memory);

    assert.ok(outcomes.length >= SEALED.length - 1);
    assert.equal(chooseStory(SEALED, memory, () => 0.5) !== null, true);
  });

  it("returns nothing for an empty vessel rather than throwing", () => {
    assert.equal(chooseStory([], emptySpinMemory(), () => 0.5), null);
  });

  it("weights an unopened story above one already read", () => {
    const week: SpinCandidate[] = [
      { key: "read", readable: true },
      { key: "fresh", readable: true },
    ];
    const memory = rememberOpened(emptySpinMemory(), "read");

    // Weights are 1 and 2, so the first third of the tickets is the opened
    // story and the rest is the fresh one. Exactly where the boundary falls is
    // the assertion: a weighting that drifted would move it.
    assert.equal(chooseStory(week, memory, () => 0.32), "read");
    assert.equal(chooseStory(week, memory, () => 0.34), "fresh");
    assert.equal(SPIN_RULES.freshWeight, 2);
  });

  it("draws from the whole pool and never off the end of it", () => {
    for (const ticket of [0, 0.5, 0.999999, 1, 1.5, -0.2, Number.NaN]) {
      const key = chooseStory(WEEK, emptySpinMemory(), () => ticket);
      assert.ok(WEEK.some((story) => story.key === key), `ticket ${ticket} fell off the pool`);
    }
  });
});

describe("spin memory", () => {
  it("counts only the spins it is told about", () => {
    // The rules module has no way to count a spin that was never settled: a
    // cancelled animation simply never calls rememberSpin.
    const memory = after(["icarus"]);
    assert.equal(memory.spins, 1);
    assert.deepEqual(memory.recent, ["icarus"]);
  });

  it("keeps openings apart from appearances", () => {
    const shown = after(["icarus", "orpheus"]);
    assert.deepEqual(shown.opened, []);

    const opened = rememberOpened(shown, "orpheus");
    assert.deepEqual(opened.opened, ["orpheus"]);
    assert.deepEqual(opened.recent, ["icarus", "orpheus"]);

    // And an opening does not count twice.
    assert.deepEqual(rememberOpened(opened, "orpheus").opened, ["orpheus"]);
  });

  it("remembers the last readable story, and does not forget it for a sealed one", () => {
    const memory = after(["icarus", "orpheus"]);
    assert.equal(memory.lastReadable, "icarus");
  });

  it("bounds the history it keeps", () => {
    const memory = after(Array.from({ length: 40 }, (_, i) => `story-${i % 5}`));
    assert.equal(memory.recent.length, SPIN_RULES.recentKept);
    assert.equal(memory.spins, 40);
  });

  it("treats a story that has left the week as unreadable rather than throwing", () => {
    const memory = rememberSpin(emptySpinMemory(), "gone", WEEK);
    assert.equal(memory.blocked, 1);
    assert.equal(memory.lastReadable, null);
  });
});

describe("spin memory storage", () => {
  it("restores a session it wrote", () => {
    const memory = rememberOpened(after(["icarus", "orpheus"]), "icarus");
    assert.deepEqual(parseSpinMemory(JSON.stringify(memory)), memory);
  });

  it("refuses anything it does not recognise", () => {
    const rejected = [
      "",
      "null",
      "[]",
      '"icarus"',
      "{}",
      '{"recent":["a"],"blocked":1,"spins":1,"foundReadable":true,"opened":[]}',
      '{"recent":"a","blocked":1,"spins":1,"foundReadable":true,"opened":[],"lastReadable":null}',
      '{"recent":[1],"blocked":1,"spins":1,"foundReadable":true,"opened":[],"lastReadable":null}',
      '{"recent":[],"blocked":-1,"spins":1,"foundReadable":true,"opened":[],"lastReadable":null}',
      '{"recent":[],"blocked":1.5,"spins":1,"foundReadable":true,"opened":[],"lastReadable":null}',
      '{"recent":[],"blocked":1,"spins":1,"foundReadable":"yes","opened":[],"lastReadable":null}',
      '{"recent":[],"blocked":1,"spins":1,"foundReadable":true,"opened":[],"lastReadable":7}',
      "{not json at all",
    ];

    for (const raw of rejected) {
      assert.equal(parseSpinMemory(raw), null, `accepted ${raw}`);
    }
  });

  it("carries protections across a restore", () => {
    const before = after(["orpheus", "pandora"]);
    const restored = parseSpinMemory(JSON.stringify(before));

    assert.ok(restored);
    assert.equal(restored.blocked, 2);
    assert.ok(everyOutcome(WEEK, restored).every((key) => WEEK.find((s) => s.key === key)?.readable));
  });
});

describe("the scripted random source", () => {
  it("drives a sequence of spins deterministically", () => {
    const random = scripted(0.05, 0.95, 0.5);
    const first = chooseStory(WEEK, emptySpinMemory(), random);
    const second = chooseStory(WEEK, emptySpinMemory(), random);

    assert.equal(first, "prometheus");
    assert.equal(second, "pandora");
    assert.notEqual(first, second);
  });
});
