import { createRng, type Rng } from '@shared/rng';
import {
  BARRIER_DEPTH,
  CAR_LENGTH,
  CLASSIC_SPEED,
  CLOSING_DISTANCE,
  DONKEY_DEPTH,
  ORIGINAL,
  PIXEL,
  STEP_SECONDS,
  WINNING_CLIMB,
} from './constants';
import { createDrive, gapOf, stepDrive, type Drive, type DriveEvent } from './drive';
import { makeBarrier, makeCarrot, makeDonkey, type Hazard, type WobbleHop } from './hazards';
import { canGetPast, standingAfter, type Course, type Obstacle } from './reach';
import {
  createRoad,
  inLayout,
  LANE_POSITIONS,
  lanesOf,
  layoutAt,
  pavedLanes,
  TAPER_LENGTH,
  type LaneChange,
  type Layout,
} from './road';
import { revealGap } from './sight';

/**
 * Donkey versus Driver, as in 1981: one donkey at a time drops into a random
 * lane and heads for the car. A crash is a point for the Donkey and sends the
 * car back to the start. Every donkey dodged moves the car up the road, and
 * eleven in a row reach the top: a point for the Driver.
 *
 * Classic Duel plays it against the computer at the original's pace. In
 * Donkey vs Driver a second player steers each donkey until it crosses the
 * commit line, and the two swap roles every point. In both, the road shifts
 * now and then, more gently than in the runs: a wave may bring a lane that
 * opens and one that ends at a barrier after its donkey has gone by.
 */
export interface DuelConfig {
  seed: number;
  speed: number;
  pointsToWin: number;
  /** Mixes in the modern waves: hesitant donkeys, pairs, mud, three lanes and carrots. */
  hazards: boolean;
  /** A second player steers the donkey. */
  versus: boolean;
}

/** Two players: the donkey stops taking orders this many seconds before it would reach the car. */
export const VERSUS_COMMIT_SECONDS = 0.45;
/** Slower than Classic, so that even at the top of the road the commit leaves a fair window. */
export const VERSUS_SPEED = 13.5;
/** "BOOM!", the halves flying to the corners, and a breath before the next round. */
export const CRASH_SECONDS = 3.2;
/** "Donkey loses!" and the car sailing off the top. */
export const POINT_SECONDS = 1.9;
/** How often a wave brings a shift of the road, once the first donkey of a point is past. */
const SHIFT_CHANCE = 0.18;
/** Seconds of room a duel's shift leaves beyond a quick player's needs. */
const SHIFT_SLACK = 0.12;

export type DuelSide = 'donkey' | 'driver';
export type PlayerIndex = 0 | 1;
export type WaveKind = 'plain' | 'wobbler' | 'pair' | 'mud' | 'three-lanes' | 'carrot';

export interface Wave {
  /** 1 for the first donkey of a point; the same as the climb. */
  number: number;
  kind: WaveKind;
  donkeys: Hazard[];
  /** The barrier of a lane that ends in this wave, if one does. */
  barrier: Hazard | null;
  /** The wave ends, and the next donkey starts, once its last donkey (or barrier) is this far past the nose. */
  endGap: number;
}

export type DuelPhase =
  | { kind: 'drive' }
  | { kind: 'crash'; time: number; hazard: Hazard }
  | { kind: 'point'; time: number }
  | { kind: 'over' };

export interface DuelState {
  config: DuelConfig;
  drive: Drive;
  phase: DuelPhase;
  wave: Wave | null;
  /** Classic: the Donkey's and the Driver's points. */
  scores: Record<DuelSide, number>;
  /** Donkey vs Driver: each player's points, whatever role they scored them in. */
  playerScores: [number, number];
  /** Donkey vs Driver: who drives this point. The other player is the donkey. */
  driver: PlayerIndex;
  /** Donkey vs Driver: the lane the next donkey drops into. */
  dropLane: number;
  /** Points played so far. */
  round: number;
  winner: DuelSide | PlayerIndex | null;
  rng: Rng;
}

export type DuelEvent =
  | DriveEvent
  | { type: 'wave'; wave: Wave }
  | { type: 'drop-lane'; lane: number }
  | { type: 'carrot-boost'; climb: number }
  | {
      type: 'point';
      side: DuelSide;
      /** Donkey vs Driver: who scored it. */
      player: PlayerIndex | null;
    }
  | { type: 'round'; round: number; driver: PlayerIndex }
  | { type: 'match-over'; winner: DuelSide | PlayerIndex };

export interface DuelInput {
  driver: boolean;
  /** The second player's button in Donkey vs Driver. */
  donkey?: boolean;
}

export function createDuel(config: DuelConfig): DuelState {
  const rng = createRng(config.seed);
  const drive = createDrive(createRoad(), config.speed);
  const state: DuelState = {
    config,
    drive,
    phase: { kind: 'drive' },
    wave: null,
    scores: { donkey: 0, driver: 0 },
    playerScores: [0, 0],
    driver: 0,
    dropLane: drive.road.start.first + rng.int(0, 1),
    round: 1,
    winner: null,
    rng,
  };
  startWave(state, []);
  return state;
}

export function classicDuel(seed: number, pointsToWin = 5, hazards = false): DuelConfig {
  return { seed, speed: CLASSIC_SPEED, pointsToWin, hazards, versus: false };
}

export function versusDuel(seed: number, pointsToWin = 5, hazards = false): DuelConfig {
  return { seed, speed: VERSUS_SPEED, pointsToWin, hazards, versus: true };
}

export function stepDuel(state: DuelState, input: DuelInput): DuelEvent[] {
  const events: DuelEvent[] = [];
  const { phase } = state;

  if (phase.kind === 'over') return events;
  if (phase.kind === 'crash' || phase.kind === 'point') {
    phase.time += STEP_SECONDS;
    const length = phase.kind === 'crash' ? CRASH_SECONDS : POINT_SECONDS;
    if (input.donkey && state.config.versus) toggleDropLane(state, events);
    if (phase.time >= length) nextRound(state, events);
    return events;
  }

  if (input.donkey && state.config.versus) steerDonkey(state, events);
  const driveEvents = stepDrive(state.drive, input.driver);
  events.push(...driveEvents);

  for (const event of driveEvents) {
    if (event.type === 'crash') {
      scorePoint(state, 'donkey', events);
      state.phase = { kind: 'crash', time: 0, hazard: event.hazard };
      return events;
    }
    if (event.type === 'carrot') boostWithCarrot(state, events);
  }
  if (state.phase.kind === 'drive' && waveIsOver(state)) startWave(state, events);
  return events;
}

/** The side that scores a crash or a climb to the top, in Donkey vs Driver terms. */
export function donkeyPlayer(state: DuelState): PlayerIndex {
  return state.driver === 0 ? 1 : 0;
}

function waveIsOver(state: DuelState): boolean {
  const wave = state.wave;
  const last = wave?.barrier ?? wave?.donkeys.at(-1);
  return !wave || !last || gapOf(state.drive, last) <= wave.endGap;
}

function startWave(state: DuelState, events: DuelEvent[]) {
  const { drive } = state;
  const climb = drive.climb + 1;
  if (climb >= WINNING_CLIMB) {
    scorePoint(state, 'driver', events);
    state.phase = { kind: 'point', time: 0 };
    return;
  }
  drive.climb = climb;
  drive.hazards = drive.hazards.filter((hazard) => gapOf(drive, hazard) > -30);
  const wave = buildWave(state, climb);
  state.wave = wave;
  events.push({ type: 'wave', wave });
}

/** The car's top edge on the original screen at this climb. */
function carY(climb: number): number {
  return ORIGINAL.carStartY - ORIGINAL.climbPx * climb;
}

function buildWave(state: DuelState, climb: number): Wave {
  const { drive, rng, config } = state;
  // (RND * -4) * 8 in an integer variable: somewhere from 32 pixels above the screen to its top.
  const startY = Math.round(rng.next() * ORIGINAL.spawnHighestY);
  const spawnGap = revealGap(climb) + (ORIGINAL.revealY - startY) * PIXEL;
  const endGap = (carY(climb) - (ORIGINAL.waveEndY + ORIGINAL.donkeyHeightPx)) * PIXEL;
  const kind = config.hazards ? chooseWaveKind(state, climb) : 'plain';
  // A new lane must open beyond the sight line, so nothing pops up on the visible road.
  const farEnough = drive.car.nose + revealGap(climb) + TAPER_LENGTH;
  let position = drive.car.nose + spawnGap;

  if (kind === 'three-lanes') {
    openLane(drive, widened(layoutAt(drive.road, farEnough), rng), farEnough);
    position = Math.max(position, farEnough + 1);
  }
  const layout = layoutAt(drive.road, position);
  const lane = config.versus ? nearestOpen(layout, state.dropLane) : rng.pick(lanesOf(layout));
  if (kind === 'mud') {
    drive.road.mud.push({ from: drive.car.nose, to: position + 1, lanes: lanesOf(layout) });
  }

  const commitGap = config.versus ? config.speed * VERSUS_COMMIT_SECONDS : null;
  const role = config.versus ? 'rival' : kind === 'wobbler' ? 'wobbler' : 'wave';
  const hops =
    kind === 'wobbler'
      ? wobbleHops(rng, layout, lane, revealGap(climb), wobbleCommitGap(state, climb))
      : [];
  const first = makeDonkey(drive.nextHazardId++, position, lane, role, hops, commitGap);
  const donkeys = [first];

  if (kind === 'pair') {
    // The second donkey trails in another lane, far enough behind for one clean switch.
    const trail = config.speed * (0.62 + (CAR_LENGTH + DONKEY_DEPTH) / config.speed);
    const other = rng.pick(lanesOf(layout).filter((candidate) => candidate !== lane));
    donkeys.push(makeDonkey(drive.nextHazardId++, position + trail, other, 'pair'));
  }
  if (kind === 'carrot') {
    // A carrot in the donkey's own lane, a moment before it: greed has a price.
    const lead = config.speed * 0.4;
    drive.hazards.push(makeCarrot(drive.nextHazardId++, position - lead, lane));
  }
  drive.hazards.push(...donkeys);

  const shift =
    kind === 'three-lanes'
      ? narrowed(layout, rng)
      : climb > 1 && rng.chance(SHIFT_CHANCE) && shiftFits(state, climb)
        ? shifted(layout, rng)
        : null;
  const barrier = shift ? closeAfter(state, donkeys, shift, Math.max(farEnough, position)) : null;
  return { number: climb, kind, donkeys, barrier, endGap };
}

function chooseWaveKind(state: DuelState, climb: number): WaveKind {
  const { rng, config } = state;
  if (climb === 1) return 'plain';
  const window = revealGap(climb) / config.speed;
  const previous = state.wave?.kind;
  const kinds: WaveKind[] = ['plain', 'plain', 'three-lanes', 'mud'];
  if (!config.versus) kinds.push('wobbler', 'pair', 'carrot');
  // Near the top of the road there is no time left for mud, wobbling or a widening road.
  const fits = (kind: WaveKind) =>
    kind === 'wobbler'
      ? window >= 0.55
      : kind === 'mud' || kind === 'three-lanes'
        ? window >= 0.45
        : true;
  return rng.pick(
    kinds.filter((kind) => fits(kind) && !(kind === 'three-lanes' && previous === kind)),
  );
}

/** Shifts, like the widening road, only come while there is time to see them coming. */
function shiftFits(state: DuelState, climb: number): boolean {
  return revealGap(climb) / state.config.speed >= 0.45 && state.wave?.barrier === null;
}

function wobbleCommitGap(state: DuelState, climb: number): number {
  return Math.max(revealGap(climb) * 0.55, state.config.speed * 0.32);
}

/** One to three hops between coming into view and the commit gap, ending in a random lane. */
function wobbleHops(
  rng: Rng,
  layout: Layout,
  lane: number,
  sightGap: number,
  commitGap: number,
): WobbleHop[] {
  const lanes = lanesOf(layout);
  const hops: WobbleHop[] = [];
  const count = rng.int(1, 3);
  let current = lane;
  for (let index = 0; index < count; index++) {
    const gap = commitGap + ((sightGap - commitGap) * (count - index)) / (count + 1);
    const next =
      index === count - 1
        ? rng.pick(lanes)
        : rng.pick(lanes.filter((candidate) => candidate !== current));
    if (next !== current) hops.push({ gap, lane: next });
    current = next;
  }
  return hops;
}

/** A lane opening at `at`, with nothing closing. */
function openLane(drive: Drive, next: Layout, at: number) {
  const before = layoutAt(drive.road, at);
  const opens = lanesOf(next).find((lane) => !inLayout(before, lane)) ?? null;
  drive.road.changes.push({ at, layout: next, opens, closes: null, barrier: null });
}

/**
 * Starts the road's change to `next` once the wave's donkeys are behind it,
 * and puts the barrier of the closing lane where every lane past the donkeys
 * leaves time to merge. Returns the barrier.
 */
function closeAfter(state: DuelState, donkeys: Hazard[], next: Layout, from: number): Hazard {
  const { drive } = state;
  const before = layoutAt(drive.road, from);
  const opens = lanesOf(next).find((lane) => !inLayout(before, lane)) ?? null;
  const closes = lanesOf(before).find((lane) => !inLayout(next, lane)) as number;
  const last = Math.max(...donkeys.map((donkey) => donkey.position));
  const at = Math.max(from, last + DONKEY_DEPTH);
  const change: LaneChange = { at, layout: next, opens, closes, barrier: null };
  drive.road.changes.push(change);
  let barrier = at + CLOSING_DISTANCE;
  while (!mergeFits(state, donkeys, change, barrier)) barrier += 1;
  change.barrier = barrier;
  const hazard = makeBarrier(drive.nextHazardId++, barrier, closes);
  drive.hazards.push(hazard);
  return hazard;
}

/** Whether, whichever lane each donkey ends up in, a driver who got past them can merge in time. */
function mergeFits(state: DuelState, donkeys: Hazard[], change: LaneChange, barrier: number) {
  const { drive, config } = state;
  const now = drive.roadTime;
  const course: Course = {
    road: {
      ...drive.road,
      changes: drive.road.changes.map((c) => (c === change ? { ...c, barrier } : c)),
    },
    steering: 'one-button',
    slack: SHIFT_SLACK,
    timeAtPosition: (position) => now + (position - drive.car.nose) / config.speed,
    positionAtTime: (time) => drive.car.nose + (time - now) * config.speed,
  };
  const obstacleAt = (position: number, blocked: number[], depth: number): Obstacle => {
    const arrival = course.timeAtPosition(position);
    return {
      position,
      arrival,
      known: arrival - revealGap(drive.climb) / config.speed,
      clear: (CAR_LENGTH + depth) / config.speed,
      blocked,
    };
  };
  const end = obstacleAt(barrier, [change.closes as number], BARRIER_DEPTH);
  const last = donkeys.at(-1) as Hazard;
  // A steerable donkey may end up in any lane, so every one must leave a way to merge.
  return pavedLanes(course.road, last.position).every((lane) => {
    const past = standingAfter(course.road, obstacleAt(last.position, [lane], DONKEY_DEPTH));
    return canGetPast(course, past, end);
  });
}

function widened(layout: Layout, rng: Rng): Layout {
  const options = [layout.first - 1, layout.first].filter(
    (first) => first >= 0 && first + 3 <= LANE_POSITIONS,
  );
  return { first: rng.pick(options), count: 3 };
}

function narrowed(layout: Layout, rng: Rng): Layout {
  return { first: rng.pick([layout.first, layout.first + layout.count - 2]), count: 2 };
}

function shifted(layout: Layout, rng: Rng): Layout {
  const options = [layout.first - 1, layout.first + 1].filter(
    (first) => first >= 0 && first + layout.count <= LANE_POSITIONS,
  );
  return { first: rng.pick(options), count: layout.count };
}

function nearestOpen(layout: Layout, lane: number): number {
  return Math.min(layout.first + layout.count - 1, Math.max(layout.first, lane));
}

function steerDonkey(state: DuelState, events: DuelEvent[]) {
  const rival = state.wave?.donkeys.find((donkey) => !donkey.committed && !donkey.passed);
  if (!rival) {
    toggleDropLane(state, events);
    return;
  }
  const layout = layoutAt(state.drive.road, rival.position);
  const from = rival.lane;
  rival.lane = from >= layout.first + layout.count - 1 ? layout.first : from + 1;
  state.dropLane = rival.lane;
  const car = state.drive.car;
  if (rival.revealed && car.lane === from) {
    const gap = gapOf(state.drive, rival);
    rival.escape = { gap, seconds: gap / state.drive.speed, byCar: false };
  }
  events.push({ type: 'hop', hazard: rival, from });
}

/** Between waves the donkey player picks where the next one drops, along the far end of the road. */
function toggleDropLane(state: DuelState, events: DuelEvent[]) {
  const { drive } = state;
  const layout = layoutAt(drive.road, drive.car.nose + revealGap(drive.climb));
  const lane = nearestOpen(layout, state.dropLane);
  state.dropLane = lane >= layout.first + layout.count - 1 ? layout.first : lane + 1;
  events.push({ type: 'drop-lane', lane: state.dropLane });
}

function boostWithCarrot(state: DuelState, events: DuelEvent[]) {
  const { drive } = state;
  if (drive.climb + 1 >= WINNING_CLIMB) return;
  drive.climb += 1;
  if (state.wave) state.wave.number = drive.climb;
  events.push({ type: 'carrot-boost', climb: drive.climb });
}

function scorePoint(state: DuelState, side: DuelSide, events: DuelEvent[]) {
  const { config } = state;
  let player: PlayerIndex | null = null;
  if (config.versus) {
    player = side === 'driver' ? state.driver : donkeyPlayer(state);
    state.playerScores[player] += 1;
  } else {
    state.scores[side] += 1;
  }
  events.push({ type: 'point', side, player });
}

function nextRound(state: DuelState, events: DuelEvent[]) {
  const { config } = state;
  const winner = config.versus
    ? ([0, 1] as const).find((player) => state.playerScores[player] >= config.pointsToWin)
    : (['donkey', 'driver'] as const).find((side) => state.scores[side] >= config.pointsToWin);
  if (winner !== undefined) {
    state.winner = winner;
    state.phase = { kind: 'over' };
    events.push({ type: 'match-over', winner });
    return;
  }

  // Back to the start, in the left lane, on a clear road: CX = 105, CY = 105.
  const nose = state.drive.car.nose;
  state.drive.climb = 0;
  state.drive.hazards = [];
  state.drive.road = createRoad();
  const start = state.drive.road.start;
  const car = state.drive.car;
  car.lane = start.first;
  car.lanes = start.count;
  car.previousLane = start.first;
  car.heldPresses = [];
  car.switchedAt = state.drive.roadTime;
  car.nose = nose;
  state.dropLane = nearestOpen(start, state.dropLane);
  state.round += 1;
  if (config.versus) state.driver = donkeyPlayer(state);
  events.push({ type: 'round', round: state.round, driver: state.driver });
  state.phase = { kind: 'drive' };
  state.wave = null;
  startWave(state, events);
}
