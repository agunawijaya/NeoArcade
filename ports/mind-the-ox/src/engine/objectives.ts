import { TICKS_PER_MOVE } from './constants';
import type { GameEvent } from './events';
import type { Side } from './map';
import type { Plane, World } from './world';

/**
 * What a mission asks for. A round with objectives is won when every one
 * of them is met (1984's battles have none: they are won on targets), and
 * lost when one can no longer be:
 *
 * - `targets`: every enemy target destroyed and every enemy ship sunk.
 * - `shore`: every enemy target ashore destroyed; their ships may sail on.
 * - `ships`: every enemy ship sunk (or got away).
 * - `boats`: every enemy torpedo boat sunk; the rest of their fleet may sail on.
 * - `planes`: every enemy plane out of the fight.
 * - `raiders`: every raid sent, and none of its bombers or airships left in the sky.
 * - `escort`: the convoy home: every ship of it in or lost, at least half of it in.
 * - `gates`: every gate flown through, in order.
 * - `touch-and-go`: down on the deck and off again at full throttle, once.
 * - `land-aboard`: back on the deck (or the home runway) once the rest are done.
 */
export type Objective =
  | 'targets'
  | 'shore'
  | 'ships'
  | 'boats'
  | 'planes'
  | 'raiders'
  | 'escort'
  | 'gates'
  | 'touch-and-go'
  | 'land-aboard';

/** A side's targets still standing, and its ships still afloat and within reach. */
export function targetsLeft(world: World, side: Side): number {
  const standing = world.targets.filter((target) => target.side === side && target.standing);
  const afloat = world.ships.filter(
    (ship) => ship.side === side && ship.state === 'afloat' && !ship.escaped,
  );
  return standing.length + afloat.length;
}

/** Out of planes, or flying on as a ghost: either way, done for this round. */
export function isBeaten(planes: readonly Plane[]): boolean {
  return planes.length > 0 && planes.every((plane) => plane.state === 'out' || plane.ghost);
}

/**
 * Counts the gates flown through: the next one is passed when a human
 * plane crosses its line between its two heights.
 */
export function passGates(world: World) {
  const gate = world.map.gates[world.gatesPassed];
  if (!gate) return;
  for (const plane of world.planes) {
    if (plane.pilot.kind !== 'human' || plane.side !== 0 || plane.state !== 'flying') continue;
    const before = plane.x - plane.vx;
    const crossed = (before - gate.x) * (plane.x - gate.x) <= 0 && before !== plane.x;
    if (!crossed || plane.y < gate.bottom || plane.y > gate.top) continue;
    world.events.push({
      type: 'gate',
      plane: plane.id,
      index: world.gatesPassed,
      x: gate.x,
      y: plane.y,
    });
    world.gatesPassed += 1;
    return;
  }
}

function isMet(world: World, objective: Exclude<Objective, 'land-aboard'>): boolean {
  switch (objective) {
    case 'targets':
      return targetsLeft(world, 1) === 0;
    case 'shore':
      return !world.targets.some((target) => target.side === 1 && target.standing);
    case 'ships':
      return !world.ships.some(
        (ship) => ship.side === 1 && ship.state === 'afloat' && !ship.escaped,
      );
    case 'boats':
      return !world.ships.some(
        (ship) =>
          ship.side === 1 &&
          ship.kind === 'torpedo-boat' &&
          ship.state === 'afloat' &&
          !ship.escaped,
      );
    case 'planes':
      return isBeaten(world.planes.filter((plane) => plane.side === 1));
    case 'raiders': {
      const lastRaid = Math.max(-1, ...world.map.raids.map((raid) => raid.at));
      return world.tick / TICKS_PER_MOVE > lastRaid && world.raiders.length === 0;
    }
    case 'escort': {
      const { arrived, lost, total } = convoyCount(world);
      return arrived + lost === total && arrived * 2 >= total;
    }
    case 'gates':
      return world.gatesPassed >= world.map.gates.length;
    case 'touch-and-go':
      return world.touchAndGoes > 0;
  }
}

/** How the convoy we escort is getting on: in, lost, and how many there were. */
export function convoyCount(world: World): { arrived: number; lost: number; total: number } {
  const convoy = world.ships.filter((ship) => ship.side === 0 && ship.convoy);
  return {
    arrived: convoy.filter((ship) => ship.escaped).length,
    lost: convoy.filter((ship) => ship.state !== 'afloat').length,
    total: convoy.length,
  };
}

/** A mission that can no longer be won: more than half the convoy we escort is lost. */
export function objectivesFailed(world: World, objectives: readonly Objective[]): boolean {
  if (!objectives.includes('escort')) return false;
  const { lost, total } = convoyCount(world);
  return (total - lost) * 2 < total;
}

/** A person's plane touched down at home this tick: on its carrier's wires or its own runway. */
function landedAboard(world: World, events: readonly GameEvent[]): boolean {
  return events.some((event) => {
    if (event.type !== 'landed') return false;
    const plane = world.planes.find((candidate) => candidate.id === event.plane);
    return plane?.pilot.kind === 'human' && plane.side === 0;
  });
}

/**
 * Whether a round's objectives are all met this tick. A landing aboard
 * only counts once everything else is done, so a pilot who comes in to
 * rearm halfway through is not sent home early.
 */
export function objectivesMet(world: World, objectives: readonly Objective[]): boolean {
  const rest = objectives.filter((objective) => objective !== 'land-aboard');
  if (!rest.every((objective) => isMet(world, objective))) return false;
  return !objectives.includes('land-aboard') || landedAboard(world, world.events);
}
