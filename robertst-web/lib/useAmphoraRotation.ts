"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";

import {
  AMPHORA_INTERACTION,
  clampVelocity,
  DRAG_ENGAGE_PX,
  dragPositions,
  easeOutCubic,
  getAmphoraInteractionConfig,
  glideDistance,
  glideDuration,
  glideProgress,
  glideSpeed,
  maxVelocity,
  MIN_DRAG_POSITIONS,
  nearestStop,
  normalizeAngle,
  prefersReducedMotion,
  shortestDelta,
  snapDuration,
  spinVelocityMin,
  stepStop,
  travelTo,
  VELOCITY_STALE_MS,
} from "@/lib/amphora";
import type { AmphoraInteraction, RotationStop } from "@/lib/amphora";

const VELOCITY_SMOOTHING = 0.7;

/**
 * Who decides where a spin ends.
 *
 * The hook knows how to turn the vessel and nothing about what is painted on
 * it, so the choice is handed in. `landing` is where the throw would have put
 * it unaided, offered because a chooser may want to know; ours does not, and
 * the default simply reproduces the old behaviour of taking whatever panel the
 * physics arrived at.
 */
export type ChooseStop = (
  landing: number,
  stops: readonly RotationStop[],
) => RotationStop;

export type AmphoraRotationOptions = {
  chooseStop?: ChooseStop;
  /**
   * Called when a committed spin has come to rest, and only then. A gesture
   * that fell short, or one whose animation a hand interrupted, never reaches
   * here — which is what keeps cancelled spins out of the counters.
   */
  onSpinSettled?: (key: string) => void;
};

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
 *   a nudge   engaged, but never travelled MIN_DRAG_POSITIONS panels from where
 *             it started. It winds back along its own path to exactly the angle
 *             it was at, and selects nothing. A collection cannot be walked
 *             through a myth at a time by repeated short drags: every drag that
 *             falls short is undone in full.
 *   a spin    turned far enough to commit. The story is settled on first —
 *             by whatever `chooseStop` the caller handed in — and the vessel
 *             is then turned to it: thrown hard it keeps the direction of the
 *             throw and adds whole turns, released gently it takes the short
 *             way round. Either way it lands exactly on that stop, and that
 *             stop is the story.
 *
 * The commit is one-way: once a gesture has crossed the threshold it stays
 * crossed, so winding back within the same drag does not cancel it.
 *
 * How much hand each of those costs is a property of the viewport, not of the
 * pot: see AMPHORA_INTERACTION. The gearing is held in a ref and read inside
 * the pointer handlers, so a resize costs no render and a drag in progress
 * simply changes gear rather than jumping.
 */
export function useAmphoraRotation(
  stops: readonly RotationStop[],
  options: AmphoraRotationOptions = {},
): AmphoraRotation {
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
  /** Signed pointer travel since then, which is what the spin threshold reads. */
  const travelRef = useRef(0);
  /** Set once the drag has passed the threshold; never cleared mid-gesture. */
  const committedRef = useRef(false);
  /** Whether the hand came down on a vessel that was still moving. */
  const interruptedRef = useRef(false);
  const frameRef = useRef<number | null>(null);
  /**
   * Desktop until the browser says otherwise. A server has no viewport and
   * must not be asked for one, and the first thing the mount effect below does
   * is replace this — long before any hand can be on the vessel.
   */
  const configRef = useRef<AmphoraInteraction>(AMPHORA_INTERACTION.desktop);
  /**
   * Held in refs rather than closed over, so a parent that re-creates them on
   * every render cannot re-create the pointer handlers under a live gesture.
   */
  const chooseRef = useRef<ChooseStop | undefined>(options.chooseStop);
  const settledRef = useRef<((key: string) => void) | undefined>(options.onSpinSettled);

  useEffect(() => {
    chooseRef.current = options.chooseStop;
    settledRef.current = options.onSpinSettled;
  });

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

  /**
   * Turns the vessel exactly `travel` degrees and leaves it on `target`.
   *
   * The friction curve is solved rather than stepped — see the glide helpers in
   * lib/amphora.ts — so the last frame lands on the panel instead of near it.
   * Nothing is corrected at the end, because there is nothing left over to
   * correct.
   */
  const land = useCallback(
    (target: RotationStop, travel: number, settled?: () => void) => {
      cancelAnimation();

      const from = angleRef.current;
      const direction = travel < 0 ? -1 : 1;
      const distance = Math.abs(travel);
      const speed = glideSpeed(distance);
      const duration = glideDuration(speed);

      const finish = () => {
        frameRef.current = null;
        velocityRef.current = 0;
        commitAngle(target.angle);
        setStory(target.key);
        setIsSpinning(false);
        settled?.();
      };

      if (prefersReducedMotion() || duration < 16 || distance < 0.5) {
        finish();
        return;
      }

      const start = performance.now();

      const step = (now: number) => {
        const elapsed = now - start;

        if (elapsed >= duration) {
          finish();
          return;
        }

        commitAngle(from + direction * glideProgress(speed, elapsed));
        frameRef.current = requestAnimationFrame(step);
      };

      frameRef.current = requestAnimationFrame(step);
    },
    [cancelAnimation, commitAngle],
  );

  /**
   * Coming to rest without having chosen anything: a hand laid on a moving pot
   * stops it, and a stopped pot still has to sit on a panel. It takes the one
   * it is nearest and counts as nothing.
   */
  const settle = useCallback(() => {
    const target = nearestStop(angleRef.current, stops);
    land(target, shortestDelta(angleRef.current, target.angle));
    // `stops` changes only when the week does; the 3D viewer is memoised on
    // props that do not come from here, so re-creating these callbacks is free.
  }, [land, stops]);

  /**
   * A spin that counted. The story is settled on first and the vessel is then
   * turned to it, which is the whole of the change: thrown hard it keeps the
   * direction of the throw and adds whole turns until it arrives, released
   * gently it takes the short way round rather than labouring most of a
   * revolution to get somewhere it was nearly at.
   */
  const spin = useCallback(() => {
    if (stops.length === 0) {
      setIsSpinning(false);
      return;
    }

    const speed = velocityRef.current;
    const direction: 1 | -1 = (speed !== 0 ? speed : turnedRef.current) < 0 ? -1 : 1;
    const natural = glideDistance(Math.abs(speed));
    const landing = normalizeAngle(angleRef.current + direction * natural);

    const target = chooseRef.current
      ? chooseRef.current(landing, stops)
      : nearestStop(landing, stops);

    const thrown = Math.abs(speed) >= spinVelocityMin(configRef.current);
    const travel = thrown
      ? travelTo(angleRef.current, target.angle, direction, natural)
      : shortestDelta(angleRef.current, target.angle);

    land(target, travel, () => settledRef.current?.(target.key));
  }, [land, stops]);

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
      travelRef.current = 0;
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

      const config = configRef.current;
      const deltaX = event.clientX - pointerXRef.current;
      const elapsed = now - timeRef.current;
      const deltaAngle = deltaX * config.dragSensitivity;

      commitAngle(angleRef.current + deltaAngle);

      turnedRef.current += deltaAngle;
      travelRef.current += deltaX;

      if (
        !committedRef.current &&
        dragPositions(travelRef.current, config) >= MIN_DRAG_POSITIONS
      ) {
        committedRef.current = true;
        setStory(null);
      }

      if (elapsed > 0) {
        const instant = deltaAngle / elapsed;
        velocityRef.current = clampVelocity(
          instant * VELOCITY_SMOOTHING +
            velocityRef.current * (1 - VELOCITY_SMOOTHING),
          maxVelocity(config),
        );
      }

      pointerXRef.current = event.clientX;
      timeRef.current = now;
    },
    [commitAngle],
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
      spin();
    },
    [returnToStart, settle, spin],
  );

  const turn = useCallback(
    (direction: 1 | -1) => {
      cancelAnimation();

      holdingRef.current = false;
      engagedRef.current = false;
      committedRef.current = false;
      interruptedRef.current = false;
      turnedRef.current = 0;
      travelRef.current = 0;
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

  /**
   * The gearing follows the viewport. Written to a ref rather than to state:
   * nothing renders from it, so a phone rotating mid-flight — or a desktop
   * window being dragged wider — changes what the next pointer move is worth
   * without disturbing the angle the vessel is at or the story it settled on.
   */
  useEffect(() => {
    const sync = () => {
      configRef.current = getAmphoraInteractionConfig(window.innerWidth);
    };

    sync();

    // Both, because iOS has historically fired orientationchange before
    // innerWidth caught up, and re-reading twice costs nothing.
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);

    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, []);

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
