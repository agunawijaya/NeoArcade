import { PENALTY_BIRD, PENALTY_OX, SCORE_DEPOT, SCORE_PLANE, SCORE_TARGET } from './constants';
import type { ScoreReason } from './events';
import { SHIP_CLASSES, type ShipKind } from './fleet';
import type { RaiderKind, Side, TargetKind } from './map';
import type { World } from './world';

/**
 * Points are kept per side. In one-player modes the player's side also pays
 * for its own losses, as 1984 did (a lost plane −50, an own target −100);
 * in two-player versus only the other side gains, so nothing is counted
 * twice. Harming birds and oxen always costs the side that did it.
 */
export function addPoints(world: World, side: Side, points: number, reason: ScoreReason) {
  if (points === 0) return;
  world.score[side] += points;
  world.events.push({ type: 'score', side, points, reason });
}

function other(side: Side): Side {
  return side === 0 ? 1 : 0;
}

export function targetValue(kind: TargetKind): number {
  return kind === 'depot' ? SCORE_DEPOT : SCORE_TARGET;
}

export function scoreTargetLost(world: World, side: Side, kind: TargetKind, culprit: Side | null) {
  const value = targetValue(kind);
  addPoints(world, other(side), value, kind === 'depot' ? 'depot' : 'target');
  if (world.rules.lossPenalties && culprit === side) addPoints(world, side, -value, 'own-target');
}

export function scorePlaneLost(world: World, side: Side) {
  addPoints(world, other(side), SCORE_PLANE, 'plane');
  if (world.rules.lossPenalties) addPoints(world, side, -SCORE_PLANE, 'lost-plane');
}

/** A ship sunk pays like a target: the other side gains, and sinking your own costs you. */
export function scoreShipLost(world: World, side: Side, kind: ShipKind, culprit: Side | null) {
  const value = SHIP_CLASSES[kind].score;
  addPoints(world, other(side), value, 'ship');
  if (world.rules.lossPenalties && culprit === side) addPoints(world, side, -value, 'own-ship');
}

/** A bomber is worth a fighter and a half; an airship, six. */
export const RAIDER_SCORE: Readonly<Record<RaiderKind, number>> = { bomber: 75, zeppelin: 300 };

export function scoreRaiderDown(world: World, kind: RaiderKind, culprit: Side) {
  addPoints(world, culprit, RAIDER_SCORE[kind], 'raider');
}

export function scoreBirdKilled(world: World, culprit: Side) {
  addPoints(world, culprit, -PENALTY_BIRD, 'bird');
}

export function scoreOxKilled(world: World, culprit: Side) {
  addPoints(world, culprit, -PENALTY_OX, 'ox');
}
