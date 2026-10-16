import { TICKS_PER_SECOND } from '../engine/constants';
import { deckFouled } from '../engine/deck';
import { SHIP_CLASSES } from '../engine/fleet';
import { hullFacing, type ShipHitCause } from '../engine/ships';
import type { Ship, ShipWound } from '../engine/world';

/**
 * How a wounded ship looks, for both views: where each wound is, whether
 * it is still burning, and how the ship sits in the water. None of it
 * touches the game; the engine only settles the hull lower (`flooded`).
 */

/** Down by the head or the stern, and over on one side, radians, for a ship all but gone. */
const MOST_TRIM = 0.07;
const MOST_LIST = 0.14;
/** How much water each kind of blow lets in, for which end goes down: a torpedo's hole is under the waterline. */
const INFLOW: Readonly<Record<ShipHitCause, number>> = {
  shot: 0,
  bomb: 0.5,
  torpedo: 3,
  plane: 0.5,
  raid: 0.5,
};
/** A carrier that can still take aeroplanes keeps this share of it: the crew counter-flood to hold the deck level. */
const LEVEL_DECK = 0.25;
/** How long each blow burns, seconds… */
const BURNS: Readonly<Record<ShipHitCause, number>> = {
  shot: 0,
  bomb: 14,
  torpedo: 20,
  plane: 10,
  raid: 12,
};
/** …unless the ship is hurt this badly: then every wound burns until it is gone. */
const ABLAZE = 0.5;

export interface Attitude {
  /** Bow down, radians; negative is down by the stern. */
  trim: number;
  /** Over to the side away from the camera, radians. */
  list: number;
}

/** Trimmed towards where the water came in, and listing, the more the more it has flooded. */
export function damageAttitude(ship: Ship): Attitude {
  if (ship.wounds.length === 0 || ship.flooded === 0) return { trim: 0, list: 0 };
  const half = SHIP_CLASSES[ship.kind].length / 2;
  let water = 0;
  let moment = 0;
  for (const wound of ship.wounds) {
    water += INFLOW[wound.cause];
    moment += INFLOW[wound.cause] * wound.along;
  }
  const forward = water > 0 ? moment / water / half : 0;
  const level = ship.kind === 'carrier' && !deckFouled(ship) ? LEVEL_DECK : 1;
  const side = ship.index % 2 === 0 ? 1 : -1;
  return {
    trim: MOST_TRIM * ship.flooded * Math.max(-1, Math.min(1, forward * 2.5)) * level,
    list: MOST_LIST * ship.flooded * side * level,
  };
}

/** A fresh wound burns for a while; on a ship hurt past half, they all do. */
export function isBurning(ship: Ship, wound: ShipWound, tick: number): boolean {
  if (ship.state !== 'afloat') return true;
  if (1 - ship.hitPoints / ship.maxHitPoints >= ABLAZE) return true;
  return tick - wound.tick < BURNS[wound.cause] * TICKS_PER_SECOND;
}

/** Where a wound is in the world now, the ship having moved, turned and settled since. */
export function woundPoint(ship: Ship, wound: ShipWound): { x: number; y: number } {
  return {
    x: ship.x + wound.along * ship.direction * hullFacing(ship),
    y: ship.y + wound.height,
  };
}

/** A torpedo's hole is at the waterline; what burns is the deck above it. */
export function burningHeight(ship: Ship, wound: ShipWound): number {
  return wound.cause === 'torpedo' ? SHIP_CLASSES[ship.kind].freeboard : wound.height;
}

/** A number in [0, 1) fixed for each wound, so its ragged edge and scorch stay the same every frame. */
export function woundHash(ship: Ship, index: number, salt = 0): number {
  return Math.abs(Math.sin((ship.index * 31 + index * 7 + salt) * 78.233) * 43758.5453) % 1;
}
