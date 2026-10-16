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
  closingLaneAt,
  createRoad,
  lanesOf,
  layoutAt,
  pruneRoad,
  stepTarget,
  TAPER_LENGTH,
  type Layout,
} from './road';

/**
 * Rival Driver: two cars on a three-lane road that shifts, at the same speed,
 * each with four buttons: a lane left or right, surge a car length Ahead, or
 * drop back Level. Each car takes up one cell of the road, a lane and a row,
 * or both rows of its lane while it surges or drops back. A car cannot move
 * into a cell the other one takes up, and if both go for the same cell in
 * the same step, neither moves; two cars never share a cell or swap. So one
 * driver can box the other in, in front of a donkey or a lane that ends, and
 * the other can surge to slip past the block. The planner proves that each
 * car on its own, Level or Ahead, always has a way through; only the other
 * driver can take it away.
 *
 * Each donkey row a car passes cleanly fills its race meter by one, like the
 * original's car climbing the screen, and a little more when it rides Ahead,
 * where it sees less of the road. A crash empties the meter and takes the car
 * off the road until there is a fair place to put it back. The first to fill
 * the meter takes the round.
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
/**
 * A crashed car is off the road at least this long, and then until a lane is
 * fit to come back to. For that time the other car has the road to itself,
 * with nobody to box it in: long enough for the better driver to make the
 * most of a rival's crash, short enough that a round can still turn.
 */
export const CRASH_OUT_SECONDS = 2.5;
/** The banner between rounds. */
export const ROUND_PAUSE_SECONDS = 2.4;
/** A move refused by the other car counts towards a trap for this long before a crash. */
const TRAP_MEMORY_SECONDS = 1.6;

/**
 * How far in front a car rides when it is Ahead: a car length and a little,
 * so its tail clears the nose of a car that is Level and it can cut across.
 * Donkeys come into view at the same line for both, so a car Ahead has this
 * much less road to react in: as much less as still leaves two lane changes
 * after a reaction at top speed (rival.test.ts proves it, row by row), so
 * that riding Ahead, out of reach of a Level car's blocks, costs something.
 */
export const AHEAD_DISTANCE = CAR_LENGTH + 0.4;
/** A surge or a drop back takes this long; meanwhile the car keeps its lane and fills both rows of it. */
export const SHIFT_SECONDS = 0.4;
/** What a donkey row passed cleanly while Ahead adds to the meter, against 1 when Level. */
export const AHEAD_DODGE = 1.25;

export const RIVAL_BPM = 120;

export type CarState = 'racing' | 'crashed';

/** Where a car rides: Level with the other car's row, or Ahead of it. */
export type Row = 'level' | 'ahead';

export interface RivalStats {
  dodges: number;
  /** Rows passed while Ahead, each worth a little more on the meter. */
  aheadDodges: number;
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
  /** Dodges in a row this round, with the bonus for rows passed Ahead. */
  meter: number;
  state: CarState;
  /** The row it rides in, or is heading for while it surges or drops back. */
  row: Row;
  /** When its surge or drop back began, while one is under way. */
  shiftedAt: number | null;
  /** Road time from which a crashed car may come back. */
  until: number;
  stats: RivalStats;
  /** Hazards that have hit this car. */
  hits: Set<number>;
  /** The donkey row whose dodge was counted last, so a row counts once. */
  lastRow: number;
  /** When the other car last refused one of this car's moves, which move, and what was coming in its lane. */
  blocked: { at: number; move: MoveKind; hazard: Hazard | null } | null;
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

/** One driver's four buttons, pressed this step. */
export interface RivalInput {
  left: boolean;
  right: boolean;
  surge: boolean;
  drop: boolean;
}

export const NO_INPUT: RivalInput = { left: false, right: false, surge: false, drop: false };

/** A move a driver asks for: a lane left or right, a surge Ahead, or a drop back Level. */
export type MoveKind = 'lane' | 'surge' | 'drop';

/**
 * Why a move was refused: the other car is in that cell, both cars went for
 * the same cell, there is no road there, or the car is busy surging or
 * dropping back.
 */
export type BumpReason = 'car' | 'tie' | 'edge' | 'busy';

export type RivalEvent =
  | Extract<DriveEvent, { type: 'reveal' | 'beat' }>
  | {
      type: 'move';
      car: RivalSide;
      from: number;
      to: number;
      /** Out of a lane that is ending. */
      merging: boolean;
      /** Ahead, across into the lane where the other car rides Level: in front of its nose. */
      cut: boolean;
    }
  /** A surge Ahead or a drop back Level has begun. */
  | { type: 'shift'; car: RivalSide; to: Row }
  /** A refused move, and which lane it was for. */
  | { type: 'bump'; car: RivalSide; move: MoveKind; reason: BumpReason; lane: number }
  /**
   * `doorShut`: trapped by having its drop back refused, the other car
   * sitting in its Level slot. `ahead`: how far in front of the Level line
   * the car was when it hit, for the wreck.
   */
  | {
      type: 'crash';
      car: RivalSide;
      hazard: Hazard;
      trapped: boolean;
      doorShut: boolean;
      ahead: number;
    }
  /** A row passed cleanly; `ahead` when it was passed Ahead, for the bonus. */
  | { type: 'dodge'; car: RivalSide; hazard: Hazard; meter: number; ahead: boolean }
  /** Got through after the other car blocked the way: `count` times this match. */
  | { type: 'escape'; car: RivalSide; count: number }
  | { type: 'respawn'; car: RivalSide; lane: number }
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
    ahead: AHEAD_DISTANCE,
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
  return {
    dodges: 0,
    aheadDodges: 0,
    crashes: 0,
    trapsSprung: 0,
    trapsEscaped: 0,
    streak: 0,
    bestStreak: 0,
  };
}

function freshCar(lane: number, stats: RivalStats): RivalCar {
  return {
    lane,
    previousLane: lane,
    switchedAt: -1,
    meter: 0,
    state: 'racing',
    row: 'level',
    shiftedAt: null,
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
  for (const car of state.cars) settleShift(car, drive.roadTime);
  moveCars(state, inputs, events);

  const roadEvents: DriveEvent[] = [];
  advanceRoad(drive, roadEvents);
  for (const hazard of drive.hazards) if (!hazard.passed) moveHazard(drive, hazard, roadEvents);
  for (const event of roadEvents) {
    if (event.type === 'reveal' || event.type === 'beat') events.push(event);
  }

  for (const side of SIDES) meetHazards(state, side, events);
  // Behind the Level row is behind both cars: nobody can meet it again.
  for (const hazard of drive.hazards) {
    if (!hazard.passed && isBehind(hazard, drive.car.nose)) hazard.passed = true;
  }
  for (const side of SIDES) comeBack(state, side, events);
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

/** How far ahead of the Level row a car's nose is: 0, AHEAD_DISTANCE, or on its way between. */
export function aheadOf(car: Pick<RivalCar, 'row' | 'shiftedAt'>, roadTime: number): number {
  const target = car.row === 'ahead' ? AHEAD_DISTANCE : 0;
  if (car.shiftedAt === null) return target;
  const done = Math.min(1, (roadTime - car.shiftedAt) / SHIFT_SECONDS);
  return car.row === 'ahead' ? target * done : AHEAD_DISTANCE * (1 - done);
}

/** Where a car's nose is on the road. */
export function noseOf(state: RivalState, car: RivalCar): number {
  return state.drive.car.nose + aheadOf(car, state.drive.roadTime);
}

/** The rows a car takes up: its own, or both while it surges or drops back. */
export function rowsOf(car: RivalCar): Row[] {
  return car.shiftedAt === null ? [car.row] : ['level', 'ahead'];
}

/** The cells of the road a car takes up, as `lane:row`: none while it is off the road. */
export function cellsOf(car: RivalCar): string[] {
  return car.state === 'racing' ? rowsOf(car).map((row) => cell(car.lane, row)) : [];
}

function cell(lane: number, row: Row): string {
  return `${lane}:${row}`;
}

function settleShift(car: RivalCar, roadTime: number) {
  if (car.shiftedAt !== null && roadTime - car.shiftedAt >= SHIFT_SECONDS - 1e-9) {
    car.shiftedAt = null;
  }
}

/** What a driver's presses ask for this step: a lane change wins over a surge or a drop back. */
function wanted(input: RivalInput): { kind: MoveKind; direction: -1 | 1 } | null {
  if (input.left !== input.right) return { kind: 'lane', direction: input.left ? -1 : 1 };
  if (input.surge !== input.drop) {
    return input.surge ? { kind: 'surge', direction: 1 } : { kind: 'drop', direction: -1 };
  }
  return null;
}

/** A move that has a place to go, and the cells it would newly take up. */
interface Claim {
  kind: MoveKind;
  lane: number;
  cells: string[];
}

/**
 * Both drivers' presses, resolved together from where the cars were at the
 * start of the step, so the order of the drivers never matters. A move into a
 * cell the other car takes up is refused, even if that car is moving out of
 * it, and so is a move by both cars into the same cell. A press is carried
 * out, or refused, in the step it is made: never later, when the road may
 * have changed.
 */
function moveCars(state: RivalState, inputs: [RivalInput, RivalInput], events: RivalEvent[]) {
  const { drive, cars } = state;
  const taken = [cellsOf(cars[0]), cellsOf(cars[1])] as const;
  const claims = SIDES.map((side) => claimOf(state, side, inputs[side], events));
  for (const side of SIDES) {
    const claim = claims[side];
    if (!claim) continue;
    const car = cars[side];
    const other = otherOf(side);
    const reason: BumpReason | null = claim.cells.some((wantedCell) =>
      taken[other].includes(wantedCell),
    )
      ? 'car'
      : claim.cells.some((wantedCell) => claims[other]?.cells.includes(wantedCell))
        ? 'tie'
        : null;
    if (reason) {
      events.push({ type: 'bump', car: side, move: claim.kind, reason, lane: claim.lane });
      car.blocked = { at: drive.roadTime, move: claim.kind, hazard: threatTo(state, car) };
      continue;
    }
    if (claim.kind === 'lane') {
      const rival = cars[other];
      const cut =
        car.row === 'ahead' &&
        rival.state === 'racing' &&
        rival.row === 'level' &&
        rival.shiftedAt === null &&
        rival.lane === claim.lane;
      const merging = closingLaneAt(drive.road, noseOf(state, car)) === car.lane;
      car.previousLane = car.lane;
      car.lane = claim.lane;
      car.switchedAt = drive.roadTime;
      events.push({
        type: 'move',
        car: side,
        from: car.previousLane,
        to: claim.lane,
        merging,
        cut,
      });
    } else {
      car.row = claim.kind === 'surge' ? 'ahead' : 'level';
      car.shiftedAt = drive.roadTime;
      events.push({ type: 'shift', car: side, to: car.row });
    }
  }
}

/**
 * What one driver's presses claim this step, or null when they ask for
 * nothing that can happen; a move with no road or no time for it is a bump
 * here and now.
 */
function claimOf(
  state: RivalState,
  side: RivalSide,
  input: RivalInput,
  events: RivalEvent[],
): Claim | null {
  const car = state.cars[side];
  const move = wanted(input);
  if (car.state === 'crashed' || !move) return null;
  const { kind, direction } = move;
  if (kind === 'lane') {
    if (car.shiftedAt !== null) {
      events.push({
        type: 'bump',
        car: side,
        move: kind,
        reason: 'busy',
        lane: car.lane + direction,
      });
      return null;
    }
    const nose = noseOf(state, car);
    const to =
      stepTarget(state.drive.road, nose, car.lane, direction) ??
      halfOpenLane(state, nose, car.lane + direction);
    if (to === null) {
      events.push({
        type: 'bump',
        car: side,
        move: kind,
        reason: 'edge',
        lane: car.lane + direction,
      });
      return null;
    }
    return { kind, lane: to, cells: [cell(to, car.row)] };
  }
  // Already there, or on the way: nothing to do.
  const row: Row = kind === 'surge' ? 'ahead' : 'level';
  if (car.shiftedAt !== null || car.row === row) return null;
  return { kind, lane: car.lane, cells: [cell(car.lane, row)] };
}

/**
 * A lane widening in beside the road that is already half there at the
 * car's nose. The player can see it, and nothing stands in a lane before it
 * opens, so it can be taken straight away. The planner does not count on
 * this: its proof only uses the lane from where it opens.
 */
function halfOpenLane(state: RivalState, nose: number, lane: number): number | null {
  const widening = state.drive.road.changes.some(
    (change) => change.opens === lane && change.at > nose && change.at - nose <= TAPER_LENGTH / 2,
  );
  return widening ? lane : null;
}

/** The nearest donkey or barrier coming in this car's lane, if one is in view. */
function threatTo(state: RivalState, car: RivalCar): Hazard | null {
  const { drive } = state;
  const nose = noseOf(state, car);
  return (
    drive.hazards
      .filter(
        (hazard) =>
          hazard.kind !== 'carrot' &&
          hazard.revealed &&
          !hazard.passed &&
          hazard.lane === car.lane &&
          hazard.position > nose,
      )
      .sort((a, b) => a.position - b.position)[0] ?? null
  );
}

function meetHazards(state: RivalState, side: RivalSide, events: RivalEvent[]) {
  const { drive, cars } = state;
  const car = cars[side];
  if (car.state !== 'racing') return;
  const nose = noseOf(state, car);
  for (const hazard of drive.hazards) {
    if (hazard.kind === 'carrot' || hazard.passed || car.hits.has(hazard.id)) continue;
    if (hazard.lane === car.lane && isAlongside(hazard, nose)) {
      crash(state, side, hazard, events);
      return;
    }
    if (isBehind(hazard, nose) && hazard.kind === 'donkey' && hazard.position !== car.lastRow) {
      dodge(state, side, hazard, events);
    }
  }
  if (car.blocked?.hazard?.passed && !car.hits.has(car.blocked.hazard.id)) {
    car.stats.trapsEscaped += 1;
    car.blocked = null;
    events.push({ type: 'escape', car: side, count: car.stats.trapsEscaped });
  }
}

/** Whether a hazard is behind a car whose nose is at `nose`, clear of its tail. */
function isBehind(hazard: Hazard, nose: number): boolean {
  return hazard.position - nose <= -(CAR_LENGTH + hazard.depth);
}

function dodge(state: RivalState, side: RivalSide, hazard: Hazard, events: RivalEvent[]) {
  const car = state.cars[side];
  // Only riding Ahead counts, not passing a row half way through a surge.
  const ahead = car.row === 'ahead' && car.shiftedAt === null;
  car.lastRow = hazard.position;
  car.meter = Math.min(state.config.meterTarget, car.meter + (ahead ? AHEAD_DODGE : 1));
  car.stats.dodges += 1;
  if (ahead) car.stats.aheadDodges += 1;
  car.stats.streak += 1;
  car.stats.bestStreak = Math.max(car.stats.bestStreak, car.stats.streak);
  events.push({ type: 'dodge', car: side, hazard, meter: car.meter, ahead });
}

function crash(state: RivalState, side: RivalSide, hazard: Hazard, events: RivalEvent[]) {
  const { drive, cars } = state;
  const car = cars[side];
  const other = cars[otherOf(side)];
  const trapped = wasTrapped(state, car, other, hazard);
  const doorShut = trapped && car.blocked?.move === 'drop';
  const ahead = aheadOf(car, drive.roadTime);
  car.hits.add(hazard.id);
  car.state = 'crashed';
  car.until = drive.roadTime + CRASH_OUT_SECONDS;
  // It comes back Level, whatever row it crashed in.
  car.row = 'level';
  car.shiftedAt = null;
  car.meter = 0;
  car.blocked = null;
  car.stats.crashes += 1;
  car.stats.streak = 0;
  if (trapped) other.stats.trapsSprung += 1;
  events.push({ type: 'crash', car: side, hazard, trapped, doorShut, ahead });
}

/**
 * A crash is a trap sprung by the other car when that car refused one of
 * this car's moves just before (a lane change, a surge or a drop back), or
 * when, riding in the same row, it stood in the way of every lane that would
 * have been safe.
 */
function wasTrapped(state: RivalState, car: RivalCar, other: RivalCar, hazard: Hazard): boolean {
  if (other.state !== 'racing') return false;
  const { drive } = state;
  if (car.blocked && drive.roadTime - car.blocked.at <= TRAP_MEMORY_SECONDS) return true;
  if (!rowsOf(car).some((row) => rowsOf(other).includes(row))) return false;
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

/** A crashed car comes back, solid at once, as soon as the road has a fair place for it. */
function comeBack(state: RivalState, side: RivalSide, events: RivalEvent[]) {
  const { drive } = state;
  const car = state.cars[side];
  if (car.state !== 'crashed' || drive.roadTime < car.until) return;
  const lane = reentryLane(state, side);
  if (lane === null) return;
  car.previousLane = car.lane;
  car.lane = lane;
  car.switchedAt = drive.roadTime;
  car.state = 'racing';
  events.push({ type: 'respawn', car: side, lane });
}

/**
 * Where a crashed car can come back, Level: an open lane the other car is
 * not in, in either row, between two rows of donkeys rather than beside one,
 * and safe past every row in view, so it can stay put until a new row turns
 * up. Nor may it take away the other car's way past any of those rows:
 * coming back never springs a trap. Of the lanes left, the one with the most
 * clear road ahead. Null while there is none: the car waits a little longer.
 */
function reentryLane(state: RivalState, side: RivalSide): number | null {
  const { drive } = state;
  const nose = drive.car.nose;
  const other = state.cars[otherOf(side)];
  const otherLane = other.state === 'racing' ? other.lane : null;
  const obstacles = drive.hazards.filter(
    (hazard) => hazard.kind !== 'carrot' && hazard.revealed && !isBehind(hazard, nose),
  );
  if (obstacles.some((hazard) => gapOf(drive, hazard) <= 0)) return null;
  const rows = [...new Set(obstacles.map((hazard) => hazard.position))].map((position) =>
    lanesPast(drive.road, {
      position,
      blocked: obstacles
        .filter((hazard) => hazard.position === position)
        .map((hazard) => hazard.lane),
    }),
  );
  const lanes = lanesOf(layoutAt(drive.road, nose)).filter(
    (lane) =>
      lane !== otherLane &&
      rows.every(
        (safe) =>
          safe.includes(lane) && (otherLane === null || leavesWayPast(safe, otherLane, lane)),
      ),
  );
  const clearAhead = (lane: number) =>
    Math.min(
      Infinity,
      ...drive.hazards
        .filter(
          (hazard) => hazard.kind !== 'carrot' && hazard.lane === lane && gapOf(drive, hazard) > 0,
        )
        .map((hazard) => gapOf(drive, hazard)),
    );
  return lanes.sort((a, b) => clearAhead(b) - clearAhead(a) || a - b)[0] ?? null;
}

/** Whether a car in `from` still has a safe lane it can reach without going through `blocker`. */
function leavesWayPast(safe: readonly number[], from: number, blocker: number): boolean {
  return safe.some(
    (lane) =>
      lane !== blocker && !(Math.min(from, lane) < blocker && blocker < Math.max(from, lane)),
  );
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
