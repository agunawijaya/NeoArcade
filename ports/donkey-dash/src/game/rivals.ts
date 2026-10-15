import type { CpuLevel } from '../engine/rival-cpu';
import { lookOf, type Loadout, type Look } from '../garage';

/**
 * Who you race in Rival Driver. Each CPU level is a character with a car
 * of their own, so you can tell at a glance who is boxing you in.
 */
export interface CpuRival {
  name: string;
  /** One line about how they drive, for the menus. */
  line: string;
  look: Look;
}

const car = (body: string, paint: string, horn: string): Look =>
  lookOf({ body, paint, horn, trail: 'trail-dust', hat: 'hat-straw' });

export const CPU_RIVALS: Record<CpuLevel, CpuRival> = {
  easy: {
    name: 'Dotty Dawdle',
    line: 'Waves at every donkey and never blocks anyone.',
    look: car('body-beetle', 'paint-mint', 'horn-bell'),
  },
  normal: {
    name: 'Rusty Rowe',
    line: 'A farmhand in a borrowed pickup. Sometimes will not move over.',
    look: car('body-pickup', 'paint-butter', 'horn-toot'),
  },
  hard: {
    name: 'Vera Vroom',
    line: 'Reads the road ahead and parks in the lane you need.',
    look: car('body-roadster', 'paint-cherry', 'horn-air'),
  },
  brutal: {
    name: 'The Baron',
    line: 'Sets traps, slips yours, and only now and then sneezes.',
    look: car('body-camper', 'paint-midnight', 'horn-hee-haw'),
  },
};

/** The friend's car in Rival Driver: yours, in a paint that tells the two apart. */
export function friendLook(loadout: Loadout): Look {
  const paint = loadout.paint === 'paint-sky' ? 'paint-sunset' : 'paint-sky';
  return lookOf({ ...loadout, paint });
}
