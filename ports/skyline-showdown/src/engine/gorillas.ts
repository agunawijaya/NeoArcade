import type { Rng } from '@shared/rng';
import { GORILLA_SIZE } from './constants';
import type { Point, Rect } from './geometry';
import type { Building } from './skyline';

export type PlayerIndex = 0 | 1;

/** A gorilla is the 30 × 30 box the original's sprite occupied; x, y is its top-left. */
export interface Gorilla {
  x: number;
  y: number;
  /** Index of the building it stands on. */
  building: number;
}

/**
 * Where nobody stands: the second gorilla of a Trick Shot puzzle without a
 * dummy waits here, out of reach of every banana and out of sight.
 */
export const OFFSTAGE: Gorilla = { x: -1000, y: -1000, building: -1 };

export function isOffstage(gorilla: Gorilla): boolean {
  return gorilla.building < 0;
}

export function otherPlayer(player: PlayerIndex): PlayerIndex {
  return player === 0 ? 1 : 0;
}

/**
 * Player 1 goes on the second or third building from the left, player 2 on
 * the second or third from the right, each centred on the roof (the width
 * used includes the gap to the next building, as the original's did).
 */
export function placeGorillas(buildings: readonly Building[], rng: Rng): [Gorilla, Gorilla] {
  const last = buildings.length - 1;
  const left = rng.int(1, 2);
  const right = last - rng.int(1, 2);
  return [standOn(buildings, left), standOn(buildings, right)];
}

/** A gorilla on this building: centred on its roof and the gap after it, as the original placed them. */
export function standOn(buildings: readonly Building[], index: number): Gorilla {
  const building = buildings[index];
  const next = buildings[index + 1];
  if (!building || !next) throw new Error(`No building ${index} to stand on.`);
  const span = next.x - building.x;
  return {
    x: Math.round(building.x + span / 2 - 14),
    y: building.top - GORILLA_SIZE,
    building: index,
  };
}

/**
 * The parts of the body a banana can hit, traced from the original's
 * drawing: head, shoulders and arms, and legs.
 */
export function gorillaHitboxes(gorilla: Gorilla): Rect[] {
  const { x, y } = gorilla;
  return [
    { x: x + 10, y: y + 1, width: 10, height: 7 },
    { x: x + 4, y: y + 8, width: 22, height: 15 },
    { x: x + 7, y: y + 22, width: 16, height: 8 },
  ];
}

export function gorillaCentre(gorilla: Gorilla): Point {
  return { x: gorilla.x + GORILLA_SIZE / 2, y: gorilla.y + GORILLA_SIZE / 2 };
}

/**
 * Where the banana leaves the hand: above the head, on the side of the raised
 * arm. Player 1 threw from its left hand and player 2 from its right, as in
 * the original.
 */
export function throwingHand(gorilla: Gorilla, player: PlayerIndex): Point {
  return { x: gorilla.x + (player === 0 ? 3.5 : 28.5), y: gorilla.y - 4 };
}

/** The strip of roof under the gorilla's feet. */
export function footprint(gorilla: Gorilla): { from: number; to: number } {
  return { from: gorilla.x + 7, to: gorilla.x + 23 };
}
