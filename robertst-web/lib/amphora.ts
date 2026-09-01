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

export const FRAME_WIDTH = 474;
export const FRAME_HEIGHT = 829;

/**
 * Degrees of rotation per CSS pixel of drag. The vessel is turned by its
 * handles, so this is the gearing of a crank rather than of a trackball: a
 * drag of about a phone's width takes it most of the way round.
 *
 * MIN_DRAG_POSITIONS is what sets it, and it is set by the smallest screen.
 * Four stops is 288 deg, which the old 0.5 deg/px turned into 576px of travel —
 * wider than any phone, and a swipe cannot leave the glass. At 320px the widest
 * reach from a handle to the far edge measures about 170px, so the gearing has
 * to put 288 deg comfortably inside that rather than just barely: 2 deg/px
 * makes it 144px, and a short decisive swipe everywhere else.
 *
 * Nothing is lost to the higher gearing. Fine positioning by hand stopped being
 * possible the moment short drags began winding themselves back — the vessel is
 * a crank now, not a trackball.
 */
export const DRAG_SENSITIVITY = 2;
export const FRICTION = 0.94;
export const MIN_VELOCITY = 0.02;
export const MAX_VELOCITY = 3;

/**
 * Pointer travel, in CSS pixels, before a touch counts as turning the vessel.
 * Under it the vessel does not move at all and the story it settled on stands,
 * so resting a finger on the clay — or a trackpad tremor inside a click — is a
 * touch rather than a new draw.
 */
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
export const SPIN_VELOCITY_MIN = (SPIN_SPEED_PX_PER_S * DRAG_SENSITIVITY) / 1000;

/**
 * A gesture that stops moving before the finger lifts has no throw in it, so
 * the last measured speed is stale and must not be read as a flick.
 */
export const VELOCITY_STALE_MS = 100;

/**
 * How far the vessel must be turned before the gesture counts as a spin at all.
 * Anything shorter is wound back to exactly where it started and selects
 * nothing, which is what stops the collection being walked through a myth at a
 * time by repeated small drags.
 */
export const MIN_DRAG_POSITIONS = 4;

/** The threshold in degrees, for whatever number of stops the week has. */
export function minDragDegrees(stopCount: number): number {
  return stopCount > 0 ? MIN_DRAG_POSITIONS * (360 / stopCount) : 0;
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

export function clampVelocity(velocity: number): number {
  return Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, velocity));
}

export function applyFriction(velocity: number, elapsed: number): number {
  return velocity * Math.pow(FRICTION, elapsed / FRICTION_REFERENCE_MS);
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
