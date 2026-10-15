import { createRng } from '@shared/rng';
import { CAR_LENGTH, STEP_SECONDS } from './constants';
import {
  advanceRoad,
  createDrive,
  gapOf,
  isAlongside,
  moveHazard,
  pruneHazards,
  type Drive,
  type DriveEvent,
} from './drive';
import type { Hazard } from './hazards';
import { RoadPlanner, type PlanConfig } from './planner';
import { lanesPast } from './reach';
import {
  createRoad,
  inLayout,
  isPaved,
  layoutAt,
  mergeTarget,
  pavedLanes,
  pruneRoad,
  stepTarget,
  type Layout,
} from './road';

/**
 * Rival Driver: two cars side by side on a three-lane road that shifts, at
 * the same speed, each steered with two buttons. A car cannot move into the
 * lane the other one is in, and if both try for the same free lane in the
 * same step, neither moves. So one driver can box the other in, in front of
 * a donkey or a lane that ends. The planner proves that each car on its own
 * always has a way through; only the other driver can take it away.
 *
 * Each donkey row a car passes cleanly fills its race meter by one, like the
 * original's car climbing the screen; a crash empties it and takes the car
 * off the road for a moment. The first to fill the meter takes the round.
 */
export type RivalSide = 0 | 1;

export interface RivalConfig {
  seed: number;
  roundsToWin: number;
  /** Dodges in a row that fill the race meter. */
  meterTarget: number;
}

export const ROUNDS_RANGE = { min: 1, max: 9 } as const;
/**
 * Dodges in a row that fill the race meter. The original's climb took
 * eleven; with two cars that made one slip decide a round outright, so the
 * meter is shorter and a round can still turn.
 */
export const METER_TARGET = 8;
/** A crashed car is off the road this long… */
export const CRASH_OUT_SECONDS = 1.3;
/** …then back on it as a see-through ghost that cannot crash and does not block. */
export const GHOST_SECONDS = 1.2;
/** The banner between rounds. */
export const ROUND_PAUSE_SECONDS = 2.4;
/** A move refused by the other car counts towards a trap for this long before a crash. */
const TRAP_MEMORY_SECONDS = 1.6;

export const RIVAL_BPM = 120;

export type CarState = 'racing' | 'crashed' | 'ghost';

export interface RivalStats {
  dodges: number;
  crashes: number;
  /** Crashes of the other car that this one caused by blocking. */
  trapsSprung: number;
  /** Times this car was blocked with trouble ahead and still got through. */
  trapsEscaped: number;
  /** Dodges in a row without a crash, across rounds. */
  streak: number;
  bestStreak: number;
}

export interface RivalCar {
  lane: number;
  previousLane: number;
  /** Road time of the last lane change, for the views' slide. */
  switchedAt: number;
  /** Dodges in a row this round. */
  meter: number;
  state: CarState;
  /** Road time when crashed or ghost ends. */
  until: number;
  stats: RivalStats;
  /** Hazards that have hit this car. */
  hits: Set<number>;
  /** The donkey row whose dodge was counted last, so a row counts once. */
  lastRow: number;
  /** When the other car last refused one of this car's moves, and what was coming in its lane. */
  blocked: { at: number; hazard: Hazard | null } | null;
}

export type RivalPhase =
  { kind: 'race' } | { kind: 'round-over'; time: number; winner: RivalSide } | { kind: 'over' };

export interface RivalState {
  config: RivalConfig;
  drive: Drive;
  planner: RoadPlanner;
  cars: [RivalCar, RivalCar];
  phase: RivalPhase;
  rounds: [number, number];
  round: number;
  winner: RivalSide | null;
  /** Both meters filled on the same row: the next crash decides the round. */
  deadHeat: boolean;
}

/** One driver's two buttons, pressed this step. */
export interface RivalInput {
  left: boolean;
  right: boolean;
}

export type BumpReason = 'car' | 'tie' | 'edge';

export type RivalEvent =
  | Extract<DriveEvent, { type: 'reveal' | 'beat' }>
  | {
      type: 'move';
      car: RivalSide;
      from: number;
      to: number;
      /** Out of a lane that is ending. */
      merging: boolean;
    }
  /** A refused move: into the other car's lane, at the same lane in the same step, or off the road. */
  | { type: 'bump'; car: RivalSide; reason: BumpReason; lane: number }
  | { type: 'crash'; car: RivalSide; hazard: Hazard; trapped: boolean }
  | { type: 'dodge'; car: RivalSide; hazard: Hazard; meter: number }
  /** Got through after the other car blocked the way: `count` times this match. */
  | { type: 'escape'; car: RivalSide; count: number }
  | { type: 'respawn'; car: RivalSide; lane: number }
  | { type: 'solid'; car: RivalSide }
  | { type: 'dead-heat' }
  | { type: 'round-won'; car: RivalSide; rounds: [number, number] }
  | { type: 'round'; round: number }
  | { type: 'match-over'; winner: RivalSide };

export function rivalMatch(seed: number, roundsToWin = 3): RivalConfig {
  return { seed, roundsToWin, meterTarget: METER_TARGET };
}

/** The road for one round: three lanes, shifting, with donkeys one or two to a row. */
export function rivalPlan(seed: number, start: Layout): PlanConfig {
  return {
    seed,
    bpm: RIVAL_BPM,
    speed: { start: 14, max: 19, rampBeats: 60 },
    introduce: { single: 0, pair: 6, shift: 8, gate: 20 },
    // A row with one gap means a crash for whoever does not get there first: a treat, not a habit.
    weights: { single: 4, pair: 3, shift: 3, gate: 1 },
    rest: { start: 2.5, end: 1.5 },
    slack: 0.2,
    wobbleCommitSeconds: 0.6,
    lengthBeats: null,
    boss: false,
    leadInBeats: 6,
    steering: 'two-button',
    start,
  };
}

export function createRival(config: RivalConfig): RivalState {
  return {
    config,
    ...freshRoad(config.seed, 1, [freshStats(), freshStats()]),
    phase: { kind: 'race' },
    rounds: [0, 0],
    round: 1,
    winner: null,
    deadHeat: false,
  };
}

/** A fresh road for a round, with both cars on its outer lanes and the middle one free. */
function freshRoad(seed: number, round: number, stats: [RivalStats, RivalStats]) {
  const rng = createRng(seed + round * 7919);
  const start: Layout = { first: rng.int(0, 1), count: 3 };
  const planner = new RoadPlanner(rivalPlan(rng.int(1, 0x7fffffff), start));
  const drive = createDrive(createRoad(null, start), planner.speedAtBeat(0));
  drive.beatSeconds = planner.beatSeconds;
  drive.route = (roadTime) => planner.positionAtTime(roadTime);
  planner.fill(drive);
  const cars: [RivalCar, RivalCar] = [
    freshCar(start.first, stats[0]),
    freshCar(start.first + 2, stats[1]),
  ];
  return { drive, planner, cars };
}

function freshStats(): RivalStats {
  return { dodges: 0, crashes: 0, trapsSprung: 0, trapsEscaped: 0, streak: 0, bestStreak: 0 };
}

function freshCar(lane: number, stats: RivalStats): RivalCar {
  return {
    lane,
    previousLane: lane,
    switchedAt: -1,
    meter: 0,
    state: 'racing',
    until: 0,
    stats,
    hits: new Set(),
    lastRow: -Infinity,
    blocked: null,
  };
}

export function stepRival(state: RivalState, inputs: [RivalInput, RivalInput]): RivalEvent[] {
  const events: RivalEvent[] = [];
  const { phase } = state;
  if (phase.kind === 'over') return events;
  if (phase.kind === 'round-over') {
    phase.time += STEP_SECONDS;
    if (phase.time >= ROUND_PAUSE_SECONDS) nextRound(state, events);
    return events;
  }

  const { drive, planner } = state;
  planner.fill(drive);
  drive.speed = planner.speedAtBeat(drive.roadTime / planner.beatSeconds);
  moveCars(state, inputs, events);

  const roadEvents: DriveEvent[] = [];
  advanceRoad(drive, roadEvents);
  for (const hazard of drive.hazards) if (!hazard.passed) moveHazard(drive, hazard, roadEvents);
  for (const event of roadEvents) {
    if (event.type === 'reveal' || event.type === 'beat') events.push(event);
  }

  for (const side of SIDES) meetHazards(state, side, events);
  for (const hazard of drive.hazards) {
    if (!hazard.passed && isBehind(drive, hazard)) hazard.passed = true;
  }
  for (const side of SIDES) {
    keepOnRoad(state, side, events);
    comeBack(state, side, events);
  }
  settleRound(state, events);

  if (drive.steps % 60 === 0) {
    pruneHazards(drive);
    pruneRoad(drive.road, drive.car.nose - 60);
  }
  return events;
}

const SIDES = [0, 1] as const;

function otherOf(side: RivalSide): RivalSide {
  return side === 0 ? 1 : 0;
}

/** Whether a car takes up its lane: racing cars do; crashed ones and ghosts do not. */
function isSolid(car: RivalCar): boolean {
  return car.state === 'racing';
}

/**
 * Both drivers' presses, resolved together. A move into the lane the other
 * car is in is refused, and so is a move by both cars into the same free lane
 * in the same step. Ghosts pass through and are passed through.
 */
function moveCars(state: RivalState, inputs: [RivalInput, RivalInput], events: RivalEvent[]) {
  const { drive, cars } = state;
  const targets = SIDES.map((side) => {
    const car = cars[side];
    const { left, right } = inputs[side];
    if (car.state === 'crashed' || left === right) return null;
    const direction = left ? -1 : 1;
    const to = stepTarget(drive.road, drive.car.nose, car.lane, direction);
    if (to === null) {
      events.push({ type: 'bump', car: side, reason: 'edge', lane: car.lane + direction });
      return null;
    }
    return to;
  });
  const solid = isSolid(cars[0]) && isSolid(cars[1]);
  for (const side of SIDES) {
    const to = targets[side];
    if (to === null || to === undefined) continue;
    const car = cars[side];
    const other = cars[otherOf(side)];
    const reason: BumpReason | null = !solid
      ? null
      : to === other.lane
        ? 'car'
        : to === targets[otherOf(side)]
          ? 'tie'
          : null;
    if (reason) {
      events.push({ type: 'bump', car: side, reason, lane: to });
      car.blocked = { at: drive.roadTime, hazard: threatTo(state, car) };
      continue;
    }
    const merging = !inLayout(layoutAt(drive.road, drive.car.nose), car.lane);
    car.previousLane = car.lane;
    car.lane = to;
    car.switchedAt = drive.roadTime;
    events.push({ type: 'move', car: side, from: car.previousLane, to, merging });
  }
}

/** The nearest donkey or barrier coming in this car's lane, if one is in view. */
function threatTo(state: RivalState, car: RivalCar): Hazard | null {
  const { drive } = state;
  return (
    drive.hazards
      .filter(
        (hazard) =>
          hazard.kind !== 'carrot' &&
          hazard.revealed &&
          !hazard.passed &&
          hazard.lane === car.lane &&
          gapOf(drive, hazard) > 0,
      )
      .sort((a, b) => a.position - b.position)[0] ?? null
  );
}

function meetHazards(state: RivalState, side: RivalSide, events: RivalEvent[]) {
  const { drive, cars } = state;
  const car = cars[side];
  if (car.state !== 'racing') return;
  for (const hazard of drive.hazards) {
    if (hazard.kind === 'carrot' || hazard.passed || car.hits.has(hazard.id)) continue;
    if (hazard.lane === car.lane && isAlongside(hazard, drive.car.nose)) {
      crash(state, side, hazard, events);
      return;
    }
    if (isBehind(drive, hazard) && hazard.kind === 'donkey' && hazard.position !== car.lastRow) {
      dodge(state, side, hazard, events);
    }
  }
  if (car.blocked?.hazard?.passed && !car.hits.has(car.blocked.hazard.id)) {
    car.stats.trapsEscaped += 1;
    car.blocked = null;
    events.push({ type: 'escape', car: side, count: car.stats.trapsEscaped });
  }
}

function isBehind(drive: Drive, hazard: Hazard): boolean {
  return gapOf(drive, hazard) <= -(CAR_LENGTH + hazard.depth);
}

/** A ghost cannot crash, but it cannot drive on where a lane has ended either: it is moved over. */
function keepOnRoad(state: RivalState, side: RivalSide, events: RivalEvent[]) {
  const { drive } = state;
  const car = state.cars[side];
  if (car.state !== 'ghost' || isPaved(drive.road, drive.car.nose, car.lane)) return;
  const to = mergeTarget(drive.road, drive.car.nose, car.lane);
  events.push({ type: 'move', car: side, from: car.lane, to, merging: false });
  car.previousLane = car.lane;
  car.lane = to;
  car.switchedAt = drive.roadTime;
}

function dodge(state: RivalState, side: RivalSide, hazard: Hazard, events: RivalEvent[]) {
  const car = state.cars[side];
  car.lastRow = hazard.position;
  car.meter = Math.min(state.config.meterTarget, car.meter + 1);
  car.stats.dodges += 1;
  car.stats.streak += 1;
  car.stats.bestStreak = Math.max(car.stats.bestStreak, car.stats.streak);
  events.push({ type: 'dodge', car: side, hazard, meter: car.meter });
}

function crash(state: RivalState, side: RivalSide, hazard: Hazard, events: RivalEvent[]) {
  const { drive, cars } = state;
  const car = cars[side];
  const other = cars[otherOf(side)];
  const trapped = wasTrapped(state, car, other, hazard);
  car.hits.add(hazard.id);
  car.state = 'crashed';
  car.until = drive.roadTime + CRASH_OUT_SECONDS;
  car.meter = 0;
  car.blocked = null;
  car.stats.crashes += 1;
  car.stats.streak = 0;
  if (trapped) other.stats.trapsSprung += 1;
  events.push({ type: 'crash', car: side, hazard, trapped });
}

/**
 * A crash is a trap sprung by the other car when that car refused one of
 * this car's moves just before, or when it stood in the way of every lane
 * that would have been safe.
 */
function wasTrapped(state: RivalState, car: RivalCar, other: RivalCar, hazard: Hazard): boolean {
  if (!isSolid(other)) return false;
  const { drive } = state;
  if (car.blocked && drive.roadTime - car.blocked.at <= TRAP_MEMORY_SECONDS) return true;
  const row = drive.hazards.filter(
    (candidate) => candidate.kind !== 'carrot' && candidate.position === hazard.position,
  );
  const safe = lanesPast(drive.road, {
    position: hazard.position,
    blocked: row.map((candidate) => candidate.lane),
  });
  const low = Math.min(car.lane, other.lane);
  const high = Math.max(car.lane, other.lane);
  // Every safe lane lies at or beyond the other car, so getting there meant going through it.
  return (
    safe.length > 0 &&
    safe.every((lane) => (other.lane > car.lane ? lane >= other.lane : lane <= other.lane)) &&
    low !== high
  );
}

/** Crashed cars come back as ghosts in a free lane; ghosts turn solid once clear of the other car. */
function comeBack(state: RivalState, side: RivalSide, events: RivalEvent[]) {
  const { drive, cars } = state;
  const car = cars[side];
  const other = cars[otherOf(side)];
  if (car.state === 'crashed' && drive.roadTime >= car.until) {
    car.previousLane = car.lane;
    car.lane = reentryLane(state, other);
    car.switchedAt = drive.roadTime;
    car.state = 'ghost';
    car.until = drive.roadTime + GHOST_SECONDS;
    events.push({ type: 'respawn', car: side, lane: car.lane });
  } else if (car.state === 'ghost' && drive.roadTime >= car.until) {
    // A ghost only turns solid in a lane of its own, on a lane that is open.
    const open = inLayout(layoutAt(drive.road, drive.car.nose), car.lane);
    if (open && (other.lane !== car.lane || other.state === 'crashed')) {
      car.state = 'racing';
      events.push({ type: 'solid', car: side });
    }
  }
}

/** An open lane away from the other car with the most road clear ahead of it. */
function reentryLane(state: RivalState, other: RivalCar): number {
  const { drive } = state;
  const nose = drive.car.nose;
  const lanes = pavedLanes(drive.road, nose).filter(
    (lane) => inLayout(layoutAt(drive.road, nose), lane) && lane !== other.lane,
  );
  const clearAhead = (lane: number) =>
    Math.min(
      Infinity,
      ...drive.hazards
        .filter(
          (hazard) => hazard.kind !== 'carrot' && hazard.lane === lane && gapOf(drive, hazard) > -1,
        )
        .map((hazard) => gapOf(drive, hazard)),
    );
  return [...lanes].sort((a, b) => clearAhead(b) - clearAhead(a) || a - b)[0] ?? other.lane;
}

function settleRound(state: RivalState, events: RivalEvent[]) {
  const { cars, config } = state;
  const full = SIDES.filter(
    (side) => cars[side].state === 'racing' && cars[side].meter >= config.meterTarget,
  );
  if (state.deadHeat) {
    // The race is tied at the top: a car still racing when the other crashes takes it.
    const standing = SIDES.filter((side) => cars[side].meter >= config.meterTarget);
    if (standing.length === 1) winRound(state, standing[0] as RivalSide, events);
    else if (standing.length === 0) state.deadHeat = false;
    return;
  }
  if (full.length === 2) {
    state.deadHeat = true;
    state.planner.suddenDeath();
    events.push({ type: 'dead-heat' });
  } else if (full.length === 1) {
    winRound(state, full[0] as RivalSide, events);
  }
}

function winRound(state: RivalState, side: RivalSide, events: RivalEvent[]) {
  state.rounds[side] += 1;
  state.deadHeat = false;
  state.phase = { kind: 'round-over', time: 0, winner: side };
  events.push({ type: 'round-won', car: side, rounds: [...state.rounds] as [number, number] });
}

function nextRound(state: RivalState, events: RivalEvent[]) {
  const winner = SIDES.find((side) => state.rounds[side] >= state.config.roundsToWin);
  if (winner !== undefined) {
    state.winner = winner;
    state.phase = { kind: 'over' };
    events.push({ type: 'match-over', winner });
    return;
  }
  state.round += 1;
  const stats = state.cars.map((car) => car.stats) as [RivalStats, RivalStats];
  Object.assign(state, freshRoad(state.config.seed, state.round, stats));
  state.deadHeat = false;
  state.phase = { kind: 'race' };
  events.push({ type: 'round', round: state.round });
}
