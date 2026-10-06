"use client";

import { emptySpinMemory } from "./rules";
import type { SpinMemory } from "./rules";

/**
 * The spin history, kept for the length of a tab.
 *
 * sessionStorage rather than localStorage on purpose: the protections exist so
 * one sitting with the vessel is not frustrating, and a reader who comes back
 * tomorrow should meet it fresh rather than halfway through a streak they have
 * long forgotten.
 *
 * Every read is defensive. Storage can be absent (server render), refused
 * (private mode, blocked site data), or hold something from an older version
 * of this file — and none of those is a reason for the homepage to fail. The
 * fallback is always an empty memory, which simply means the next spin is
 * treated as the first.
 */

const KEY = "amphora.spin.v1";

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

/**
 * Field by field rather than by cast. A stored object that is almost the right
 * shape is the dangerous case — it type-checks at the boundary and then throws
 * somewhere far away — so anything unrecognised is discarded whole.
 */
function parse(raw: string): SpinMemory | null {
  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof value !== "object" || value === null) {
    return null;
  }

  const stored = value as Record<string, unknown>;

  if (
    !isStringArray(stored.recent) ||
    !isCount(stored.blocked) ||
    !isCount(stored.spins) ||
    typeof stored.foundReadable !== "boolean" ||
    !isStringArray(stored.opened) ||
    !(stored.lastReadable === null || typeof stored.lastReadable === "string")
  ) {
    return null;
  }

  return {
    recent: stored.recent,
    blocked: stored.blocked,
    spins: stored.spins,
    foundReadable: stored.foundReadable,
    opened: stored.opened,
    lastReadable: stored.lastReadable,
  };
}

function load(): SpinMemory {
  if (typeof window === "undefined") {
    return emptySpinMemory();
  }

  try {
    const raw = window.sessionStorage.getItem(KEY);
    return (raw && parse(raw)) || emptySpinMemory();
  } catch {
    return emptySpinMemory();
  }
}

function save(memory: SpinMemory): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    // Full, or refused. The session simply loses its protections, which is a
    // worse spin and not a broken page.
  }
}

/** Exported for the tests, which need to drive `parse` without a browser. */
export const parseSpinMemory = parse;

/* ── As an external store ────────────────────────────────────────────────────
   sessionStorage is exactly what `useSyncExternalStore` is for: a thing
   outside React that the render has to agree with. Going through it rather
   than restoring into state inside an effect matters for one specific reason —
   the server has no storage, so the first client render has to match the empty
   snapshot the server was given and only then settle to what was stored. React
   does that itself when it is given both snapshots; doing it by hand means a
   hydration mismatch or a cascading render, depending on which hand.
   ─────────────────────────────────────────────────────────────────────────── */

/** Stable identity, so a render that changes nothing re-renders nothing. */
let cached: SpinMemory | null = null;
const SERVER_MEMORY = emptySpinMemory();
const listeners = new Set<() => void>();

export function spinMemory(): SpinMemory {
  cached ??= load();
  return cached;
}

/** What the server renders, and what hydration starts from. */
export const serverSpinMemory = (): SpinMemory => SERVER_MEMORY;

export function subscribeSpinMemory(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function writeSpinMemory(next: SpinMemory): void {
  cached = next;
  save(next);

  for (const listener of listeners) {
    listener();
  }
}

/** Exported for the tests, which drive the store without a browser. */
export const resetSpinMemoryCache = () => {
  cached = null;
};
