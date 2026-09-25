/**
 * Seeded pseudo-random numbers (mulberry32). Engines take one of these instead
 * of Math.random so that a seed reproduces a whole match, which is what makes
 * them testable and lets a game replay a moment exactly.
 */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Float in [min, max). */
  float(min: number, max: number): number;
  /** Integer in [min, max], both ends included. */
  int(min: number, max: number): number;
  /** True with the given probability. */
  chance(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** An independent generator that continues from this one's current state. */
  clone(): Rng;
  readonly state: number;
}

export function createRng(seed: number | string): Rng {
  return fromState(typeof seed === 'string' ? hashString(seed) : seed >>> 0);
}

/** A fresh seed for when the player did not ask for a specific one. */
export function randomSeed(): number {
  return (Math.random() * 4294967296) >>> 0;
}

function fromState(initialState: number): Rng {
  let state = initialState >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    float: (min, max) => min + next() * (max - min),
    int: (min, max) => {
      const low = Math.ceil(Math.min(min, max));
      const high = Math.floor(Math.max(min, max));
      return low + Math.floor(next() * (high - low + 1));
    },
    chance: (probability) => next() < probability,
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) throw new RangeError('Cannot pick from an empty list.');
      return items[Math.floor(next() * items.length)] as T;
    },
    clone: () => fromState(state),
    get state() {
      return state;
    },
  };
}

// FNV-1a, so a readable seed like "sunset-duel" maps to a stable number.
function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
