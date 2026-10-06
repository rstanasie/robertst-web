/**
 * Which story the vessel lands on.
 *
 * The outcome used to be whatever the physics produced: the pot coasted, and
 * the panel nearest the eye when it stopped was the story. That is honest and
 * it is also unkind — a reader can turn it four times and be shown the same
 * sealed myth twice, with nothing to read at the end of it. The vessel exists
 * to hand out stories, so the outcome is chosen and the pot is then turned to
 * it, rather than the other way round.
 *
 * It is still a spin, not a menu. Every panel stays reachable, the weighting
 * is gentle, and the rules below only ever *remove* outcomes that would waste
 * the gesture:
 *
 *   repeatLimit     a story that has just come up twice running steps aside
 *   blockedLimit    two sealed results in a row and the next one can be read
 *   guaranteeWithin something readable arrives inside the first three spins
 *   freshWeight     a story not yet opened is likelier than one already read
 *
 * Nothing here knows about angles, animation or the DOM, and nothing here can
 * widen access: `readable` is handed in, decided by the same rules that decide
 * what the page will actually serve.
 */

export const SPIN_RULES = {
  /** Consecutive appearances after which a story steps aside for one spin. */
  repeatLimit: 2,
  /** Consecutive unreadable results after which the next one must be readable. */
  blockedLimit: 2,
  /** A readable story must be offered within this many completed spins. */
  guaranteeWithin: 3,
  /** How much likelier an unopened story is than one already opened. */
  freshWeight: 2,
  /** How much history is worth keeping; only the tail is ever read. */
  recentKept: 8,
} as const;

export type SpinCandidate = {
  key: string;
  /** Whether this viewer can read it at all — a free preview counts. */
  readable: boolean;
};

export type SpinMemory = {
  /** Keys of completed spins, newest last. */
  recent: string[];
  /** Consecutive completed spins that landed on something unreadable. */
  blocked: number;
  /** Completed spins this session. */
  spins: number;
  /** Whether any completed spin has yet landed on something readable. */
  foundReadable: boolean;
  /** Stories the reader has opened. Separate from what the vessel offered. */
  opened: string[];
  /** The last readable story offered, kept reachable without spinning again. */
  lastReadable: string | null;
};

export const emptySpinMemory = (): SpinMemory => ({
  recent: [],
  blocked: 0,
  spins: 0,
  foundReadable: false,
  opened: [],
  lastReadable: null,
});

/** The story occupying the whole tail of the history, if one does. */
function repeating(recent: readonly string[]): string | null {
  const tail = recent.slice(-SPIN_RULES.repeatLimit);

  if (tail.length < SPIN_RULES.repeatLimit) {
    return null;
  }

  return tail.every((key) => key === tail[0]) ? tail[0] : null;
}

/**
 * Whether this spin has to produce something readable: either the reader has
 * just had two sealed results, or this is the last spin inside the guarantee
 * and nothing readable has come up yet.
 */
function owedAReadable(memory: SpinMemory): boolean {
  if (memory.blocked >= SPIN_RULES.blockedLimit) {
    return true;
  }

  return !memory.foundReadable && memory.spins + 1 >= SPIN_RULES.guaranteeWithin;
}

function weigh(candidate: SpinCandidate, memory: SpinMemory): number {
  return memory.opened.includes(candidate.key) ? 1 : SPIN_RULES.freshWeight;
}

/**
 * One draw from a weighted pool. `random` returns [0, 1) and is injected so a
 * test can say exactly which outcome it wants; there is no retry loop, so a
 * pathological source cannot make this spin.
 */
function draw(
  pool: readonly SpinCandidate[],
  memory: SpinMemory,
  random: () => number,
): SpinCandidate {
  const total = pool.reduce((sum, candidate) => sum + weigh(candidate, memory), 0);
  let ticket = Math.min(Math.max(random(), 0), 0.999999) * total;

  for (const candidate of pool) {
    ticket -= weigh(candidate, memory);
    if (ticket < 0) {
      return candidate;
    }
  }

  // Unreachable while every weight is positive; still better than undefined.
  return pool[pool.length - 1];
}

/**
 * The story this spin should land on, or null when the vessel is empty.
 *
 * The order of the two filters is the policy: readability first, so a reader
 * owed something readable gets it even if that means repeating the story they
 * just saw — a repeat is a disappointment, a third sealed panel is a dead end.
 */
export function chooseStory(
  candidates: readonly SpinCandidate[],
  memory: SpinMemory,
  random: () => number,
): string | null {
  if (candidates.length === 0) {
    return null;
  }

  let pool = candidates;

  if (owedAReadable(memory)) {
    const readable = pool.filter((candidate) => candidate.readable);
    if (readable.length > 0) {
      pool = readable;
    }
  }

  const repeated = repeating(memory.recent);

  if (repeated !== null) {
    const others = pool.filter((candidate) => candidate.key !== repeated);
    if (others.length > 0) {
      pool = others;
    }
  }

  return draw(pool, memory, random).key;
}

/**
 * Records a spin that actually finished. Called when the vessel has come to
 * rest on the story, not when the story was chosen: a gesture whose animation
 * is interrupted by a hand never reaches here, and so never moves a counter.
 */
export function rememberSpin(
  memory: SpinMemory,
  key: string,
  candidates: readonly SpinCandidate[],
): SpinMemory {
  const readable = candidates.some(
    (candidate) => candidate.key === key && candidate.readable,
  );

  return {
    recent: [...memory.recent, key].slice(-SPIN_RULES.recentKept),
    blocked: readable ? 0 : memory.blocked + 1,
    spins: memory.spins + 1,
    foundReadable: memory.foundReadable || readable,
    opened: memory.opened,
    lastReadable: readable ? key : memory.lastReadable,
  };
}

/** Records the reader opening a story, which is not the same as being shown one. */
export function rememberOpened(memory: SpinMemory, key: string): SpinMemory {
  if (memory.opened.includes(key)) {
    return memory;
  }

  return { ...memory, opened: [...memory.opened, key] };
}
