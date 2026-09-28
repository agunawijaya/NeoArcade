import type { Rng } from '@shared/rng';
import { WORLD_WIDTH } from './constants';
import type { Circle, Rect } from './geometry';
import type { Gorilla } from './gorillas';
import { raiseBuilding, type Building, type Skyline } from './skyline';
import type { World } from './worlds';

/**
 * Stage twists: the World Tour's variations on a city. Each is data the
 * engine interprets, so a stage is just a list of them, and every one is
 * seeded and deterministic like the rest of a match.
 *
 * - gusts: the wind shifts after every throw, by a few notches either way.
 * - drone: a billboard drone patrols a rail mid-air and stops bananas.
 * - supertall: one tower in the middle rises far above the rest.
 * - jetStream: a band high in the sky blows with a wind of its own.
 * - hiddenWind: nobody is told the wind (the HUD hides it; the CPU guesses).
 * - hillside: the city climbs a steep hill, so the gorillas stand far apart in height.
 * - bouncy: springy ground; every banana bounces once off the first building it hits.
 * - dustDevil: a whirling column shoves bananas sideways, and wanders between throws.
 * - lightning: a rooftop is marked one throw ahead, then struck between throws.
 */
export type TwistKind =
  | 'gusts'
  | 'drone'
  | 'supertall'
  | 'jetStream'
  | 'hiddenWind'
  | 'hillside'
  | 'bouncy'
  | 'dustDevil'
  | 'lightning';

export const TWIST_KINDS: readonly TwistKind[] = [
  'gusts',
  'drone',
  'supertall',
  'jetStream',
  'hiddenWind',
  'hillside',
  'bouncy',
  'dustDevil',
  'lightning',
];

/** A drone sliding back and forth along a rail, only while a banana is in the air. */
export interface Drone {
  from: number;
  to: number;
  /** Height of the rail (the drone's middle). */
  y: number;
  width: number;
  height: number;
  /** Where along its back-and-forth the drone is: 0 at `from`, 1 at `to`, 2 back at `from`. */
  phase: number;
  /** Phase gained per simulation step. */
  speed: number;
}

/** A band of sky with its own wind, which replaces the ground wind inside it. */
export interface WindBand {
  top: number;
  bottom: number;
  wind: number;
}

/** A column from the street up to `top` that adds a sideways push to anything inside. */
export interface DustDevil {
  x: number;
  width: number;
  top: number;
  /** Horizontal acceleration added inside, in the same units as wind / 5. */
  push: number;
}

/** What the air and the ground do to a banana in flight. */
export interface Hazards {
  drone: Drone | null;
  jetStream: WindBand | null;
  dustDevil: DustDevil | null;
  /** Every banana bounces once off the first building it hits. */
  bouncy: boolean;
}

export const NO_HAZARDS: Hazards = {
  drone: null,
  jetStream: null,
  dustDevil: null,
  bouncy: false,
};

const DRONE = { width: 26, height: 11, speed: 1 / 140, clearance: 45 };
const DRONE_HEIGHTS: readonly [number, number] = [105, 150];
/** The drone patrols at least this far above every roof under its rail, and never higher than this. */
const DRONE_ROOF_GAP = 16;
const DRONE_CEILING = 48;
const JET_STREAM = { top: 28, depth: 44, strength: [11, 15] as const };
const DUST_DEVIL = { width: 34, top: 70, push: [2.6, 3.4] as const, wander: 36 };
const SUPERTALL_TOP = 48;
/** A lightning strike leaves this deep a bowl in the roof it hits. */
export const LIGHTNING_RADIUS = 18;

/**
 * Everything a twist decides when a round begins. The drone's rail and the
 * dust devil stay in the open air between the two gorillas, never on top of
 * one, and the drone flies clear of the roofs beneath it.
 */
export function hazardsFor(
  twists: readonly TwistKind[],
  world: World,
  gorillas: readonly [Gorilla, Gorilla],
  buildings: readonly Building[],
  rng: Rng,
): Hazards {
  const has = (kind: TwistKind) => twists.includes(kind);
  const strength = (range: readonly [number, number]) =>
    rng.float(range[0], range[1]) * (rng.chance(0.5) ? 1 : -1);
  const [left, right] = gorillas[0].x < gorillas[1].x ? gorillas : [gorillas[1], gorillas[0]];
  const openFrom = left.x + 30 + DRONE.clearance;
  const openTo = right.x - DRONE.clearance;
  return {
    drone: has('drone')
      ? {
          from: openFrom,
          to: openTo,
          width: DRONE.width,
          height: DRONE.height,
          speed: DRONE.speed,
          y: droneHeight(
            rng.float(DRONE_HEIGHTS[0], DRONE_HEIGHTS[1]),
            openFrom,
            openTo,
            buildings,
          ),
          phase: rng.float(0, 2),
        }
      : null,
    jetStream: has('jetStream')
      ? {
          top: JET_STREAM.top,
          bottom: JET_STREAM.top + JET_STREAM.depth,
          wind: Math.round(strength(JET_STREAM.strength) * Math.max(0.5, world.windScale)),
        }
      : null,
    dustDevil: has('dustDevil')
      ? {
          x: rng.float(openFrom + DUST_DEVIL.width, openTo - DUST_DEVIL.width),
          width: DUST_DEVIL.width,
          top: DUST_DEVIL.top,
          push: strength(DUST_DEVIL.push),
        }
      : null,
    bouncy: has('bouncy'),
  };
}

/** The rolled height, lifted if a tall roof under the rail would reach the drone. */
function droneHeight(
  rolled: number,
  from: number,
  to: number,
  buildings: readonly Building[],
): number {
  const reach = DRONE.width / 2;
  const under = buildings.filter(
    (building) => building.x < to + reach && building.x + building.width > from - reach,
  );
  const highestRoof = Math.min(...under.map((building) => building.top));
  return Math.max(DRONE_CEILING, Math.min(rolled, highestRoof - DRONE.height / 2 - DRONE_ROOF_GAP));
}

/** Raises the supertall tower in the middle of the city. */
export function shapeCity(twists: readonly TwistKind[], skyline: Skyline, rng: Rng): void {
  if (!twists.includes('supertall')) return;
  const middle = skyline.buildings.reduce((best, building, index) => {
    const distance = Math.abs(building.x + building.width / 2 - WORLD_WIDTH / 2);
    const bestBuilding = skyline.buildings[best];
    const bestDistance = bestBuilding
      ? Math.abs(bestBuilding.x + bestBuilding.width / 2 - WORLD_WIDTH / 2)
      : Infinity;
    return distance < bestDistance ? index : best;
  }, 0);
  raiseBuilding(skyline, middle, SUPERTALL_TOP + rng.float(0, 8), rng);
}

/** Where along its rail the drone is at a step of the current throw: a steady back and forth. */
export function droneAt(drone: Drone, step: number): Rect {
  const cycle = (((drone.phase + step * drone.speed) % 2) + 2) % 2;
  const along = cycle <= 1 ? cycle : 2 - cycle;
  const x = drone.from + (drone.to - drone.from) * along;
  return {
    x: x - drone.width / 2,
    y: drone.y - drone.height / 2,
    width: drone.width,
    height: drone.height,
  };
}

/** Horizontal acceleration on a banana at this point; `wind` is the ground wind of the throw. */
export function airAt(hazards: Hazards, wind: number, x: number, y: number): number {
  let push = wind / 5;
  const band = hazards.jetStream;
  if (band && y >= band.top && y <= band.bottom) push = band.wind / 5;
  const devil = hazards.dustDevil;
  if (devil && y >= devil.top && Math.abs(x - devil.x) <= devil.width / 2) push += devil.push;
  return push;
}

/**
 * The hazards after a throw of `steps` steps: the drone has moved on, and
 * the dust devil has wandered, staying between the gorillas.
 */
export function hazardsAfterThrow(
  hazards: Hazards,
  steps: number,
  gorillas: readonly [Gorilla, Gorilla],
  rng: Rng,
): Hazards {
  const drone = hazards.drone
    ? { ...hazards.drone, phase: (hazards.drone.phase + steps * hazards.drone.speed) % 2 }
    : null;
  const [left, right] = gorillas[0].x < gorillas[1].x ? gorillas : [gorillas[1], gorillas[0]];
  const devil = hazards.dustDevil
    ? {
        ...hazards.dustDevil,
        x: clamp(
          hazards.dustDevil.x + rng.float(-1, 1) * DUST_DEVIL.wander,
          left.x + 30 + DRONE.clearance + DUST_DEVIL.width,
          right.x - DRONE.clearance - DUST_DEVIL.width,
        ),
      }
    : null;
  return { ...hazards, drone, dustDevil: devil };
}

/** Gusts never push the wind past what a round can roll (−14…+15 before the world's scale). */
const GUST_LIMIT = 15;

/**
 * The wind for the next throw when gusts blow: a shift of 2 to 5 either way
 * from the last, so it keeps changing but a player can still follow it.
 */
export function gust(world: World, current: number, rng: Rng): number {
  const shift = rng.int(2, 5) * (rng.chance(0.5) ? 1 : -1) * world.windScale;
  const limit = GUST_LIMIT * world.windScale;
  const next = Math.abs(current + shift) > limit ? current - shift : current + shift;
  return Math.round(next) + 0;
}

/**
 * Picks the next rooftop for lightning: never one a gorilla stands on, nor
 * its neighbours, so the storm reshapes the city without deciding the round.
 */
export function pickLightningTarget(
  buildingCount: number,
  occupied: readonly number[],
  rng: Rng,
): number | null {
  const candidates = Array.from({ length: buildingCount }, (_, index) => index).filter((index) =>
    occupied.every((taken) => Math.abs(taken - index) > 1),
  );
  return candidates.length > 0 ? rng.pick(candidates) : null;
}

/** The bowl a strike leaves: centred on the roof edge, so it notches the top of the tower. */
export function lightningCrater(roof: { x: number; width: number; top: number }): Circle {
  return { x: roof.x + roof.width / 2, y: roof.top + 4, radius: LIGHTNING_RADIUS };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
