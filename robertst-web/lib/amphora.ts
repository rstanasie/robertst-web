import { myths, MythStory } from "@/data/myths";

export const FRAME_COUNT = 36;
export const DEGREES_PER_FRAME = 360 / FRAME_COUNT;

export const FRAME_WIDTH = 474;
export const FRAME_HEIGHT = 829;

export const DRAG_SENSITIVITY = 0.5;
export const FRICTION = 0.94;
export const MIN_VELOCITY = 0.02;
export const MAX_VELOCITY = 3;
export const SNAP_DURATION = 420;
export const FLICK_VELOCITY_MIN = 0.7;
export const FLICK_VELOCITY_MAX = 1.6;

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

export function nearestStory(angle: number): MythStory {
  const stories = Object.keys(myths) as MythStory[];

  return stories.reduce((closest, story) =>
    Math.abs(shortestDelta(angle, myths[story].angle)) <
    Math.abs(shortestDelta(angle, myths[closest].angle))
      ? story
      : closest,
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
