/**
 * Rotation maths and gesture tunables. Deliberately knows nothing about myths,
 * weeks or access: the caller passes the stops it wants the vessel to settle on,
 * which is what lets the weekly collection change without touching the physics.
 */

export type RotationStop = {
  /** Whatever the caller uses to identify the stop — a myth slug, in practice. */
  key: string;
  angle: number;
};

export const FRAME_COUNT = 36;
export const DEGREES_PER_FRAME = 360 / FRAME_COUNT;

/** The 2D fallback's frames, as `npm run amphora:frames` writes them. */
export const FRAME_WIDTH = 720;
export const FRAME_HEIGHT = 1029;

/* ── Gesture geometry ────────────────────────────────────────────────────────
   The vessel is turned by its handles, so this is the gearing of a crank
   rather than of a trackball. That gearing cannot be one number, because the
   reach of a gesture is a property of the glass it happens on: on a 320px
   phone the widest reach from a handle to the far edge measures about 170px,
   while a pointer has a whole desk. Both have to be able to turn the pot the
   MIN_DRAG_POSITIONS panels that count as a spin, and neither should feel
   geared for the other.

   Two numbers per tier, read in different domains:

     dragSensitivity    degrees of rotation per CSS pixel — how the pot follows
                        the hand.
     pixelsPerPosition  pixels of travel that count as one panel — what a spin
                        costs in hand movement.

   They are set together, so that on a full five-panel collection four panels
   of travel is also four panels of rotation: 360/5 is 72 deg per panel, and
   every tier has dragSensitivity = 72 / pixelsPerPosition. Nothing below reads
   one through the other, so they can be tuned apart once a real phone has had
   an opinion.

   The desktop tier is the behaviour the vessel has always had: 2 deg/px, and
   144px of travel for a spin.
   ─────────────────────────────────────────────────────────────────────────── */

export type AmphoraInteraction = {
  dragSensitivity: number;
  pixelsPerPosition: number;
};

export const AMPHORA_INTERACTION = {
  /** Phones in one hand, where a thumb is the whole of the reach. */
  mobile: { dragSensitivity: 4, pixelsPerPosition: 18 },
  /** Large phones, and tablets held upright. */
  tablet: { dragSensitivity: 2.88, pixelsPerPosition: 25 },
  /** Tablets on their side, and small laptops. */
  laptop: { dragSensitivity: 2.25, pixelsPerPosition: 32 },
  desktop: { dragSensitivity: 2, pixelsPerPosition: 36 },
} as const satisfies Record<string, AmphoraInteraction>;

/** Ascending upper bounds, in CSS pixels of viewport width. */
const INTERACTION_TIERS = [
  { below: 480, config: AMPHORA_INTERACTION.mobile },
  { below: 768, config: AMPHORA_INTERACTION.tablet },
  { below: 1200, config: AMPHORA_INTERACTION.laptop },
] as const;

/**
 * The gearing for a viewport. A width that is not a number — which is what a
 * server has — falls through every comparison and lands on desktop, so this is
 * safe to call anywhere even though only the browser has a real answer.
 */
export function getAmphoraInteractionConfig(viewportWidth: number): AmphoraInteraction {
  return (
    INTERACTION_TIERS.find((tier) => viewportWidth < tier.below)?.config ??
    AMPHORA_INTERACTION.desktop
  );
}

export const FRICTION = 0.94;
export const MIN_VELOCITY = 0.02;

export const DRAG_ENGAGE_PX = 6;

/**
 * Release speed that separates turning the vessel from throwing it. Stated as
 * pointer speed and converted, so it stays the same gesture if the gearing
 * above ever changes.
 *
 * Below the threshold the vessel has no inertia and eases to the panel it is
 * already nearest; above it, it spins on.
 */
export const SPIN_SPEED_PX_PER_S = 700;

/**
 * The fastest the vessel is allowed to be moving, also stated as pointer speed:
 * without a ceiling a flick on glass can put several turns a second into a pot
 * that weighs, by the look of it, twenty kilos.
 */
export const MAX_SPEED_PX_PER_S = 1500;

/** Both, in the degrees per millisecond the animation loop works in. */
export function spinVelocityMin(config: AmphoraInteraction): number {
  return (SPIN_SPEED_PX_PER_S * config.dragSensitivity) / 1000;
}

export function maxVelocity(config: AmphoraInteraction): number {
  return (MAX_SPEED_PX_PER_S * config.dragSensitivity) / 1000;
}

/**
 * A gesture that stops moving before the finger lifts has no throw in it, so
 * the last measured speed is stale and must not be read as a flick.
 */
export const VELOCITY_STALE_MS = 100;

/**
 * How many panels a gesture must cover before it counts as a spin at all.
 * Anything shorter is wound back to exactly where it started and selects
 * nothing, which is what stops the collection being walked through a myth at a
 * time by repeated small drags.
 */
export const MIN_DRAG_POSITIONS = 4;

/**
 * The threshold is measured in pointer travel rather than in degrees turned,
 * which is what makes it responsive: four panels is four panels on every
 * screen, but it costs 72px of thumb on a phone and 144px of pointer on a
 * desk. Net travel, not distance covered, so a drag out and back is not a spin.
 */
export function dragPositions(travelX: number, config: AmphoraInteraction): number {
  return Math.abs(travelX) / config.pixelsPerPosition;
}

/** The same threshold as a distance, for anything that needs to state it. */
export function minDragPixels(config: AmphoraInteraction): number {
  return MIN_DRAG_POSITIONS * config.pixelsPerPosition;
}

export const SNAP_DURATION_MIN = 240;
export const SNAP_DURATION_MAX = 640;
export const SNAP_MS_PER_DEGREE = 7;

const FRICTION_REFERENCE_MS = 1000 / 60;

export function normalizeAngle(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

export function angleToFrameIndex(angle: number): number {
  return Math.round(normalizeAngle(angle) / DEGREES_PER_FRAME) % FRAME_COUNT;
}

export function frameSrc(frameIndex: number): string {
  const degrees = Math.round((frameIndex % FRAME_COUNT) * DEGREES_PER_FRAME);
  return `/images/amphora/frames/amphora-${String(degrees).padStart(3, "0")}.webp`;
}

export const FRAME_SOURCES = Array.from({ length: FRAME_COUNT }, (_, index) =>
  frameSrc(index),
);

export function shortestDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

/**
 * Shortest circular distance decides, so 355 deg resolves to a stop at 0 rather
 * than to one at 240. Exact midpoints tie and resolve to the earlier stop.
 */
export function nearestStop(angle: number, stops: readonly RotationStop[]): RotationStop {
  if (stops.length === 0) {
    throw new Error("nearestStop needs at least one stop");
  }

  return stops.reduce((closest, stop) =>
    Math.abs(shortestDelta(angle, stop.angle)) < Math.abs(shortestDelta(angle, closest.angle))
      ? stop
      : closest,
  );
}

/**
 * The next stop in a given direction, for turning the vessel a panel at a time
 * from the keyboard. The stop currently faced is skipped, so a turn always
 * moves; with one stop it is the only answer.
 */
export function stepStop(
  angle: number,
  stops: readonly RotationStop[],
  direction: 1 | -1,
): RotationStop {
  if (stops.length === 0) {
    throw new Error("stepStop needs at least one stop");
  }

  const ahead = (stop: RotationStop) => {
    const forward = (((direction * (stop.angle - angle)) % 360) + 360) % 360;
    return forward < 1 ? 360 : forward;
  };

  return stops.reduce((best, stop) => (ahead(stop) < ahead(best) ? stop : best));
}

/**
 * Long turns take longer than small corrections, so a keyboard step across a
 * panel reads as the vessel being turned and a 3 deg tidy-up does not linger.
 */
export function snapDuration(delta: number): number {
  return Math.min(
    SNAP_DURATION_MAX,
    Math.max(SNAP_DURATION_MIN, Math.abs(delta) * SNAP_MS_PER_DEGREE),
  );
}

export function clampVelocity(velocity: number, max: number): number {
  return Math.max(-max, Math.min(max, velocity));
}

export function applyFriction(velocity: number, elapsed: number): number {
  return velocity * Math.pow(FRICTION, elapsed / FRICTION_REFERENCE_MS);
}

/* ── Planning a glide ────────────────────────────────────────────────────────
   The vessel no longer coasts and then snaps to whatever it is nearest: the
   story is chosen first and the pot is turned to it. That means the glide has
   to arrive somewhere exact, which rules out integrating the velocity frame by
   frame — a sum of v*dt over variable frame times drifts a few degrees from
   the curve it is meant to be following, and those degrees would have to be
   taken out by a correction at the end. The correction is precisely the thing
   that reads as the vessel changing its mind.

   So the same exponential decay is solved rather than stepped. Friction is
   unchanged; what changes is that the distance is known before the first
   frame, and the release speed is derived from the distance instead.

     speed(t)    = v0 * e^(-DECAY t)
     distance(t) = (v0 / DECAY) (1 - e^(-DECAY t))

   with the glide ending when the speed falls to MIN_VELOCITY, so a glide of v0
   covers exactly (v0 - MIN_VELOCITY) / DECAY.
   ─────────────────────────────────────────────────────────────────────────── */

const DECAY = -Math.log(FRICTION) / FRICTION_REFERENCE_MS;

/** How far a vessel released at this speed would coast, in degrees. */
export function glideDistance(speed: number): number {
  return speed <= MIN_VELOCITY ? 0 : (speed - MIN_VELOCITY) / DECAY;
}

/** The release speed that coasts exactly this far. The inverse of the above. */
export function glideSpeed(distance: number): number {
  return distance <= 0 ? MIN_VELOCITY : distance * DECAY + MIN_VELOCITY;
}

/** How long that glide lasts, in milliseconds. */
export function glideDuration(speed: number): number {
  return speed <= MIN_VELOCITY ? 0 : Math.log(speed / MIN_VELOCITY) / DECAY;
}

/** How far it has travelled `elapsed` ms in. */
export function glideProgress(speed: number, elapsed: number): number {
  return (speed / DECAY) * (1 - Math.exp(-DECAY * elapsed));
}

/**
 * Signed degrees from `angle` to `target`, travelling the way the hand was
 * going and covering at least `minimum` on the way.
 *
 * Keeping the direction is the point: a vessel thrown to the right that
 * reversed to reach its panel would read as being corrected by something
 * outside the room. Whole turns are added instead, which is what a heavy pot
 * does anyway.
 */
export function travelTo(
  angle: number,
  target: number,
  direction: 1 | -1,
  minimum: number,
): number {
  const forward = (((direction * (target - angle)) % 360) + 360) % 360;
  const turns = Math.ceil(Math.max(0, minimum - forward) / 360);
  return direction * (forward + turns * 360);
}

export function easeOutCubic(progress: number): number {
  return 1 - Math.pow(1 - progress, 3);
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}


/* ── Handle hit areas ────────────────────────────────────────────────────────
   Where the two handles land on screen, so only they can be grabbed.

   The camera numbers mirror AmphoraModelViewer and the handle numbers come from
   the tube envelope in scripts/amphora/shared.js — measured, not eyeballed: the
   arc's outer bow runs from radius 0.17 to 0.275 over y 0.155 to 0.43, in model
   units with the vessel one unit tall and centred on the origin. Starting at
   0.17 rather than at the arc's true inner end keeps the neck out of it.

   Both handles lie in the plane z = 0 at opposite sides, so rotating the vessel
   by A puts a point at radius r on side s at x = s*r*cos A, z = -s*r*sin A.
   That is the whole of it: the handles sweep across the silhouette as it turns,
   which is why the hit areas cannot simply be pinned to the left and right
   edges — at a fifth of the stops both handles are near the middle.
   ─────────────────────────────────────────────────────────────────────────── */

const CAMERA_DISTANCE = 2.05;
const CAMERA_FOV = 34;
/** The stage box is 7:10, and the camera's fov is vertical. */
const STAGE_ASPECT = 7 / 10;

const HANDLE_INNER_RADIUS = 0.17;
const HANDLE_OUTER_RADIUS = 0.27;
/* The attachments, not the tube envelope: the envelope overshoots into the wall
   at both ends, and those buried millimetres are not part of what you can see
   or take hold of. */
const HANDLE_BOTTOM_Y = 0.192;
const HANDLE_TOP_Y = 0.42;

/** Widest the vessel gets across the band the handles span. */
const BODY_RADIUS_AT_HANDLES = 0.209;

/**
 * Seen end-on the handle projects to a sliver, but it is then the part of the
 * vessel nearest the eye and the obvious thing to reach for, so it keeps a
 * grabbable width. As a fraction of the stage width.
 */
const HANDLE_MIN_WIDTH = 0.1;

export type HandleBox = {
  /** Stable per handle, not per side of the screen: they swap as it turns. */
  id: "a" | "b";
  /** Round the back of the vessel, so there is nothing there to take hold of. */
  occluded: boolean;
  /** All four as a fraction of the stage box, ready for percentage styling. */
  left: number;
  top: number;
  width: number;
  height: number;
};

function project(x: number, y: number, z: number): { u: number; v: number } {
  const depth = CAMERA_DISTANCE - z;
  const halfHeight = depth * Math.tan(((CAMERA_FOV / 2) * Math.PI) / 180);
  return {
    u: 0.5 + x / (2 * halfHeight * STAGE_ASPECT),
    v: 0.5 - y / (2 * halfHeight),
  };
}

export function handleHitBoxes(angle: number): HandleBox[] {
  const radians = (angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  // A handle round the back is hidden by the vessel unless it is turned far
  // enough round to stand out past the shoulder — beyond about 39 degrees off
  // the profile view it is simply not there to grab, and a hit area over the
  // painted body is exactly what this is meant to prevent.
  //
  // Reported rather than dropped. Both boxes always exist, because a hand may
  // be holding one when it turns out of sight, and an element that unmounts
  // mid-drag takes the pointer capture with it — no more moves, and no pointerup
  // to end the gesture at all.
  const standsOut = HANDLE_OUTER_RADIUS * Math.abs(cos) > BODY_RADIUS_AT_HANDLES;

  return ([1, -1] as const).map((side) => {
    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;

    for (const radius of [HANDLE_INNER_RADIUS, HANDLE_OUTER_RADIUS]) {
      // Depth changes the perspective scale by up to 15% across a turn, so the
      // corners are projected one at a time rather than scaled from a flat box.
      const x = side * radius * cos;
      const z = -side * radius * sin;

      for (const y of [HANDLE_BOTTOM_Y, HANDLE_TOP_Y]) {
        const point = project(x, y, z);
        left = Math.min(left, point.u);
        right = Math.max(right, point.u);
        top = Math.min(top, point.v);
        bottom = Math.max(bottom, point.v);
      }
    }

    if (right - left < HANDLE_MIN_WIDTH) {
      const middle = (left + right) / 2;
      left = middle - HANDLE_MIN_WIDTH / 2;
      right = middle + HANDLE_MIN_WIDTH / 2;
    }

    return {
      id: side > 0 ? "a" : "b",
      occluded: -side * sin < 0 && !standsOut,
      left,
      top,
      width: right - left,
      height: bottom - top,
    };
  });
}
