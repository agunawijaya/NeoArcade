import type { Rng } from '@shared/rng';

export type WorldId = 'earth' | 'moon' | 'mars' | 'jupiter';
export type WorldChoice = WorldId | 'random';

export interface World {
  id: WorldId;
  name: string;
  /** Metres per second squared, used directly as the original did. */
  gravity: number;
  /**
   * How much of the rolled wind this world's air carries. The Moon has no
   * air at all; Mars's thin air keeps wind about as strong relative to its
   * gravity as Earth's; Jupiter's storms blow harder. Without this, a stiff
   * breeze in lunar gravity makes many cities impossible to win.
   */
  windScale: number;
  /** The face in the sky above this world's city. */
  skyBody: string;
}

export const WORLDS: Record<WorldId, World> = {
  earth: { id: 'earth', name: 'Earth', gravity: 9.8, windScale: 1, skyBody: 'the Sun' },
  moon: { id: 'moon', name: 'Moon', gravity: 1.62, windScale: 0, skyBody: 'Earth' },
  mars: { id: 'mars', name: 'Mars', gravity: 3.71, windScale: 0.4, skyBody: 'Phobos' },
  jupiter: { id: 'jupiter', name: 'Jupiter', gravity: 24.79, windScale: 1.5, skyBody: 'Io' },
};

export const WORLD_IDS = Object.keys(WORLDS) as WorldId[];

export function chooseWorld(choice: WorldChoice, rng: Rng): World {
  return WORLDS[choice === 'random' ? rng.pick(WORLD_IDS) : choice];
}

/** The rolled wind as it blows on this world, in whole units like the original. */
export function windOn(world: World, rolledWind: number): number {
  return Math.round(rolledWind * world.windScale) + 0;
}
