/**
 * Points in the runs (Endless, Road Trip, Daily Road). The duels keep the
 * original's score: one point to the Donkey for a crash, one to the Driver
 * for reaching the top.
 */
export type NearMissTier = 1 | 2 | 3;

export interface NearMissTierInfo {
  tier: NearMissTier;
  name: string;
  /** Left the donkey's lane at most this many seconds before it would have hit. */
  within: number;
  points: number;
}

/** Tightest first. */
export const NEAR_MISS_TIERS: readonly NearMissTierInfo[] = [
  { tier: 3, name: 'Hee-haw-some!', within: 0.1, points: 200 },
  { tier: 2, name: 'Whisker!', within: 0.2, points: 100 },
  { tier: 1, name: 'Close shave!', within: 0.32, points: 50 },
];

export const CARROT_POINTS = 30;
export const RHYTHM_POINTS = 15;
/** A switch counts as on the beat within this many seconds of one. */
export const RHYTHM_WINDOW = 0.075;

/** How close a dodge was, from how long before the hit the car left the lane. */
export function nearMissTier(secondsToSpare: number): NearMissTierInfo | null {
  if (secondsToSpare < 0) return null;
  return NEAR_MISS_TIERS.find((tier) => secondsToSpare <= tier.within) ?? null;
}

/**
 * The combo multiplier after `streak` near misses in a row: ×1 for the
 * first, ×2 from the second, then one more every two, up to ×5.
 */
export function comboMultiplier(streak: number): number {
  if (streak <= 1) return 1;
  return Math.min(5, 2 + Math.floor((streak - 2) / 2));
}

/** Seconds from `time` to the nearest beat, for a beat of `beatSeconds`. */
export function offBeat(time: number, beatSeconds: number): number {
  const phase = time - Math.floor(time / beatSeconds) * beatSeconds;
  return Math.min(phase, beatSeconds - phase);
}
