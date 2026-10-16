import { createRng } from '@shared/rng';
import { CAR_LENGTH, PRESS_SECONDS, SIGHT_DISTANCE, STEP_SECONDS } from './constants';
import { gapOf, type Drive } from './drive';
import { lanesPast, route, type Course } from './reach';
import { closingLaneAt, inLayout, layoutAt, type LaneChange } from './road';
import {
  AHEAD_DISTANCE,
  cellsOf,
  NO_INPUT,
  noseOf,
  rowsOf,
  SHIFT_SECONDS,
  type RivalCar,
  type RivalInput,
  type RivalSide,
  type RivalState,
  type Row,
} from './rival';

/**
 * The CPU rival in Rival Driver. It plays by a human's rules: it only knows
 * what is in view (less of the road when it rides Ahead), it reacts after a
 * delay, it presses no faster than a thumb, and now and then it hesitates or
 * misjudges a row. What changes from level to level is how it treats the
 * other car:
 *
 * - Easy only gets out of the way of trouble, and never surges.
 * - Normal sometimes steps into the lane next to it that you need, and now
 *   and then, pinned against the edge of the road beside you, surges, cuts
 *   across in front of you and drops back on the other side.
 * - Hard reads everything in view, lane ends included, and boxes you in on
 *   purpose: across, or by surging or dropping back into your row. It slips
 *   out of boxes the same way, more often; when you ride Ahead it follows
 *   you there, or slides in behind you so that you cannot drop back.
 * - Brutal does all that, and stays out of boxes itself: it leaves a
 *   threatened lane without dithering and waits in the middle lane, where it
 *   has a way out on both sides.
 *
 * It finds its way past each row with the planner's own search (reach.ts),
 * counting your car as a wall when it rides in the same row.
 */
export type CpuLevel = 'easy' | 'normal' | 'hard' | 'brutal';

export const CPU_LEVELS: readonly CpuLevel[] = ['easy', 'normal', 'hard', 'brutal'];

export interface DriverStyle {
  reactionSeconds: number;
  /**
   * Up to this much longer, at random, to react to each thing it sees.
   * People are not metronomes; the CPU levels are steadier (0).
   */
  reactionSpread: number;
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
  /**
   * When it surges or drops back: never; only to slip out of a box; or also
   * on purpose, to take a lane you need or to shut you out of your Level slot.
   */
  surging: 'never' | 'escape' | 'tactical';
  /** The chance of surging, dropping back or sliding in behind you when it sees a reason to. */
  surgeChance: number;
  /**
   * How much it likes riding Ahead for the meter's bonus while the road is
   * quiet, from 0 (never) to 1 (whenever it can). The CPU levels never do; the
   * scripted players in the playtests do, as people will.
   */
  ridesAhead: number;
}

/**
 * Tuned against scripted players over 100 matches each (drive.playtest.ts
 * keeps a shorter run of it): a casual phone player who never surges beats
 * Easy about three times in five, Normal two in five, Hard one in four and
 * Brutal one in fourteen, as before the surge; a quick player who also holds
 * the middle lane beats Brutal a bit more than one time in three. Against
 * Easy, Normal surges about one and a half times a minute, Hard three times
 * and Brutal four, and the last two pass about one row in seven Ahead.
 */
export const CPU_STYLES: Record<CpuLevel, DriverStyle> = {
  easy: {
    reactionSeconds: 0.5,
    reactionSpread: 0,
    pressGap: 0.22,
    trapping: 'never',
    trapChance: 0,
    wary: false,
    hesitation: 0.3,
    blunder: 0.05,
    surging: 'never',
    surgeChance: 0,
    ridesAhead: 0,
  },
  normal: {
    reactionSeconds: 0.42,
    reactionSpread: 0,
    pressGap: 0.19,
    trapping: 'near',
    trapChance: 0.35,
    wary: false,
    hesitation: 0.22,
    blunder: 0.03,
    surging: 'escape',
    surgeChance: 0.3,
    ridesAhead: 0,
  },
  hard: {
    reactionSeconds: 0.36,
    reactionSpread: 0,
    pressGap: 0.17,
    trapping: 'anywhere',
    trapChance: 0.7,
    wary: false,
    hesitation: 0.18,
    blunder: 0.025,
    surging: 'tactical',
    surgeChance: 0.6,
    ridesAhead: 0,
  },
  brutal: {
    reactionSeconds: 0.32,
    reactionSpread: 0,
    pressGap: 0.16,
    trapping: 'anywhere',
    trapChance: 0.9,
    wary: true,
    hesitation: 0.14,
    blunder: 0.02,
    surging: 'tactical',
    surgeChance: 0.85,
    ridesAhead: 0,
  },
};

export interface RivalDriver {
  /** This step's presses. */
  decide(state: RivalState): RivalInput;
  /** Traps it has gone for so far: across, by changing rows, or by shutting a door. The tests count them. */
  readonly trapAttempts: number;
  /** Surges it has started. */
  readonly surges: number;
}

/** Something ahead that rules lanes out: a row of donkeys, or a lane's end. */
interface Sighting {
  position: number;
  blocked: number[];
}

/** What it means to do this step. */
type Plan = { kind: 'lane'; to: number } | { kind: 'shift'; to: Row };

export function createRivalDriver(style: DriverStyle, side: RivalSide, seed: number): RivalDriver {
  const rng = createRng(seed);
  /** When it will have taken in each thing it has seen. */
  const seenAt = new Map<string, number>();
  /** Per row: whether it misjudged it, and whether it chose to go for a trap there. */
  const blunders = new Map<number, boolean>();
  const trapRolls = new Map<number, boolean>();
  /** Per chance to slip out of a box or shut a door: whether it took it. */
  const chances = new Map<string, boolean>();
  let lastPress = -Infinity;
  let waitUntil = -Infinity;
  let trapAttempts = 0;
  let surges = 0;
  let round = 0;
  /** The lane it is cutting across to, Ahead, before it drops back. */
  let crossTo: number | null = null;

  /** Whether it has seen something for long enough to act on it. */
  const knows = (drive: Drive, key: string) => {
    let ready = seenAt.get(key);
    if (ready === undefined) {
      const late = style.reactionSpread > 0 ? rng.float(0, style.reactionSpread) : 0;
      ready = drive.roadTime + style.reactionSeconds + late;
      seenAt.set(key, ready);
    }
    return drive.roadTime >= ready - STEP_SECONDS / 2;
  };

  /** Rolls once for each chance, as often as the style likes. */
  const takes = (key: string, chance = style.surgeChance) => {
    if (!chances.has(key)) chances.set(key, rng.chance(chance));
    return chances.get(key) as boolean;
  };

  const decide = (state: RivalState): RivalInput => {
    if (state.round !== round) {
      // A new road: forget the old one.
      round = state.round;
      seenAt.clear();
      blunders.clear();
      trapRolls.clear();
      chances.clear();
      lastPress = -Infinity;
      waitUntil = -Infinity;
      crossTo = null;
    }
    const me = state.cars[side];
    const them = state.cars[side === 0 ? 1 : 0];
    if (me.state === 'crashed') crossTo = null;
    // Mid-surge or mid-drop it can do nothing but wait.
    if (me.state === 'crashed' || state.phase.kind !== 'race' || me.shiftedAt !== null) {
      return NO_INPUT;
    }
    const drive = viewFrom(state, me);
    const sightings = inView(drive, knows, style.trapping === 'anywhere');
    if (drive.roadTime - lastPress < style.pressGap || drive.roadTime < waitUntil) return NO_INPUT;

    const wall = blocksRow(them, me.row) ? them.lane : null;
    const first = sightings[0];
    let plan: Plan | null;
    let fleeing = false;
    if (first) {
      if (!blunders.has(first.position)) blunders.set(first.position, rng.chance(style.blunder));
      if (blunders.get(first.position)) return NO_INPUT;
      plan = goForTrap(state, drive, first, me, them, wall);
      if (!plan) {
        plan = escape(state, drive, first, me, them, wall);
        fleeing = plan !== null;
      }
      // Safe where it is past everything in view: time enough to follow the rival Ahead.
      const settled = sightings.every((row) => lanesPast(drive.road, row).includes(me.lane));
      if (!plan && me.row === 'level' && settled) plan = follow(me, them);
    } else if (isEnding(drive, me.lane)) {
      plan = { kind: 'lane', to: intoTheRoad(drive, me.lane) };
    } else if (me.row === 'ahead') {
      plan = cutAcross(drive, me, them) ?? backToLevel(drive, me, them);
    } else {
      plan =
        shutTheDoor(drive, me, them) ??
        follow(me, them) ??
        unpin(drive, me, them) ??
        rideAhead(drive, me, them);
      if (!plan && style.wary) {
        const middle = middleLane(drive, me.lane, wall);
        if (middle !== null) plan = { kind: 'lane', to: middle };
      }
    }

    if (!plan) return NO_INPUT;
    if (plan.kind === 'lane') {
      if (plan.to === me.lane) return NO_INPUT;
      if (!clearBeside(drive, plan.to < me.lane ? me.lane - 1 : me.lane + 1)) return NO_INPUT;
    }
    if (!(style.wary && fleeing) && rng.chance(style.hesitation)) {
      waitUntil = drive.roadTime + rng.float(0.05, 0.2);
      return NO_INPUT;
    }
    lastPress = drive.roadTime;
    if (plan.kind === 'shift') {
      if (plan.to === 'ahead') surges += 1;
      return plan.to === 'ahead' ? { ...NO_INPUT, surge: true } : { ...NO_INPUT, drop: true };
    }
    return plan.to < me.lane ? { ...NO_INPUT, left: true } : { ...NO_INPUT, right: true };
  };

  /**
   * A trap worth going for at `row`, once per row and only as often as the
   * style likes: across into a lane the rival needs, when both ride in the
   * same row; or, tactically, a surge or a drop back into the rival's row,
   * which shuts it out of this car's lane.
   */
  const goForTrap = (
    state: RivalState,
    drive: Drive,
    row: Sighting,
    me: RivalCar,
    them: RivalCar,
    wall: number | null,
  ): Plan | null => {
    if (style.trapping === 'never' || them.state !== 'racing') return null;
    const theirs = viewFrom(state, them);
    let plan: Plan | null = null;
    if (wall !== null) {
      const lane = trapLane(drive, theirs, row, me.lane, them.lane, wall);
      if (lane !== null) plan = { kind: 'lane', to: lane };
    } else if (style.surging === 'tactical' && them.shiftedAt === null) {
      plan = rowTrap(drive, theirs, row, me, them);
    }
    if (!plan) return null;
    if (!trapRolls.has(row.position)) {
      const going = rng.chance(style.trapChance);
      trapRolls.set(row.position, going);
      if (going) trapAttempts += 1;
    }
    return trapRolls.get(row.position) ? plan : null;
  };

  /**
   * A lane, other than its own, that is safe for this car at `row` and that,
   * with this car in it, leaves the rival no way past the row, when right now
   * it still has one.
   */
  const trapLane = (
    drive: Drive,
    theirs: Drive,
    row: Sighting,
    lane: number,
    rivalLane: number,
    wall: number,
  ): number | null => {
    const safe = lanesPast(drive.road, row);
    if (safe.includes(rivalLane)) return null;
    const deadline = arrivalOf(drive, row);
    if (!escapes(theirs, row, rivalLane, lane)) return null;
    const reach = style.trapping === 'near' ? 1 : 2;
    const options = safe.filter(
      (candidate) =>
        candidate !== lane &&
        candidate !== rivalLane &&
        Math.abs(candidate - lane) <= reach &&
        !escapes(theirs, row, rivalLane, candidate) &&
        route(courseOf(drive, style.pressGap, wall), lane, drive.roadTime, deadline, [
          candidate,
        ]) !== null,
    );
    return options.sort((a, b) => Math.abs(a - lane) - Math.abs(b - lane))[0] ?? null;
  };

  /**
   * Into the rival's row, staying in its own lane, when that takes away the
   * rival's way past `row`: this car's lane is safe there, the rival's is
   * not, the cell is free, and there is time to change rows.
   */
  const rowTrap = (
    drive: Drive,
    theirs: Drive,
    row: Sighting,
    me: RivalCar,
    them: RivalCar,
  ): Plan | null => {
    const safe = lanesPast(drive.road, row);
    if (!safe.includes(me.lane) || safe.includes(them.lane)) return null;
    if (cellsOf(them).includes(`${me.lane}:${them.row}`)) return null;
    if (arrivalOf(theirs, row) - drive.roadTime < SHIFT_SECONDS) return null;
    if (!escapes(theirs, row, them.lane, null) || escapes(theirs, row, them.lane, me.lane)) {
      return null;
    }
    return { kind: 'shift', to: them.row };
  };

  /**
   * The next step towards a lane that is safe at `row`, going round the
   * rival's car; or, when the rival boxes it in, a surge (or a drop back) out
   * of its row, to cut across in front of it (or behind it).
   */
  const escape = (
    state: RivalState,
    drive: Drive,
    row: Sighting,
    me: RivalCar,
    them: RivalCar,
    wall: number | null,
  ): Plan | null => {
    const safe = lanesPast(drive.road, row);
    if (safe.includes(me.lane)) return null;
    const deadline = arrivalOf(drive, row);
    const around = route(
      courseOf(drive, style.pressGap, wall),
      me.lane,
      drive.roadTime,
      deadline,
      safe,
    );
    if (around && around !== 'stay' && around !== 'wait') return { kind: 'lane', to: around.to };
    if (wall !== null && style.surging !== 'never') {
      const slip = slipOut(state, row, me, them, safe);
      if (slip) return slip;
    }
    // Boxed in, or too late: head for a safe lane anyway.
    const anyway = route(
      courseOf(drive, STEP_SECONDS, null),
      me.lane,
      drive.roadTime,
      deadline,
      safe,
    );
    return anyway && anyway !== 'stay' && anyway !== 'wait'
      ? { kind: 'lane', to: anyway.to }
      : null;
  };

  /**
   * A surge (or a drop back) out of the rival's row, when from the other row,
   * once there, it can still reach a safe lane in time: the rival's car is no
   * wall in a row it does not ride in.
   */
  const slipOut = (
    state: RivalState,
    row: Sighting,
    me: RivalCar,
    them: RivalCar,
    safe: number[],
  ): Plan | null => {
    const to: Row = me.row === 'level' ? 'ahead' : 'level';
    if (cellsOf(them).includes(`${me.lane}:${to}`)) return null;
    if (!takes(`slip:${row.position}`)) return null;
    const there = viewAt(state, to);
    const wall = blocksRow(them, to) ? them.lane : null;
    const move = route(
      courseOf(there, style.pressGap, wall),
      me.lane,
      there.roadTime + SHIFT_SECONDS,
      arrivalOf(there, row),
      safe,
    );
    return move ? { kind: 'shift', to } : null;
  };

  /**
   * With the rival riding Ahead in the lane next door and the road quiet,
   * slide in behind it: with its Level slot taken it cannot drop back, and
   * must stay Ahead, seeing less, or change lanes first.
   */
  const shutTheDoor = (drive: Drive, me: RivalCar, them: RivalCar): Plan | null => {
    if (style.surging !== 'tactical' || me.row !== 'level' || !settledIn(them, 'ahead'))
      return null;
    if (Math.abs(them.lane - me.lane) !== 1) return null;
    if (!inLayout(layoutAt(drive.road, drive.car.nose), them.lane)) return null;
    if (!clearBeside(drive, them.lane)) return null;
    // One chance for each time the rival settles Ahead in a lane.
    const chance = `door:${them.lane}:${them.switchedAt}`;
    const fresh = !chances.has(chance);
    if (!takes(chance)) return null;
    if (fresh) trapAttempts += 1;
    return { kind: 'lane', to: them.lane };
  };

  /**
   * Pinned against the edge of the road with the rival Level beside it, and
   * the road quiet: surge, so it can cut across in front of the rival.
   */
  const unpin = (drive: Drive, me: RivalCar, them: RivalCar): Plan | null => {
    if (style.surging === 'never' || !settledIn(them, 'level')) return null;
    const away = me.lane - them.lane;
    if (Math.abs(away) !== 1) return null;
    const layout = layoutAt(drive.road, drive.car.nose);
    const beyond = them.lane - away;
    if (inLayout(layout, me.lane + away) || !inLayout(layout, beyond)) return null;
    if (!takes(`pin:${me.switchedAt}:${them.switchedAt}`)) return null;
    crossTo = beyond;
    return { kind: 'shift', to: 'ahead' };
  };

  /** Ahead, one lane at a time towards the lane it surged to reach, in front of the rival. */
  const cutAcross = (drive: Drive, me: RivalCar, them: RivalCar): Plan | null => {
    if (crossTo === null) return null;
    const layout = layoutAt(drive.road, drive.car.nose);
    if (me.lane === crossTo || !inLayout(layout, crossTo)) {
      crossTo = null;
      return null;
    }
    const next = crossTo < me.lane ? me.lane - 1 : me.lane + 1;
    if (cellsOf(them).includes(`${next}:ahead`)) {
      crossTo = null;
      return null;
    }
    return { kind: 'lane', to: next };
  };

  /**
   * Back to Level while the road is quiet, where it sees the most road,
   * unless it likes the bonus Ahead. With the door shut behind it, it tries
   * once, as a person would, and then waits for the rival to move.
   */
  const backToLevel = (drive: Drive, me: RivalCar, them: RivalCar): Plan | null => {
    // Riding Ahead alongside a rival who does: back at Level it could not box the rival in.
    if (style.surging === 'tactical' && settledIn(them, 'ahead')) return null;
    if (style.ridesAhead > 0 && takes(`stay:${Math.floor(drive.roadTime / 2)}`, style.ridesAhead)) {
      return null;
    }
    if (cellsOf(them).includes(`${me.lane}:level`)) {
      const shut = `shut:${them.switchedAt}`;
      if (chances.has(shut)) return null;
      chances.set(shut, true);
    }
    return { kind: 'shift', to: 'level' };
  };

  /**
   * With the rival riding Ahead, out of reach of a Level car, surge to ride
   * level with it again, further up the road, where it can be boxed in.
   */
  const follow = (me: RivalCar, them: RivalCar): Plan | null => {
    if (style.surging !== 'tactical' || !settledIn(them, 'ahead')) return null;
    if (cellsOf(them).includes(`${me.lane}:ahead`)) return null;
    if (!takes(`follow:${them.lane}:${them.switchedAt}`)) return null;
    return { kind: 'shift', to: 'ahead' };
  };

  /** While the road is quiet, now and then, Ahead for the bonus, if it likes that. */
  const rideAhead = (drive: Drive, me: RivalCar, them: RivalCar): Plan | null => {
    if (style.ridesAhead <= 0 || cellsOf(them).includes(`${me.lane}:ahead`)) return null;
    if (!takes(`ride:${Math.floor(drive.roadTime / 2)}`, style.ridesAhead)) return null;
    return { kind: 'shift', to: 'ahead' };
  };

  return {
    decide,
    get trapAttempts() {
      return trapAttempts;
    },
    get surges() {
      return surges;
    },
  };
}

/** Whether a car is on the road, riding in `row` and not surging or dropping back. */
function settledIn(car: RivalCar, row: Row): boolean {
  return car.state === 'racing' && car.row === row && car.shiftedAt === null;
}

/** Whether a car stands in the way of moves made in `row`. */
function blocksRow(car: RivalCar, row: Row): boolean {
  return car.state === 'racing' && rowsOf(car).includes(row);
}

/** The road as a car sees it: the shared road, from that car's own nose. */
function viewFrom(state: RivalState, car: RivalCar): Drive {
  return { ...state.drive, car: { ...state.drive.car, nose: noseOf(state, car) } };
}

/** The road as a car would see it riding in `row`. */
function viewAt(state: RivalState, row: Row): Drive {
  const nose = state.drive.car.nose + (row === 'ahead' ? AHEAD_DISTANCE : 0);
  return { ...state.drive, car: { ...state.drive.car, nose } };
}

/** Whether a car in `lane`, seeing the road as `drive`, can still get past `row` with `blocker` in its way. */
function escapes(drive: Drive, row: Sighting, lane: number, blocker: number | null): boolean {
  const safe = lanesPast(drive.road, row);
  const course = courseOf(drive, PRESS_SECONDS, blocker);
  return route(course, lane, drive.roadTime, arrivalOf(drive, row), safe) !== null;
}

/**
 * The rows it has seen for long enough to act on, nearest first. Drivers who
 * read the whole road also count a lane's end, from its "lane ends" sign.
 */
function inView(
  drive: Drive,
  knows: (drive: Drive, key: string) => boolean,
  readsEnds: boolean,
): Sighting[] {
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

function arrivalOf(drive: Drive, row: Sighting): number {
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
