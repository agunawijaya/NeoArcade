import type { Rng } from '@shared/rng';

/**
 * Wind for one round, exactly as the original rolled it: a base of −4…+5
 * (`FnRan(10) - 5`), and one round in three a gust of another 1–10 in the
 * same direction. A calm base counts as "not positive", so its gust always
 * blows left. Positive wind pushes bananas to the right.
 */
export function rollWind(rng: Rng): number {
  let wind = rng.int(1, 10) - 5;
  if (rng.int(1, 3) === 1) {
    wind += wind > 0 ? rng.int(1, 10) : -rng.int(1, 10);
  }
  return wind;
}

/** Horizontal acceleration the wind gives a banana, per unit of simulation time squared. */
export function windAcceleration(wind: number): number {
  return wind / 5;
}
