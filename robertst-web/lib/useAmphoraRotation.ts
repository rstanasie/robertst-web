"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";

import {
  applyFriction,
  clampVelocity,
  DRAG_ENGAGE_PX,
  DRAG_SENSITIVITY,
  easeOutCubic,
  MIN_VELOCITY,
  minDragDegrees,
  nearestStop,
  normalizeAngle,
  prefersReducedMotion,
  shortestDelta,
  snapDuration,
  SPIN_VELOCITY_MIN,
  stepStop,
  VELOCITY_STALE_MS,
} from "@/lib/amphora";
import type { RotationStop } from "@/lib/amphora";

const MAX_STEP_MS = 64;
const VELOCITY_SMOOTHING = 0.7;

export type AmphoraPointerHandlers = {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
};

export type AmphoraRotation = AmphoraPointerHandlers & {
  angle: number;
  angleRef: RefObject<number>;
  /** A hand is on the vessel, whether or not it has moved it yet. */
  isHolding: boolean;
  /** The hand is on the vessel and turning it. */
  isDragging: boolean;
  isSpinning: boolean;
  /** Key of the stop the vessel settled on, or null while it is moving. */
  story: string | null;
  /**
   * Set when a gesture turned the vessel but not far enough, and cleared by
   * anything that starts a new one. A fresh token each time rather than a flag,
   * so a second refusal reads as a second event and can restart whatever the
   * first put on screen.
   */
  refusal: number | null;
  /** Turn one panel, for hands on a keyboard rather than on the clay. */
  turn: (direction: 1 | -1) => void;
};

/**
 * Rotation, inertia and snapping for the vessel.
 *
 * A gesture is read as one of three things, because a heavy clay pot behaves as
 * three different things under a hand:
 *
 *   a touch   travel under DRAG_ENGAGE_PX. The vessel does not move and the
 *             story it settled on stands. This is what stops a tap, a tremor
 *             inside a click, or a thumb resting on a phone from dealing a new
 *             story out from under the reader.
 *   a nudge   engaged, but never turned MIN_DRAG_POSITIONS stops from where it
 *             started. It winds back along its own path to exactly the angle it
 *             was at, and selects nothing. A collection cannot be walked
 *             through a myth at a time by repeated short drags: every drag that
 *             falls short is undone in full.
 *   a spin    turned far enough to commit. Released fast it keeps going and
 *             loses speed to friction; released slow it eases straight to the
 *             panel it is nearest. Either way it lands on a stop and that stop
 *             is the story.
 *
 * The commit is one-way: once a gesture has crossed the threshold it stays
 * crossed, so winding back within the same drag does not cancel it.
 */
export function useAmphoraRotation(stops: readonly RotationStop[]): AmphoraRotation {
  const [angle, setAngle] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [story, setStory] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<number | null>(null);

  const angleRef = useRef(0);
  const velocityRef = useRef(0);
  const originXRef = useRef(0);
  const pointerXRef = useRef(0);
  const timeRef = useRef(0);
  const holdingRef = useRef(false);
  const engagedRef = useRef(false);
  /** The angle the vessel was resting at when the hand came down. */
  const startAngleRef = useRef(0);
  /** Signed degrees turned since then, unwrapped, so full turns keep counting. */
  const turnedRef = useRef(0);
  /** Set once the drag has passed the threshold; never cleared mid-gesture. */
  const committedRef = useRef(false);
  /** Whether the hand came down on a vessel that was still moving. */
  const interruptedRef = useRef(false);
  const frameRef = useRef<number | null>(null);

  const cancelAnimation = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  const commitAngle = useCallback((next: number) => {
    angleRef.current = normalizeAngle(next);
    setAngle(angleRef.current);
  }, []);

  const easeTo = useCallback(
    (target: RotationStop) => {
      const from = angleRef.current;
      const delta = shortestDelta(from, target.angle);

      const finish = () => {
        commitAngle(target.angle);
        setStory(target.key);
        setIsSpinning(false);
      };

      if (prefersReducedMotion() || Math.abs(delta) < 0.5) {
        finish();
        return;
      }

      const start = performance.now();
      const duration = snapDuration(delta);

      const step = (now: number) => {
        const progress = Math.min(1, (now - start) / duration);
        commitAngle(from + delta * easeOutCubic(progress));

        if (progress < 1) {
          frameRef.current = requestAnimationFrame(step);
          return;
        }

        frameRef.current = null;
        finish();
      };

      frameRef.current = requestAnimationFrame(step);
    },
    [commitAngle],
  );

  /**
   * Undo a drag that fell short. It retraces its own path rather than taking
   * the shortest way round: a vessel that was turned 200 deg and refused has to
   * be seen coming back, and going the other 160 deg would look like it carried
   * on and chose something.
   */
  const returnToStart = useCallback(() => {
    const from = turnedRef.current;
    const base = startAngleRef.current;

    const finish = () => {
      commitAngle(base);
      turnedRef.current = 0;
      setIsSpinning(false);
    };

    if (prefersReducedMotion() || Math.abs(from) < 0.5) {
      finish();
      return;
    }

    const start = performance.now();
    const duration = snapDuration(from);

    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      commitAngle(base + from * (1 - easeOutCubic(progress)));

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(step);
        return;
      }

      frameRef.current = null;
      finish();
    };

    frameRef.current = requestAnimationFrame(step);
  }, [commitAngle]);

  const settle = useCallback(() => {
    easeTo(nearestStop(angleRef.current, stops));
    // `stops` changes only when the week does; the 3D viewer is memoised on
    // props that do not come from here, so re-creating these callbacks is free.
  }, [easeTo, stops]);

  const glide = useCallback(() => {
    cancelAnimation();

    if (prefersReducedMotion() || Math.abs(velocityRef.current) < MIN_VELOCITY) {
      velocityRef.current = 0;
      settle();
      return;
    }

    let last = performance.now();

    const step = (now: number) => {
      const elapsed = Math.min(now - last, MAX_STEP_MS);
      last = now;

      commitAngle(angleRef.current + velocityRef.current * elapsed);
      velocityRef.current = applyFriction(velocityRef.current, elapsed);

      if (Math.abs(velocityRef.current) < MIN_VELOCITY) {
        frameRef.current = null;
        velocityRef.current = 0;
        settle();
        return;
      }

      frameRef.current = requestAnimationFrame(step);
    };

    frameRef.current = requestAnimationFrame(step);
  }, [cancelAnimation, commitAngle, settle]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      // A hand laid on a moving pot stops it, so grabbing counts as having moved
      // the vessel even if the hand never travels.
      const wasMoving = frameRef.current !== null;
      cancelAnimation();

      holdingRef.current = true;
      engagedRef.current = false;
      committedRef.current = false;
      interruptedRef.current = wasMoving;
      startAngleRef.current = angleRef.current;
      turnedRef.current = 0;
      velocityRef.current = 0;
      originXRef.current = event.clientX;
      pointerXRef.current = event.clientX;
      timeRef.current = performance.now();

      setIsHolding(true);
      setRefusal(null);

      if (wasMoving) {
        setIsSpinning(false);
      }

      event.currentTarget.setPointerCapture(event.pointerId);
      // Deliberately no setStory(null) here, nor when the drag engages. The
      // reveal is only cleared once the gesture commits, so a drag that falls
      // short never even blinks the story the reader was looking at.
    },
    [cancelAnimation],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!holdingRef.current) {
        return;
      }

      const now = performance.now();

      if (!engagedRef.current) {
        const travel = event.clientX - originXRef.current;

        if (Math.abs(travel) < DRAG_ENGAGE_PX) {
          return;
        }

        engagedRef.current = true;
        setIsDragging(true);
        // Measure from the threshold, not from the origin, so the vessel does
        // not jump the pixels spent deciding this was a turn.
        pointerXRef.current =
          originXRef.current + Math.sign(travel) * DRAG_ENGAGE_PX;
        timeRef.current = now;
      }

      const deltaX = event.clientX - pointerXRef.current;
      const elapsed = now - timeRef.current;
      const deltaAngle = deltaX * DRAG_SENSITIVITY;

      commitAngle(angleRef.current + deltaAngle);

      turnedRef.current += deltaAngle;

      if (
        !committedRef.current &&
        Math.abs(turnedRef.current) >= minDragDegrees(stops.length)
      ) {
        committedRef.current = true;
        setStory(null);
      }

      if (elapsed > 0) {
        const instant = deltaAngle / elapsed;
        velocityRef.current = clampVelocity(
          instant * VELOCITY_SMOOTHING +
            velocityRef.current * (1 - VELOCITY_SMOOTHING),
        );
      }

      pointerXRef.current = event.clientX;
      timeRef.current = now;
    },
    [commitAngle, stops.length],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!holdingRef.current) {
        return;
      }

      const engaged = engagedRef.current;
      const committed = committedRef.current;
      const interrupted = interruptedRef.current;

      holdingRef.current = false;
      engagedRef.current = false;
      committedRef.current = false;
      interruptedRef.current = false;

      setIsHolding(false);
      setIsDragging(false);

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      if (!committed) {
        velocityRef.current = 0;

        // A hand laid on a moving vessel stops it, and a stopped vessel still
        // has to come to rest on a panel — there is no earlier angle to go back
        // to, because it was mid-flight.
        if (interrupted) {
          setIsSpinning(true);
          settle();
          return;
        }

        // A touch on a still vessel is just a touch.
        if (!engaged) {
          return;
        }

        setIsSpinning(true);
        setRefusal(performance.now());
        returnToStart();
        return;
      }

      // A gesture that came to a halt before the finger lifted has no throw in
      // it, however fast it was a moment ago.
      if (performance.now() - timeRef.current > VELOCITY_STALE_MS) {
        velocityRef.current = 0;
      }

      setIsSpinning(true);

      if (Math.abs(velocityRef.current) < SPIN_VELOCITY_MIN) {
        velocityRef.current = 0;
        settle();
        return;
      }

      glide();
    },
    [glide, returnToStart, settle],
  );

  const turn = useCallback(
    (direction: 1 | -1) => {
      cancelAnimation();

      holdingRef.current = false;
      engagedRef.current = false;
      committedRef.current = false;
      interruptedRef.current = false;
      turnedRef.current = 0;
      velocityRef.current = 0;

      setIsHolding(false);
      setIsDragging(false);
      setStory(null);
      setRefusal(null);
      setIsSpinning(true);

      easeTo(stepStop(angleRef.current, stops, direction));
    },
    [cancelAnimation, easeTo, stops],
  );

  useEffect(() => cancelAnimation, [cancelAnimation]);

  return {
    angle,
    angleRef,
    isHolding,
    isDragging,
    isSpinning,
    story,
    refusal,
    turn,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  };
}
