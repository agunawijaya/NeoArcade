import { CLIMB_STEP, SIGHT_DISTANCE } from './constants';

/**
 * How far ahead of the car's nose a hazard comes into view.
 *
 * In the duel modes the car climbs the road as it dodges, like the original's
 * car creeping up the screen, while the line where donkeys appear stays put.
 * Each climb therefore takes a little of the reaction window away: in Classic
 * Duel it shrinks from 0.67 s on the first donkey to 0.30 s on the eleventh,
 * exactly as it did in 1981. Runs never climb.
 */
export function revealGap(climb = 0): number {
  return SIGHT_DISTANCE - climb * CLIMB_STEP;
}

/** Seconds between a hazard coming into view and reaching the car's nose. */
export function reactionWindow(speed: number, climb = 0): number {
  return revealGap(climb) / speed;
}
