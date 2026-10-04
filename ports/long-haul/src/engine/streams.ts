import { createRng, type Rng } from '@shared/rng';

/**
 * Every random draw on a trip comes from a stream named after the moment it
 * belongs to: the third hour on the road, the scale at Gallup, the second
 * truck stop. Two drivers on the same seed meet the same luck at the same
 * moment whatever they did before it, which keeps a Daily Haul fair, and a
 * trip replays exactly from its seed and its choices.
 */
export type Moment = 'hour' | 'look' | 'weather' | 'place' | 'stop' | 'arrival' | 'board';

export function streamFor(seed: number, moment: Moment, key: number | string): Rng {
  return createRng(`${seed >>> 0}:${moment}:${key}`);
}
