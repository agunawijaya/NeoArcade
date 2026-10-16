import { TICKS_PER_MOVE } from './constants';
import { SHIP_CLASSES } from './fleet';
import { inFog } from './map';
import { hullFacing } from './ships';
import { UP, headingDelta, headingOf } from './trig';
import type { Plane, World } from './world';

/** A searchlight beam: where it stands and which way it points. */
export interface Beam {
  x: number;
  y: number;
  heading: number;
}

/** How far a beam reaches, and its half-width, about five and a half degrees. */
export const BEAM_REACH = 300;
export const BEAM_HALF_ANGLE = 64;
/** A beam sweeps from one side to the other and back in this many moves. */
const SWEEP_MOVES = 96;
/** How far from straight up a beam swings, about fifty degrees. */
const SWEEP_ARC = 570;
/** In the dark, anything this close is seen anyway. */
const NIGHT_SIGHT = 60;

/**
 * Every enemy airfield's searchlight this tick, and every enemy
 * warship's. The sweep is a pure function of the clock, so the views draw
 * the beams the engine uses.
 */
export function searchlightBeams(world: World): Beam[] {
  const beams: Beam[] = world.map.bases
    .filter((base) => base.side === 1)
    .map((base, index) => {
      const x = base.x - base.facing * 20;
      return { x, y: world.terrain.heightAt(x) + 3, heading: sweep(world, index) };
    });
  for (const ship of world.ships) {
    const lamp = SHIP_CLASSES[ship.kind].searchlight;
    if (!lamp || ship.side !== 1 || ship.state !== 'afloat' || ship.escaped) continue;
    beams.push({
      x: ship.x + lamp.along * ship.direction * hullFacing(ship),
      y: ship.y + lamp.height,
      heading: sweep(world, beams.length + ship.index * 5),
    });
  }
  return beams;
}

/** Where a beam points this tick, each light a little out of step with the others. */
function sweep(world: World, index: number): number {
  const phase = ((world.tick / TICKS_PER_MOVE + index * 31) % SWEEP_MOVES) / SWEEP_MOVES;
  const across = 1 - 4 * Math.abs(phase - 0.5);
  // Eased at the ends of the swing, the way a gunner hauls a heavy lamp round.
  const eased = across * (1.5 - 0.5 * across * across);
  return UP + eased * SWEEP_ARC;
}

export function isLit(world: World, x: number, y: number): boolean {
  return searchlightBeams(world).some((beam) => {
    const dx = x - beam.x;
    const dy = y - beam.y;
    if (dy <= 0 || dx * dx + dy * dy > BEAM_REACH * BEAM_REACH) return false;
    return Math.abs(headingDelta(beam.heading, headingOf(dx, dy))) <= BEAM_HALF_ANGLE;
  });
}

/**
 * Whether someone at (fromX, fromY) can see a plane: never inside a fog
 * bank, and on a night raid only in a beam or close by.
 */
export function isSpotted(world: World, plane: Plane, fromX: number, fromY: number): boolean {
  if (inFog(world.map, plane.x, plane.y)) return false;
  if (!world.rules.searchlights) return true;
  const dx = plane.x - fromX;
  const dy = plane.y - fromY;
  if (dx * dx + dy * dy < NIGHT_SIGHT * NIGHT_SIGHT) return true;
  return isLit(world, plane.x, plane.y);
}
