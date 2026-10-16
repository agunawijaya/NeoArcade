import { LIFE_BONUS_STEP, MAX_CRASHES, SUN_MOVES, THE_END_MOVES, movesToTicks } from './constants';
import { isAirborne } from './damage';
import { park, refill } from './flight';
import type { Side, WorldMap } from './map';
import {
  isBeaten,
  objectivesFailed,
  objectivesMet,
  targetsLeft,
  type Objective,
} from './objectives';
import type { Rules } from './rules';
import { createWorld, step, type Seat } from './sim';
import type { Controls, Plane, World } from './world';

/**
 * Playing: the round is on. Sun: the winner is flying off into the sun.
 * The end: the loser's THE END. Over: nothing more happens until a new
 * match is started.
 */
export type MatchPhase = 'playing' | 'sun' | 'the-end' | 'over';

export interface MatchSetup {
  rules: Rules;
  /** The battlefield for each round; Classic returns the same one every time, as 1984 did. */
  mapFor(round: number): WorldMap;
  seats: readonly Seat[];
  seed: number;
  /** How many rounds to play; Classic goes on until the player runs out of planes. */
  rounds: number;
  /**
   * Two-player versus: a round ends when either side's targets are gone
   * (the higher score wins it) or a pilot is out of planes (the other wins).
   */
  versus: boolean;
  /** What wins a round: the enemy's targets (default) or every enemy plane (Dogfight). */
  goal?: 'targets' | 'planes';
  /** A mission's objectives, all of which must be met; they take the place of `goal`. */
  objectives?: readonly Objective[];
  /** Ends the match early once a side has won this many rounds. */
  roundsToWin?: number;
  /** The round to start from, e.g. a campaign chapter. */
  firstRound?: number;
}

export interface Match {
  setup: MatchSetup;
  round: number;
  world: World;
  phase: MatchPhase;
  /** Ticks spent in the current phase. */
  phaseTicks: number;
  /** Points from the rounds already won, per side. */
  banked: [number, number];
  /** Rounds won, per side. */
  roundsWon: [number, number];
  /** The side that won the last round, or null. */
  lastWinner: Side | null;
  /** The bonus for planes left, paid when the sun sequence ends. */
  bonus: number;
}

export function createMatch(setup: MatchSetup): Match {
  const round = setup.firstRound ?? 0;
  return {
    setup,
    round,
    world: worldForRound(setup, round),
    phase: 'playing',
    phaseTicks: 0,
    banked: [0, 0],
    roundsWon: [0, 0],
    lastWinner: null,
    bonus: 0,
  };
}

function worldForRound(setup: MatchSetup, round: number): World {
  return createWorld({
    map: setup.mapFor(round),
    rules: { ...setup.rules, round },
    seats: setup.seats,
    seed: setup.seed,
  });
}

/** A side's score so far, the round in progress included. */
export function matchScore(match: Match, side: Side): number {
  return match.banked[side] + match.world.score[side];
}

export function stepMatch(match: Match, controls: readonly (Controls | undefined)[] = []) {
  if (match.phase === 'over') return;
  step(match.world, match.phase === 'playing' ? controls : []);
  match.phaseTicks += 1;
  switch (match.phase) {
    case 'playing':
      checkRoundEnd(match);
      break;
    case 'sun':
      if (match.phaseTicks >= movesToTicks(SUN_MOVES)) finishSun(match);
      break;
    case 'the-end':
      if (match.phaseTicks >= movesToTicks(THE_END_MOVES)) enterPhase(match, 'over');
      break;
  }
}

function enterPhase(match: Match, phase: MatchPhase) {
  match.phase = phase;
  match.phaseTicks = 0;
}

function humanPlanes(world: World, side?: Side): Plane[] {
  return world.planes.filter(
    (plane) => plane.pilot.kind === 'human' && (side === undefined || plane.side === side),
  );
}

/** A ship the player was sent to protect has been lost. */
function protectedShipLost(world: World): boolean {
  return world.ships.some((ship) => ship.protect && ship.side === 0 && ship.state !== 'afloat');
}

function checkRoundEnd(match: Match) {
  const { world, setup } = match;
  if (setup.versus) {
    checkVersusEnd(match);
    return;
  }
  const failed = setup.objectives !== undefined && objectivesFailed(world, setup.objectives);
  if (isBeaten(humanPlanes(world)) || protectedShipLost(world) || failed) {
    loseRound(match);
    return;
  }
  const won = setup.objectives
    ? objectivesMet(world, setup.objectives)
    : setup.goal === 'planes'
      ? isBeaten(world.planes.filter((plane) => plane.side === 1))
      : targetsLeft(world, 1) === 0;
  if (!won) return;
  const canWin = humanPlanes(world, 0).some((plane) => mayStillWin(plane));
  if (canWin) winRound(match, 0);
  else loseRound(match);
}

function checkVersusEnd(match: Match) {
  const { world } = match;
  const [left, right] = world.score;
  const leader: Side | null = left === right ? null : left > right ? 0 : 1;
  const beaten = ([0, 1] as const).filter((side) => isBeaten(humanPlanes(world, side)));
  if (beaten.length > 0) {
    winRound(match, beaten.length === 1 ? (beaten[0] === 0 ? 1 : 0) : (leader ?? 0));
    return;
  }
  const cleared = ([0, 1] as const).filter((side) => targetsLeft(world, side) === 0);
  const firstCleared = cleared[0];
  if (firstCleared === undefined) return;
  winRound(match, leader ?? (firstCleared === 0 ? 1 : 0));
}

/** 1984's rule: a pilot on the last plane only wins if that plane is still in the air. */
function mayStillWin(plane: Plane): boolean {
  if (plane.ghost) return false;
  if (plane.crashes < plane.maxCrashes - 1) return true;
  return plane.crashes < plane.maxCrashes && isAirborne(plane);
}

/**
 * Every remaining plane of the winner's flies off into the sun. The bonus
 * counts up the planes left in the hangar: +25 for the first, +50 for the
 * next, and so on.
 */
function winRound(match: Match, side: Side) {
  const { world } = match;
  match.lastWinner = side;
  match.roundsWon[side] += 1;
  match.bonus = 0;
  for (const plane of humanPlanes(world, side)) {
    if (plane.state === 'out') continue;
    if (!isAirborne(plane)) {
      refill(plane);
      park(world, plane);
    }
    plane.state = 'victory';
    plane.homing = false;
    // Counted up to a full squadron: a pilot with planes without end (the title's demo) still lands.
    const planesLeft = Math.min(plane.maxCrashes - plane.crashes, MAX_CRASHES);
    for (let count = 1; count <= planesLeft; count++) match.bonus += LIFE_BONUS_STEP * count;
  }
  for (const plane of world.planes) {
    if (plane.side !== side && plane.pilot.kind === 'cpu' && isAirborne(plane)) plane.homing = true;
  }
  world.events.push({ type: 'round-won', side, bonus: match.bonus });
  enterPhase(match, 'sun');
}

function loseRound(match: Match) {
  match.lastWinner = match.setup.versus ? null : 1;
  match.world.events.push({ type: 'game-over', round: match.round });
  enterPhase(match, 'the-end');
}

function finishSun(match: Match) {
  const { setup, world } = match;
  const side = match.lastWinner ?? 0;
  match.banked[0] += world.score[0];
  match.banked[1] += world.score[1];
  match.banked[side] += match.bonus;
  const next = match.round + 1;
  const decided = setup.roundsToWin !== undefined && match.roundsWon[side] >= setup.roundsToWin;
  if (decided || next - (setup.firstRound ?? 0) >= setup.rounds) {
    world.score = [0, 0];
    enterPhase(match, 'over');
    return;
  }
  match.round = next;
  match.world = worldForRound(setup, next);
  match.bonus = 0;
  enterPhase(match, 'playing');
}
