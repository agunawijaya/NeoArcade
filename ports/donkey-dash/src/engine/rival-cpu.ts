import { createRng } from '@shared/rng';
import { CAR_LENGTH, PRESS_SECONDS, SIGHT_DISTANCE, STEP_SECONDS } from './constants';
import { gapOf, type Drive } from './drive';
import { lanesPast, route, type Course } from './reach';
import { closingLaneAt, inLayout, layoutAt, type LaneChange } from './road';
import type { RivalInput, RivalSide, RivalState } from './rival';

/**
 * The CPU rival in Rival Driver. It plays by a human's rules: it only knows
 * what is in view, it reacts after a delay, it presses no faster than a
 * thumb, and now and then it hesitates or misjudges a row. What changes from
 * level to level is how it treats the other car:
 *
 * - Easy only gets out of the way of trouble.
 * - Normal sometimes steps into the lane next to it that you need.
 * - Hard reads everything in view, lane ends included, and moves to box you
 *   in on purpose.
 * - Brutal does that too, and stays out of boxes itself: it leaves a
 *   threatened lane without dithering and waits in the middle lane, where it
 *   has a way out on both sides.
 *
 * It finds its way past each row with the planner's own search (reach.ts),
 * counting your car as a wall.
 */
export type CpuLevel = 'easy' | 'normal' | 'hard' | 'brutal';

export const CPU_LEVELS: readonly CpuLevel[] = ['easy', 'normal', 'hard', 'brutal'];

export interface DriverStyle {
  reactionSeconds: number;
  pressGap: number;
  /** Where it looks for traps: nowhere, one lane over, or anywhere it can reach in time. */
  trapping: 'never' | 'near' | 'anywhere';
  /** The chance of going for a trap it has spotted. */
  trapChance: number;
  /** Leaves threatened lanes without hesitating and waits in the middle, so it is hard to box in. */
  wary: boolean;
  /** The chance, each time it is about to press, of a short hesitation. */
  hesitation: number;
  /** The chance, for each row, of misjudging it and doing nothing. */
  blunder: number;
}

/**
 * Tuned against two scripted players over 40 matches each
 * (drive.playtest.ts): a casual phone player beats Easy seven times in ten,
 * Normal a bit more than one time in three, Hard about one in four and
 * Brutal hardly ever; a quick player who also holds the middle lane beats
 * Brutal about three times in five.
 */
export const CPU_STYLES: Record<CpuLevel, DriverStyle> = {
  easy: {
    reactionSeconds: 0.5,
    pressGap: 0.22,
    trapping: 'never',
    trapChance: 0,
    wary: false,
    hesitation: 0.3,
    blunder: 0.05,
  },
  normal: {
    reactionSeconds: 0.42,
    pressGap: 0.19,
    trapping: 'near',
    trapChance: 0.35,
    wary: false,
    hesitation: 0.22,
    blunder: 0.03,
  },
  hard: {
    reactionSeconds: 0.36,
    pressGap: 0.17,
    trapping: 'anywhere',
    trapChance: 0.7,
    wary: false,
    hesitation: 0.18,
    blunder: 0.025,
  },
  brutal: {
    reactionSeconds: 0.32,
    pressGap: 0.16,
    trapping: 'anywhere',
    trapChance: 0.9,
    wary: true,
    hesitation: 0.14,
    blunder: 0.02,
  },
};

export interface RivalDriver {
  /** This step's presses. */
  decide(state: RivalState): RivalInput;
  /** Traps it has gone for so far: the tests count them. */
  readonly trapAttempts: number;
}

/** Something ahead that rules lanes out: a row of donkeys, or a lane's end. */
interface Row {
  position: number;
  blocked: number[];
}

const NO_INPUT: RivalInput = { left: false, right: false };

export function createRivalDriver(style: DriverStyle, side: RivalSide, seed: number): RivalDriver {
  const rng = createRng(seed);
  const seenAt = new Map<string, number>();
  /** Per row: whether it misjudged it, and whether it chose to go for a trap there. */
  const blunders = new Map<number, boolean>();
  const trapRolls = new Map<number, boolean>();
  let lastPress = -Infinity;
  let waitUntil = -Infinity;
  let trapAttempts = 0;
  let round = 0;

  const knows = (drive: Drive, key: string) => {
    const since = seenAt.get(key);
    if (since === undefined) {
      seenAt.set(key, drive.roadTime);
      return false;
    }
    return drive.roadTime - since >= style.reactionSeconds - STEP_SECONDS / 2;
  };

  const decide = (state: RivalState): RivalInput => {
    const { drive } = state;
    if (state.round !== round) {
      // A new road: forget the old one.
      round = state.round;
      seenAt.clear();
      blunders.clear();
      trapRolls.clear();
      lastPress = -Infinity;
      waitUntil = -Infinity;
    }
    const me = state.cars[side];
    const them = state.cars[side === 0 ? 1 : 0];
    if (me.state === 'crashed' || state.phase.kind !== 'race') return NO_INPUT;
    const rows = rowsInView(drive, knows, style.trapping === 'anywhere');
    if (drive.roadTime - lastPress < style.pressGap || drive.roadTime < waitUntil) return NO_INPUT;

    // Ghosts and crashed cars do not block, so only a solid rival is a wall.
    const wall = them.state === 'racing' && me.state === 'racing' ? them.lane : null;
    const first = rows[0];
    let target: number | null = null;
    let fleeing = false;
    if (first) {
      if (!blunders.has(first.position)) blunders.set(first.position, rng.chance(style.blunder));
      if (blunders.get(first.position)) return NO_INPUT;
      target = goForTrap(drive, first, me.lane, them.lane, wall);
      if (target === null) {
        target = escapeLane(drive, first, me.lane, wall);
        fleeing = target !== null && target !== me.lane;
      }
    } else if (isEnding(drive, me.lane)) {
      target = intoTheRoad(drive, me.lane);
    } else if (style.wary) {
      target = middleLane(drive, me.lane, wall);
    }

    if (target === null || target === me.lane) return NO_INPUT;
    const next = target < me.lane ? me.lane - 1 : me.lane + 1;
    if (!clearBeside(drive, next)) return NO_INPUT;
    if (!(style.wary && fleeing) && rng.chance(style.hesitation)) {
      waitUntil = drive.roadTime + rng.float(0.05, 0.2);
      return NO_INPUT;
    }
    lastPress = drive.roadTime;
    return target < me.lane ? { left: true, right: false } : { left: false, right: true };
  };

  /** A trap worth going for at `row`, once per row and only as often as the style likes. */
  const goForTrap = (
    drive: Drive,
    row: Row,
    lane: number,
    rivalLane: number,
    wall: number | null,
  ): number | null => {
    if (style.trapping === 'never' || wall === null) return null;
    const trap = trapLane(drive, row, lane, rivalLane, wall);
    if (trap === null) return null;
    if (!trapRolls.has(row.position)) {
      const going = rng.chance(style.trapChance);
      trapRolls.set(row.position, going);
      if (going) trapAttempts += 1;
    }
    return trapRolls.get(row.position) ? trap : null;
  };

  /**
   * A lane, other than its own, that is safe for this car at `row` and that,
   * with this car in it, leaves the rival no way past the row, when right now
   * it still has one.
   */
  const trapLane = (
    drive: Drive,
    row: Row,
    lane: number,
    rivalLane: number,
    wall: number,
  ): number | null => {
    const safe = lanesPast(drive.road, row);
    if (safe.includes(rivalLane)) return null;
    const deadline = arrivalOf(drive, row);
    const rivalEscapes = (blocker: number) =>
      route(courseOf(drive, PRESS_SECONDS, blocker), rivalLane, drive.roadTime, deadline, safe) !==
      null;
    if (!rivalEscapes(lane)) return null;
    const reach = style.trapping === 'near' ? 1 : 2;
    const options = safe.filter(
      (candidate) =>
        candidate !== lane &&
        candidate !== rivalLane &&
        Math.abs(candidate - lane) <= reach &&
        !rivalEscapes(candidate) &&
        route(courseOf(drive, style.pressGap, wall), lane, drive.roadTime, deadline, [
          candidate,
        ]) !== null,
    );
    return options.sort((a, b) => Math.abs(a - lane) - Math.abs(b - lane))[0] ?? null;
  };

  /** The next step towards a lane that is safe at `row`, going round the rival's car. */
  const escapeLane = (drive: Drive, row: Row, lane: number, wall: number | null) => {
    const safe = lanesPast(drive.road, row);
    if (safe.includes(lane)) return lane;
    const deadline = arrivalOf(drive, row);
    const move =
      route(courseOf(drive, style.pressGap, wall), lane, drive.roadTime, deadline, safe) ??
      // Boxed in, or too late: head for a safe lane anyway.
      route(courseOf(drive, STEP_SECONDS, null), lane, drive.roadTime, deadline, safe);
    return move && move !== 'stay' && move !== 'wait' ? move.to : null;
  };

  return {
    decide,
    get trapAttempts() {
      return trapAttempts;
    },
  };
}

/**
 * The rows it has seen for long enough to act on, nearest first. Drivers who
 * read the whole road also count a lane's end, from its "lane ends" sign.
 */
function rowsInView(
  drive: Drive,
  knows: (drive: Drive, key: string) => boolean,
  readsEnds: boolean,
): Row[] {
  const rows = new Map<number, number[]>();
  for (const hazard of drive.hazards) {
    if (hazard.kind === 'carrot' || !hazard.revealed || hazard.passed) continue;
    if (gapOf(drive, hazard) <= 0 || !knows(drive, `${hazard.id}`)) continue;
    rows.set(hazard.position, [...(rows.get(hazard.position) ?? []), hazard.lane]);
  }
  if (readsEnds) {
    for (const change of endsInView(drive)) {
      if (!knows(drive, `end:${change.at}`)) continue;
      const position = change.barrier as number;
      if (!rows.has(position)) rows.set(position, [change.closes as number]);
    }
  }
  return [...rows].sort(([a], [b]) => a - b).map(([position, blocked]) => ({ position, blocked }));
}

/** Lane ends whose sign is in view and whose barrier is still ahead. */
function endsInView(drive: Drive): LaneChange[] {
  const { nose } = drive.car;
  return drive.road.changes.filter(
    (change) =>
      change.closes !== null &&
      change.barrier !== null &&
      change.at - nose <= SIGHT_DISTANCE &&
      change.barrier > nose,
  );
}

/** Nothing beside the car, or about to be, in `lane`: moving over now will not hit it. */
function clearBeside(drive: Drive, lane: number): boolean {
  return drive.hazards.every((hazard) => {
    if (hazard.kind === 'carrot' || !hazard.revealed || hazard.lane !== lane) return true;
    const gap = gapOf(drive, hazard);
    return !(gap <= drive.speed * 0.06 && gap > -(CAR_LENGTH + hazard.depth));
  });
}

function arrivalOf(drive: Drive, row: Row): number {
  return drive.roadTime + (row.position - drive.car.nose) / drive.speed;
}

/** Whether this lane is closing, or ends at a barrier in view. */
function isEnding(drive: Drive, lane: number): boolean {
  if (closingLaneAt(drive.road, drive.car.nose) === lane) return true;
  return endsInView(drive).some((change) => change.closes === lane);
}

/** One lane further onto the road, away from an ending lane. */
function intoTheRoad(drive: Drive, lane: number): number {
  const layout = layoutAt(drive.road, drive.car.nose);
  if (!inLayout(layout, lane)) {
    return lane < layout.first ? layout.first : layout.first + layout.count - 1;
  }
  // Still open here but ending ahead: it is on the edge the road is leaving.
  return lane === layout.first ? lane + 1 : lane - 1;
}

/** With nothing in view, the middle of the road keeps a way out on both sides. */
function middleLane(drive: Drive, lane: number, wall: number | null): number | null {
  const layout = layoutAt(drive.road, drive.car.nose);
  const middle = layout.first + 1;
  if (layout.count < 3 || middle === wall || lane === middle) return null;
  return middle;
}

/** The road just ahead as the driver judges it: at today's speed, with the rival's car as a wall. */
function courseOf(drive: Drive, pressSeconds: number, wall: number | null): Course {
  const { car, speed, roadTime, road } = drive;
  return {
    road,
    steering: 'two-button',
    slack: 0,
    pressSeconds,
    occupied: wall,
    positionAtTime: (time) => car.nose + (time - roadTime) * speed,
    timeAtPosition: (position) => roadTime + (position - car.nose) / speed,
  };
}
