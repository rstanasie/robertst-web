"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import { myths, MythStory } from "@/data/myths";
import {
  applyFriction,
  clampVelocity,
  DRAG_SENSITIVITY,
  easeOutCubic,
  FLICK_VELOCITY_MAX,
  FLICK_VELOCITY_MIN,
  MIN_VELOCITY,
  nearestStory,
  normalizeAngle,
  prefersReducedMotion,
  shortestDelta,
  SNAP_DURATION,
} from "@/lib/amphora";

const MAX_STEP_MS = 64;
const VELOCITY_SMOOTHING = 0.7;

export type AmphoraRotation = {
  angle: number;
  isDragging: boolean;
  isSpinning: boolean;
  story: MythStory | null;
  spin: () => void;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
};

export function useAmphoraRotation(): AmphoraRotation {
  const [angle, setAngle] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [story, setStory] = useState<MythStory | null>(null);

  const angleRef = useRef(0);
  const velocityRef = useRef(0);
  const pointerXRef = useRef(0);
  const timeRef = useRef(0);
  const draggingRef = useRef(false);
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

  const settle = useCallback(() => {
    const target = nearestStory(angleRef.current);
    const from = angleRef.current;
    const delta = shortestDelta(from, myths[target].angle);

    const finish = () => {
      commitAngle(myths[target].angle);
      setStory(target);
      setIsSpinning(false);
    };

    if (prefersReducedMotion() || Math.abs(delta) < 0.5) {
      finish();
      return;
    }

    const start = performance.now();

    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / SNAP_DURATION);
      commitAngle(from + delta * easeOutCubic(progress));

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(step);
        return;
      }

      frameRef.current = null;
      finish();
    };

    frameRef.current = requestAnimationFrame(step);
  }, [commitAngle]);

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
      cancelAnimation();

      draggingRef.current = true;
      velocityRef.current = 0;
      pointerXRef.current = event.clientX;
      timeRef.current = performance.now();

      setIsDragging(true);
      setIsSpinning(false);
      setStory(null);

      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [cancelAnimation],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!draggingRef.current) {
        return;
      }

      const now = performance.now();
      const deltaX = event.clientX - pointerXRef.current;
      const elapsed = now - timeRef.current;
      const deltaAngle = deltaX * DRAG_SENSITIVITY;

      commitAngle(angleRef.current + deltaAngle);

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
    [commitAngle],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!draggingRef.current) {
        return;
      }

      draggingRef.current = false;
      setIsDragging(false);

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      setIsSpinning(true);
      glide();
    },
    [glide],
  );

  const spin = useCallback(() => {
    cancelAnimation();

    draggingRef.current = false;
    setIsDragging(false);
    setStory(null);
    setIsSpinning(true);

    const direction = Math.random() < 0.5 ? -1 : 1;

    if (prefersReducedMotion()) {
      velocityRef.current = 0;
      commitAngle(angleRef.current + direction * (90 + Math.random() * 270));
      settle();
      return;
    }

    velocityRef.current =
      direction *
      (FLICK_VELOCITY_MIN +
        Math.random() * (FLICK_VELOCITY_MAX - FLICK_VELOCITY_MIN));

    glide();
  }, [cancelAnimation, commitAngle, glide, settle]);

  useEffect(() => cancelAnimation, [cancelAnimation]);

  return {
    angle,
    isDragging,
    isSpinning,
    story,
    spin,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  };
}
