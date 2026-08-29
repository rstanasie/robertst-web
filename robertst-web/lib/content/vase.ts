import type { WeekEntry } from "./types";

/**
 * Where the amphora's painted figures sit, in degrees of rotation.
 *
 * This is the one place the vessel's capacity is declared. The texture generator
 * paints one figure per entry and `npm run amphora:verify` asserts the painted
 * frieze and these angles agree.
 *
 * The offsets are not arbitrary. The two handles sit at u = 0.25 and u = 0.75 —
 * fixed by the lathe axis, exactly half a turn apart. These five angles put the
 * figures at u = 0.4, 0.2, 0.0, 0.8, 0.6, which is the best available spacing:
 * every figure clears a handle root by 18 degrees. No five-figure arrangement
 * does better, because half a turn is two and a half slots, so a handle cannot
 * fall between figures on both sides at once.
 */
export const VASE_SLOT_ANGLES = [36, 108, 180, 252, 324] as const;

export const VASE_SLOTS = VASE_SLOT_ANGLES.length;

/** Stories in an active week. Free readers get 3 previews and 2 locked. */
export const STORIES_PER_WEEK = 5;
export const PREVIEW_STORIES_PER_WEEK = 3;

export function angleForSlot(slot: number): number {
  const angle = VASE_SLOT_ANGLES[slot];
  if (angle === undefined) {
    throw new Error(`vase slot ${slot} does not exist (${VASE_SLOTS} slots)`);
  }
  return angle;
}

export const onVase = (entry: WeekEntry): boolean => entry.vaseSlot !== null;
