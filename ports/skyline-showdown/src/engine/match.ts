import { createRng, type Rng } from '@shared/rng';
import type { Circle } from './geometry';
import { otherPlayer, placeGorillas, type Gorilla, type PlayerIndex } from './gorillas';
import { maybeSpawnBalloon, type Balloon, type PowerUpKind } from './powerups';
import { simulateShot, type ShotRecord, type ThrowInput } from './shot';
import { makeSkyline, pickSlopePattern, type SlopePattern } from './skyline';
import type { Target } from './targets';
import { createTerrain, type Terrain } from './terrain';
import {
  gust,
  hazardsAfterThrow,
  hazardsFor,
  lightningCrater,
  pickLightningTarget,
  shapeCity,
  type Hazards,
  type TwistKind,
} from './twists';
import { rollWind } from './wind';
import { chooseWorld, windOn, type World, type WorldChoice } from './worlds';

/**
 * The rules of a match: rounds on fresh cities, turns that alternate forever
 * (across rounds too, as in the original), and scoring.
 *
 * The original played a fixed number of rounds ("play to how many total
 * points") and, through a bug, gave the point to the thrower even when a
 * gorilla hit itself. Here both formats exist, and a self-hit scores for the
 * opponent, as the original's own HITSELF constant intended.
 *
 * The same rules serve the solo modes: in the Daily Skyline and Trick Shot
 * one gorilla keeps the turn and the other stands still as the target, with
 * a limit on the throws.
 */
export type MatchFormat = 'firstTo' | 'total';

export interface MatchOptions {
  seed: number;
  world: WorldChoice;
  points: number;
  format: MatchFormat;
  /** Power-ups that balloons may carry; empty turns balloons off. */
  powerUps: readonly PowerUpKind[];
  /** World Tour twists; a Quick Match has none. */
  twists?: readonly TwistKind[];
  /** The gorilla whose turn it is keeps it: the other never throws. */
  solo?: boolean;
  /** A round with no point after this many throws ends the match undecided. */
  throwLimit?: number;
}

export interface Round {
  number: number;
  seed: number;
  world: World;
  terrain: Terrain;
  gorillas: [Gorilla, Gorilla];
  wind: number;
  balloon: Balloon | null;
  shields: [boolean, boolean];
  twists: readonly TwistKind[];
  hazards: Hazards;
  /** The rooftop lightning will strike after the next throw, if the stage has lightning. */
  lightningTarget: number | null;
  /** Trick Shot's crates, bells and hoops; a match has none. */
  targets: readonly Target[];
  /** Throws made so far this round. */
  throws: number;
  /** Randomness within the round, such as balloons arriving between throws. */
  rng: Rng;
}

export type MatchStatus = 'playing' | 'roundOver' | 'matchOver';

export interface MatchState {
  options: MatchOptions;
  round: Round;
  scores: [number, number];
  /** Whose throw it is. */
  turn: PlayerIndex;
  held: Held;
  status: MatchStatus;
  /** Set when the match is over; null means a draw. */
  winner: PlayerIndex | null;
  /** Seeds each new round. */
  rng: Rng;
}

export interface TurnResult {
  shot: ShotRecord;
  /** Who got a point this throw, if anyone. */
  scorer: PlayerIndex | null;
  usedPowerUp: PowerUpKind | null;
  /** The drone, jet stream and dust devil as they were during the throw. */
  hazards: Hazards;
  /** What changed between this throw and the next: a new wind, a lightning strike. */
  between: BetweenThrows;
}

export interface BetweenThrows {
  /** A gust rolled a new wind. */
  wind: number | null;
  /** Lightning struck this building, leaving this crater. */
  strike: { building: number; crater: Circle } | null;
}

export type Held = [PowerUpKind | null, PowerUpKind | null];

/** How a round began: all a challenge link needs to set it up again (with its throws). */
export interface RoundStart {
  seed: number;
  number: number;
  turn: PlayerIndex;
  held: Held;
  wind: number;
}

/** The start of the round being played, read before its first throw. */
export function roundStart(state: MatchState): RoundStart {
  const { round } = state;
  return {
    seed: round.seed,
    number: round.number,
    turn: state.turn,
    held: [...state.held],
    wind: round.wind,
  };
}

export function createMatch(options: MatchOptions): MatchState {
  const rng = createRng(options.seed);
  return {
    options,
    round: createRound(1, nextRoundSeed(rng), options),
    scores: [0, 0],
    turn: 0,
    held: [null, null],
    status: 'playing',
    winner: null,
    rng,
  };
}

/**
 * A match that starts from a round built elsewhere: a Trick Shot puzzle, or
 * a round rebuilt from a challenge link, with whoever's turn it was and the
 * power-ups they held.
 */
export function matchFromRound(
  options: MatchOptions,
  round: Round,
  turn: PlayerIndex,
  held: Held,
): MatchState {
  return {
    options,
    round,
    scores: [0, 0],
    turn,
    held: [...held],
    status: 'playing',
    winner: null,
    rng: createRng(options.seed),
  };
}

// Each round draws from its own generator, so the city, the wind and the
// balloons of round 3 never depend on how many throws rounds 1 and 2 took,
// and a round can be rebuilt from its seed alone.
function nextRoundSeed(rng: Rng): number {
  return rng.int(0, 0x7fffffff);
}

/** A fresh round: its city, world, wind, gorillas and twists all come from its seed. */
export function createRound(number: number, seed: number, options: MatchOptions): Round {
  const roundRng = createRng(seed);
  const twists = options.twists ?? [];
  const world = chooseWorld(options.world, roundRng);
  const skyline = makeSkyline(roundRng, patternFor(twists, roundRng));
  shapeCity(twists, skyline, roundRng);
  const wind = windOn(world, rollWind(roundRng));
  const gorillas = placeGorillas(skyline.buildings, roundRng);
  const hazards = hazardsFor(twists, world, gorillas, skyline.buildings, roundRng);
  const lightningTarget = twists.includes('lightning')
    ? pickLightningTarget(
        skyline.buildings.length,
        gorillas.map((gorilla) => gorilla.building),
        roundRng,
      )
    : null;
  return {
    number,
    seed,
    world,
    terrain: createTerrain(skyline.buildings),
    gorillas,
    wind,
    balloon: maybeSpawnBalloon(roundRng, wind, options.powerUps),
    shields: [false, false],
    twists,
    hazards,
    lightningTarget,
    targets: [],
    throws: 0,
    rng: roundRng,
  };
}

/** A hillside city climbs one way or the other; every other city rolls its slope as in 1990. */
function patternFor(twists: readonly TwistKind[], rng: Rng): SlopePattern {
  if (twists.includes('hillside')) return rng.chance(0.5) ? 'hillUp' : 'hillDown';
  return pickSlopePattern(rng);
}

export interface TurnAim {
  angle: number;
  velocity: number;
  usePowerUp?: boolean;
}

/** Throws for whoever's turn it is and applies everything that follows. */
export function takeTurn(state: MatchState, aim: TurnAim): TurnResult {
  if (state.status !== 'playing') throw new Error('The round is over; start the next one first.');
  const thrower = state.turn;
  const { round } = state;

  const usedPowerUp = aim.usePowerUp ? state.held[thrower] : null;
  if (usedPowerUp) state.held[thrower] = null;
  if (usedPowerUp === 'shield') round.shields[thrower] = true;
  const shot = simulateTurn(state, aim, usedPowerUp);
  const hazards = round.hazards;

  round.terrain = shot.terrain;
  round.shields = shot.shields;
  round.balloon = shot.balloon;
  round.throws++;
  if (shot.collected) state.held[thrower] = shot.collected;
  if (!state.options.solo) state.turn = otherPlayer(thrower);

  let scorer: PlayerIndex | null = null;
  let between: BetweenThrows = { wind: null, strike: null };
  if (shot.victim !== null) {
    scorer = shot.victim === thrower ? otherPlayer(thrower) : thrower;
    state.scores[scorer]++;
    settleRound(state);
  } else if (round.throws === state.options.throwLimit) {
    state.status = 'matchOver';
  } else {
    between = playBetweenThrows(round, shot.steps);
    if (!round.balloon) {
      round.balloon = maybeSpawnBalloon(round.rng, round.wind, state.options.powerUps);
    }
  }

  return { shot, scorer, usedPowerUp, hazards, between };
}

/**
 * The world moves on between throws: the drone and the dust devil travel,
 * gusts roll a new wind, and lightning strikes the marked rooftop and
 * marks the next one.
 */
function playBetweenThrows(round: Round, steps: number): BetweenThrows {
  round.hazards = hazardsAfterThrow(round.hazards, steps, round.gorillas, round.rng);
  let wind: number | null = null;
  if (round.twists.includes('gusts')) {
    round.wind = gust(round.world, round.wind, round.rng);
    wind = round.wind;
  }
  let strike: BetweenThrows['strike'] = null;
  const target = round.lightningTarget;
  const roof = target === null ? undefined : round.terrain.buildings[target];
  if (target !== null && roof) {
    const crater = lightningCrater(roof);
    round.terrain = { ...round.terrain, craters: [...round.terrain.craters, crater] };
    strike = { building: target, crater };
    round.lightningTarget = pickLightningTarget(
      round.terrain.buildings.length,
      round.gorillas.map((gorilla) => gorilla.building),
      round.rng,
    );
  }
  return { wind, strike };
}

/**
 * Exactly what `takeTurn` would throw, without throwing it: the match is
 * left untouched. Behind the hidden aim guide.
 */
export function previewTurn(state: MatchState, aim: TurnAim): ShotRecord {
  const usedPowerUp = aim.usePowerUp ? state.held[state.turn] : null;
  return simulateTurn(state, aim, usedPowerUp);
}

function simulateTurn(state: MatchState, aim: TurnAim, powerUp: PowerUpKind | null): ShotRecord {
  const thrower = state.turn;
  const { round } = state;
  const shields: [boolean, boolean] = [...round.shields];
  if (powerUp === 'shield') shields[thrower] = true;
  const input: ThrowInput = {
    thrower,
    angle: aim.angle,
    velocity: aim.velocity,
    powerUp: powerUp === 'shield' ? null : powerUp,
  };
  return simulateShot(
    {
      terrain: round.terrain,
      gorillas: round.gorillas,
      wind: round.wind,
      gravity: round.world.gravity,
      balloon: round.balloon,
      shields,
      hazards: round.hazards,
      targets: round.targets,
    },
    input,
  );
}

function settleRound(state: MatchState) {
  const { points, format } = state.options;
  const [first, second] = state.scores;
  const over = format === 'firstTo' ? Math.max(first, second) >= points : first + second >= points;
  if (!over) {
    state.status = 'roundOver';
    return;
  }
  state.status = 'matchOver';
  state.winner = first === second ? null : first > second ? 0 : 1;
}

export function startNextRound(state: MatchState): void {
  if (state.status !== 'roundOver')
    throw new Error('Only a finished round can be followed by another.');
  state.round = createRound(state.round.number + 1, nextRoundSeed(state.rng), state.options);
  state.status = 'playing';
}
