import { uprightness } from './geometry';
import { headingDelta, headingOf } from './trig';
import type { Plane } from './world';

/**
 * The stick input that turns the nose towards a heading: "pull" turns
 * towards the pilot's head, so which way that is depends on whether the
 * plane is rolled over. Within `deadband` of the heading the stick is left
 * alone.
 */
export function pitchToward(plane: Plane, heading: number, deadband = 24): number {
  const turn = headingDelta(plane.heading, heading);
  if (Math.abs(turn) <= deadband) return 0;
  const counterClockwise = turn > 0 ? 1 : -1;
  return plane.inverted ? -counterClockwise : counterClockwise;
}

export function pitchTowardPoint(plane: Plane, x: number, y: number, deadband?: number): number {
  return pitchToward(plane, headingOf(x - plane.x, y - plane.y), deadband);
}

/** Whether a pilot not otherwise busy should roll the right way up. */
export function wantsToRollUpright(plane: Plane): boolean {
  return uprightness(plane.heading, plane.inverted) < -0.25;
}
