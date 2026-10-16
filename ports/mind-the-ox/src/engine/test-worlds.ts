import { CEILING } from './constants';
import { setVelocity } from './flight';
import {
  EDGE_WIDTH,
  SEA_LEVEL,
  type BaseSite,
  type Gate,
  type RaidSite,
  type ShipSite,
  type TargetSite,
  type WorldMap,
} from './map';
import { CLASSIC_RULES, type Rules } from './rules';
import { createWorld, step, type Seat } from './sim';
import { IDLE_CONTROLS, type Controls, type Plane, type World } from './world';

/** Small, flat battlefields for the engine's tests, where every number is easy to predict. */

export interface FlatMapOptions {
  width?: number;
  ground?: number;
  bases?: BaseSite[];
  targets?: TargetSite[];
  oxen?: number[];
  flocks?: WorldMap['flocks'];
  fog?: WorldMap['fog'];
}

export function flatMap({
  width = 1600,
  ground = 40,
  bases = [
    { side: 0, x: 400, facing: 1 },
    { side: 1, x: 1200, facing: -1 },
  ],
  targets = [],
  oxen = [],
  flocks = [],
  fog = [],
}: FlatMapOptions = {}): WorldMap {
  const heights = Array.from({ length: width }, (_, x) => {
    const fromEdge = Math.min(x, width - 1 - x);
    return fromEdge < EDGE_WIDTH / 4 ? CEILING + 40 : ground;
  });
  return {
    name: 'Test field',
    seed: 0,
    width,
    layout: 'classic',
    heights,
    bases,
    targets,
    oxen,
    flocks,
    fog,
    sea: null,
    fleet: [],
    raids: [],
    gates: [],
  };
}

export interface FlatSeaOptions {
  width?: number;
  /** The open water between two beaches. */
  sea?: { left: number; right: number };
  fleet?: ShipSite[];
  bases?: BaseSite[];
  raids?: RaidSite[];
  targets?: TargetSite[];
  gates?: Gate[];
}

/**
 * A flat coast for the sea tests: land at both ends, open water between,
 * our carrier steaming right in the middle of it, and an enemy airfield on
 * the left-hand shore.
 */
export function flatSea({
  width = 2400,
  sea = { left: 500, right: 2100 },
  fleet = [{ kind: 'carrier', side: 0, x: 1200, direction: 1 }],
  bases = [
    { side: 0, x: 1200, facing: 1, carrier: 0 },
    { side: 1, x: 260, facing: 1 },
  ],
  raids = [],
  targets = [],
  gates = [],
}: FlatSeaOptions = {}): WorldMap {
  const heights = Array.from({ length: width }, (_, x) => {
    const fromEdge = Math.min(x, width - 1 - x);
    if (fromEdge < EDGE_WIDTH / 4) return CEILING + 40;
    return x >= sea.left && x <= sea.right ? SEA_LEVEL : SEA_LEVEL + 12;
  });
  return {
    name: 'Test sea',
    seed: 0,
    width,
    layout: 'sea',
    heights,
    bases,
    targets,
    oxen: [],
    flocks: [],
    fog: [],
    sea: {
      level: SEA_LEVEL,
      spans: [{ left: sea.left, right: sea.right, kind: 'sea', shores: ['beach', 'beach'] }],
    },
    fleet,
    raids,
    gates,
  };
}

export const HUMAN: Seat = {
  side: 0,
  pilot: { kind: 'human', level: 'normal', territory: null },
  base: 0,
  maxCrashes: 5,
};

export function cpuSeat(level: Seat['pilot']['level'] = 'normal', base = 1): Seat {
  return {
    side: 1,
    pilot: { kind: 'cpu', level, territory: null },
    base,
    maxCrashes: Number.POSITIVE_INFINITY,
  };
}

export function testWorld(
  map: WorldMap = flatMap(),
  rules: Partial<Rules> = {},
  seats: readonly Seat[] = [HUMAN],
  seed = 1,
): World {
  return createWorld({ map, rules: { ...CLASSIC_RULES, ...rules }, seats, seed });
}

/** Puts a plane in the air at a spot, flying level at a speed. */
export function airborne(world: World, plane: Plane, x: number, y: number, heading = 0, speed = 6) {
  plane.state = 'flying';
  plane.x = x;
  plane.y = y;
  plane.heading = heading;
  plane.inverted = heading > 1024 && heading < 3072;
  plane.speed = speed;
  plane.throttle = Math.max(0, speed - world.tuning.minSpeed);
  setVelocity(world, plane);
}

export function controls(change: Partial<Controls> = {}): Controls {
  return { ...IDLE_CONTROLS, ...change };
}

/** Runs the world for some ticks with the same controls for seat 0, collecting every event. */
export function run(world: World, ticks: number, held: Partial<Controls> = {}) {
  const events: World['events'] = [];
  for (let tick = 0; tick < ticks; tick++) {
    step(world, [controls(held)]);
    events.push(...world.events);
  }
  return events;
}
