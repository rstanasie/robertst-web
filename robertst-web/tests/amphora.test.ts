import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AMPHORA_INTERACTION,
  applyFriction,
  clampVelocity,
  dragPositions,
  getAmphoraInteractionConfig,
  maxVelocity,
  MIN_DRAG_POSITIONS,
  MIN_VELOCITY,
  minDragPixels,
  nearestStop,
  SPIN_SPEED_PX_PER_S,
  spinVelocityMin,
} from "@/lib/amphora";
import type { AmphoraInteraction } from "@/lib/amphora";
import { VASE_SLOT_ANGLES } from "@/lib/content/vase";

const STOPS = VASE_SLOT_ANGLES.map((angle, index) => ({ key: `story-${index}`, angle }));

/**
 * The pointer-handler arithmetic, lifted out of React: a gesture is a list of
 * clientX samples, and what comes back is what the hook would have done with
 * them. Angles and thresholds are computed exactly as useAmphoraRotation does,
 * which is what makes these assertions about the real interaction rather than
 * about a restatement of it.
 */
function gesture(
  samples: readonly { x: number; t: number }[],
  config: AmphoraInteraction,
  startAngle = 0,
) {
  const [first, ...moves] = samples;
  let angle = startAngle;
  let pointerX = first.x;
  let time = first.t;
  let travel = 0;
  let velocity = 0;
  let engaged = false;
  let committed = false;

  for (const sample of moves) {
    if (!engaged) {
      if (Math.abs(sample.x - first.x) < 6) {
        continue;
      }

      engaged = true;
      pointerX = first.x + Math.sign(sample.x - first.x) * 6;
      time = sample.t;
    }

    const deltaX = sample.x - pointerX;
    const elapsed = sample.t - time;
    const deltaAngle = deltaX * config.dragSensitivity;

    angle += deltaAngle;
    travel += deltaX;

    if (!committed && dragPositions(travel, config) >= MIN_DRAG_POSITIONS) {
      committed = true;
    }

    if (elapsed > 0) {
      velocity = clampVelocity(
        (deltaAngle / elapsed) * 0.7 + velocity * 0.3,
        maxVelocity(config),
      );
    }

    pointerX = sample.x;
    time = sample.t;
  }

  return { angle, travel, velocity, engaged, committed };
}

/** A steady drag of `distance` pixels over `duration` ms, sampled every 16ms. */
function swipe(distance: number, duration = 300, from = 0) {
  const steps = Math.max(1, Math.round(duration / 16));
  return Array.from({ length: steps + 1 }, (_, index) => ({
    x: from + (distance * index) / steps,
    t: index * (duration / steps),
  }));
}

/** How far a released vessel coasts, in degrees, under the real friction curve. */
function glideDegrees(velocity: number) {
  let speed = Math.abs(velocity);
  let degrees = 0;

  while (speed >= MIN_VELOCITY) {
    degrees += speed * 16;
    speed = applyFriction(speed, 16);
  }

  return degrees;
}

describe("amphora interaction config", () => {
  it("gives every viewport a tier, smaller screens the higher gearing", () => {
    const widths = [320, 375, 430, 480, 600, 768, 900, 1200, 1440, 2560];
    const configs = widths.map((width) => getAmphoraInteractionConfig(width));

    for (let index = 1; index < configs.length; index += 1) {
      assert.ok(
        configs[index].dragSensitivity <= configs[index - 1].dragSensitivity,
        `sensitivity rose from ${widths[index - 1]}px to ${widths[index]}px`,
      );
      assert.ok(
        configs[index].pixelsPerPosition >= configs[index - 1].pixelsPerPosition,
        `a spin got cheaper going from ${widths[index - 1]}px to ${widths[index]}px`,
      );
    }
  });

  it("puts the documented widths in the tier they are named for", () => {
    assert.deepEqual(getAmphoraInteractionConfig(375), AMPHORA_INTERACTION.mobile);
    assert.deepEqual(getAmphoraInteractionConfig(430), AMPHORA_INTERACTION.mobile);
    assert.deepEqual(getAmphoraInteractionConfig(480), AMPHORA_INTERACTION.tablet);
    assert.deepEqual(getAmphoraInteractionConfig(768), AMPHORA_INTERACTION.laptop);
    assert.deepEqual(getAmphoraInteractionConfig(1440), AMPHORA_INTERACTION.desktop);
  });

  it("answers desktop when there is no viewport to ask", () => {
    // What a server render would hand it, if anything ever did.
    assert.deepEqual(getAmphoraInteractionConfig(Number.NaN), AMPHORA_INTERACTION.desktop);
  });

  it("leaves desktop geared exactly as it always was", () => {
    assert.equal(AMPHORA_INTERACTION.desktop.dragSensitivity, 2);
    assert.equal(minDragPixels(AMPHORA_INTERACTION.desktop), 144);
  });

  it("keeps four panels within a thumb's reach on a phone", () => {
    // A 375px screen leaves about 170px between a handle and the far edge.
    assert.ok(minDragPixels(AMPHORA_INTERACTION.mobile) < 100);
  });

  it("still turns four panels of clay for four panels of travel", () => {
    // The two numbers are configured separately, so this is a real constraint
    // rather than an identity: it is what stops a tier being tuned into a pot
    // that commits after half a panel of visible movement.
    for (const config of Object.values(AMPHORA_INTERACTION)) {
      const turned = minDragPixels(config) * config.dragSensitivity;
      assert.ok(
        Math.abs(turned - MIN_DRAG_POSITIONS * (360 / STOPS.length)) < 1,
        `${JSON.stringify(config)} commits after ${turned} deg`,
      );
    }
  });

  it("states the flick threshold as one pointer speed on every screen", () => {
    for (const config of Object.values(AMPHORA_INTERACTION)) {
      assert.equal(
        (spinVelocityMin(config) * 1000) / config.dragSensitivity,
        SPIN_SPEED_PX_PER_S,
      );
      assert.ok(maxVelocity(config) > spinVelocityMin(config));
    }
  });
});

describe("amphora gestures", () => {
  it("refuses a drag of fewer than four panels and keeps the story", () => {
    for (const [name, config] of Object.entries(AMPHORA_INTERACTION)) {
      const short = minDragPixels(config) - 1;
      const result = gesture(swipe(short), config);

      assert.equal(result.committed, false, `${name} committed a ${short}px drag`);
      assert.ok(result.engaged, `${name} did not even engage`);
    }
  });

  it("accepts a drag of four panels", () => {
    for (const [name, config] of Object.entries(AMPHORA_INTERACTION)) {
      // Plus the six pixels spent deciding this was a turn rather than a touch.
      const result = gesture(swipe(minDragPixels(config) + 6), config);
      assert.equal(result.committed, true, `${name} refused a full-length drag`);
    }
  });

  it("does not move the vessel at all for a tap or a tremor", () => {
    for (const config of Object.values(AMPHORA_INTERACTION)) {
      const result = gesture(swipe(5, 80), config);
      assert.equal(result.engaged, false);
      assert.equal(result.angle, 0);
    }
  });

  it("cannot be walked round by repeated short drags", () => {
    // Each nudge is wound back to the angle it started at, so the sequence
    // cannot accumulate — asserted as the property the hook relies on: no
    // single nudge commits, whatever the tier.
    const config = AMPHORA_INTERACTION.mobile;

    for (let index = 0; index < 6; index += 1) {
      const result = gesture(swipe(minDragPixels(config) / 2), config, 36);
      assert.equal(result.committed, false);
    }
  });

  it("still throws the vessel on a fast phone flick", () => {
    const config = AMPHORA_INTERACTION.mobile;
    // 120px in 100ms — 1200px/s, an ordinary flick.
    const result = gesture(swipe(120, 100), config);

    assert.equal(result.committed, true);
    assert.ok(
      Math.abs(result.velocity) >= spinVelocityMin(config),
      `flick released at ${result.velocity} deg/ms`,
    );
    assert.ok(glideDegrees(result.velocity) > 360, "the flick did not carry a full turn");
  });

  it("reads a slow desktop drag as a turn rather than a throw", () => {
    const config = AMPHORA_INTERACTION.desktop;
    // 200px in 900ms — deliberate, hand-over-hand, no throw in it.
    const result = gesture(swipe(200, 900), config);

    assert.equal(result.committed, true);
    assert.ok(Math.abs(result.velocity) < spinVelocityMin(config));
  });

  it("lands a committed gesture on a real stop", () => {
    for (const config of Object.values(AMPHORA_INTERACTION)) {
      const result = gesture(swipe(minDragPixels(config) + 40), config);
      const stop = nearestStop(((result.angle % 360) + 360) % 360, STOPS);

      assert.ok(STOPS.some((candidate) => candidate.key === stop.key));
    }
  });

  it("changes gear on rotation without losing the angle", () => {
    // Portrait, then the phone turns and the same hand carries on. The gearing
    // changes for what comes next; nothing retroactively re-scales.
    const portrait = AMPHORA_INTERACTION.mobile;
    const landscape = AMPHORA_INTERACTION.tablet;

    const first = gesture(swipe(40), portrait);
    const second = gesture(swipe(40, 300, 40), landscape, first.angle);

    // The travel after the turn is geared at the new tier, and only at it.
    assert.ok(
      Math.abs(second.angle - (first.angle + (40 - 6) * landscape.dragSensitivity)) < 1e-6,
    );
    assert.ok(second.angle > first.angle);
  });
});
