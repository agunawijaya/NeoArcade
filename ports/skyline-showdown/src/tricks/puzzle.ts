import { createRng } from '@shared/rng';
import type { Point } from '../engine/geometry';
import {
  gorillaCentre,
  OFFSTAGE,
  otherPlayer,
  standOn,
  type Gorilla,
  type PlayerIndex,
} from '../engine/gorillas';
import { matchFromRound, type MatchState, type Round } from '../engine/match';
import type { PowerUpKind } from '../engine/powerups';
import {
  buildSkyline,
  makeSkyline,
  type Block,
  type Building,
  type SlopePattern,
} from '../engine/skyline';
import { CRATE_SIZE, type Target } from '../engine/targets';
import { createTerrain } from '../engine/terrain';
import { NO_HAZARDS, type Hazards } from '../engine/twists';
import { WORLDS, type WorldId } from '../engine/worlds';

/**
 * A Trick Shot puzzle is data: a city, a world and a wind, where you stand,
 * what to hit and how. `buildPuzzle` turns it into an ordinary round for
 * the engine, so a puzzle flies by exactly the rules of a match.
 */
export interface Puzzle {
  /** Stable forever: progress is saved under it. */
  id: string;
  name: string;
  /** The task, one line on the puzzle card. */
  brief: string;
  /** Shown after a few misses: a nudge, never the answer. */
  hint: string;
  world: WorldId;
  wind: number;
  city: CitySpec;
  /** The building you throw from, and which way you face (right unless it says left). */
  stand: { on: number; facing?: 'left' | 'right' };
  /** Everything that must be reached in one throw; the last is the one that counts for "so close". */
  targets: readonly TargetSpec[];
  rule?: Rule;
  /** Thrown with every attempt. */
  powerUp?: Exclude<PowerUpKind, 'shield'>;
  /** Drones, jet streams, dust devils and springy ground, placed by hand. */
  hazards?: Partial<Hazards>;
  /** The second star: solve it within this many attempts. */
  par: number;
  /** The third star. */
  style: StyleGoal;
  /** A throw that solves it and meets the style goal; the tests replay it. */
  solution: { angle: number; velocity: number };
  /** Light for the scene (see render/palette.ts); dusk when left out. */
  timeOfDay?: number;
}

export interface CitySpec {
  /** Rolls the buildings (unless they are built by hand) and their windows. */
  seed: number;
  pattern?: SlopePattern;
  /** A hand-built city instead: every building's width and height, left to right. */
  blocks?: readonly Block[];
}

/** `along` is how far along the roof, 0 at its left edge and 1 at its right; the middle if left out. */
export type TargetSpec =
  | { kind: 'dummy'; on: number }
  | { kind: 'crate'; on: number; along?: number }
  | { kind: 'bell'; on: number; along?: number }
  | { kind: 'pad'; on: number; along?: number }
  | { kind: 'hoop'; x: number; y: number };

export type Rule =
  /** The banana must pass through the sun (or the world's stand-in) on the way. */
  | 'sun'
  /** The banana must bounce at least twice before it gets there. */
  | 'bounceTwice'
  /** Every banana of a Tri-Banana must reach a target. */
  | 'allBananas';

export type StyleGoal =
  /** The banana comes to rest this close to the middle of the last target. */
  | { kind: 'bullseye'; metres: number }
  /** Through the sun, where the puzzle does not already demand it. */
  | { kind: 'sun' }
  /** There within this many seconds of flight. */
  | { kind: 'quick'; seconds: number }
  /** Up and out of sight above the top of the screen, and still on target. */
  | { kind: 'sky' }
  /** Not a scratch on the city: no banana blasts a building. */
  | { kind: 'clean' }
  /** A dummy hit square on the head. */
  | { kind: 'bonk' };

/** A painted pad counts a landing this close to its middle; the style goal asks for closer. */
export const PAD_RADIUS_METRES = 2;
/** A bell hangs this far above the roof it stands on. */
const BELL_DROP = 14;

/** Where each target is in the world, after the city is built. */
export type PlacedTarget =
  | { kind: 'dummy'; player: PlayerIndex; centre: Point }
  | { kind: 'crate' | 'bell' | 'hoop'; engineIndex: number; centre: Point }
  | { kind: 'pad'; building: number; centre: Point };

export interface BuiltPuzzle {
  puzzle: Puzzle;
  round: Round;
  thrower: PlayerIndex;
  targets: readonly PlacedTarget[];
  /** A fresh match on the puzzle's round, ready for its one throw. */
  start(): MatchState;
}

export function buildPuzzle(puzzle: Puzzle): BuiltPuzzle {
  const rng = createRng(puzzle.city.seed);
  const buildings = puzzle.city.blocks
    ? buildSkyline(puzzle.city.blocks, rng)
    : makeSkyline(rng, puzzle.city.pattern).buildings;
  const thrower: PlayerIndex = puzzle.stand.facing === 'left' ? 1 : 0;
  const dummy = otherPlayer(thrower);

  const gorillas: [Gorilla, Gorilla] = [OFFSTAGE, OFFSTAGE];
  gorillas[thrower] = standOn(buildings, puzzle.stand.on);
  const engineTargets: Target[] = [];
  const targets = puzzle.targets.map((spec): PlacedTarget => {
    if (spec.kind === 'dummy') {
      gorillas[dummy] = standOn(buildings, spec.on);
      return { kind: 'dummy', player: dummy, centre: gorillaCentre(gorillas[dummy]) };
    }
    if (spec.kind === 'pad') {
      return { kind: 'pad', building: spec.on, centre: roofPoint(buildings, spec.on, spec.along) };
    }
    const centre = placeTarget(buildings, spec);
    engineTargets.push({ kind: spec.kind, ...centre });
    return { kind: spec.kind, engineIndex: engineTargets.length - 1, centre };
  });

  const world = WORLDS[puzzle.world];
  const round: Round = {
    number: 1,
    seed: puzzle.city.seed,
    world,
    terrain: createTerrain(buildings),
    gorillas,
    wind: puzzle.wind,
    balloon: null,
    shields: [false, false],
    twists: [],
    hazards: { ...NO_HAZARDS, ...puzzle.hazards },
    lightningTarget: null,
    targets: engineTargets,
    throws: 0,
    rng,
  };
  const options = {
    seed: puzzle.city.seed,
    world: puzzle.world,
    points: 1,
    format: 'firstTo' as const,
    powerUps: [],
    solo: true,
    throwLimit: 1,
  };

  return {
    puzzle,
    round,
    thrower,
    targets,
    start() {
      // Each attempt starts from the untouched city.
      const fresh: Round = { ...round, terrain: createTerrain(buildings), throws: 0 };
      const held: [PowerUpKind | null, PowerUpKind | null] = [null, null];
      held[thrower] = puzzle.powerUp ?? null;
      return matchFromRound(options, fresh, thrower, held);
    },
  };
}

function placeTarget(
  buildings: readonly Building[],
  spec: Exclude<TargetSpec, { kind: 'dummy' | 'pad' }>,
): Point {
  if (spec.kind === 'hoop') return { x: spec.x, y: spec.y };
  const roof = roofPoint(buildings, spec.on, spec.along);
  const lift = spec.kind === 'crate' ? CRATE_SIZE / 2 : BELL_DROP;
  return { x: roof.x, y: roof.y - lift };
}

function roofPoint(buildings: readonly Building[], index: number, along = 0.5): Point {
  const building = buildings[index];
  if (!building) throw new Error(`There is no building ${index} in this city.`);
  return { x: building.x + building.width * along, y: building.top };
}
