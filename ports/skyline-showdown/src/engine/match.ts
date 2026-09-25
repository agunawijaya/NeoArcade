import { createRng, type Rng } from '@shared/rng';
import { otherPlayer, placeGorillas, type Gorilla, type PlayerIndex } from './gorillas';
import { maybeSpawnBalloon, type Balloon, type PowerUpKind } from './powerups';
import { simulateShot, type ShotRecord, type ThrowInput } from './shot';
import { makeSkyline, type SlopePattern } from './skyline';
import { createTerrain, type Terrain } from './terrain';
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
 */
export type MatchFormat = 'firstTo' | 'total';

export interface MatchOptions {
  seed: number;
  world: WorldChoice;
  points: number;
  format: MatchFormat;
  /** Power-ups that balloons may carry; empty turns balloons off. */
  powerUps: readonly PowerUpKind[];
}

export interface Round {
  number: number;
  seed: number;
  world: World;
  pattern: SlopePattern;
  terrain: Terrain;
  gorillas: [Gorilla, Gorilla];
  wind: number;
  balloon: Balloon | null;
  shields: [boolean, boolean];
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
  held: [PowerUpKind | null, PowerUpKind | null];
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
}

export function createMatch(options: MatchOptions): MatchState {
  const rng = createRng(options.seed);
  return {
    options,
    round: createRound(1, rng, options),
    scores: [0, 0],
    turn: 0,
    held: [null, null],
    status: 'playing',
    winner: null,
    rng,
  };
}

function createRound(number: number, rng: Rng, options: MatchOptions): Round {
  // Each round draws from its own generator, so the city, the wind and the
  // balloons of round 3 never depend on how many throws rounds 1 and 2 took.
  const seed = rng.int(0, 2 ** 31 - 1);
  const roundRng = createRng(seed);
  const world = chooseWorld(options.world, roundRng);
  const skyline = makeSkyline(roundRng);
  const wind = windOn(world, rollWind(roundRng));
  return {
    number,
    seed,
    world,
    pattern: skyline.pattern,
    terrain: createTerrain(skyline.buildings),
    gorillas: placeGorillas(skyline.buildings, roundRng),
    wind,
    balloon: maybeSpawnBalloon(roundRng, wind, options.powerUps),
    shields: [false, false],
    rng: roundRng,
  };
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

  round.terrain = shot.terrain;
  round.shields = shot.shields;
  round.balloon = shot.balloon;
  if (shot.collected) state.held[thrower] = shot.collected;
  state.turn = otherPlayer(thrower);

  let scorer: PlayerIndex | null = null;
  if (shot.victim !== null) {
    scorer = shot.victim === thrower ? otherPlayer(thrower) : thrower;
    state.scores[scorer]++;
    settleRound(state);
  } else if (!round.balloon) {
    round.balloon = maybeSpawnBalloon(round.rng, round.wind, state.options.powerUps);
  }

  return { shot, scorer, usedPowerUp };
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
  state.round = createRound(state.round.number + 1, state.rng, state.options);
  state.status = 'playing';
}
