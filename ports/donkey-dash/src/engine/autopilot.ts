import { CAR_LENGTH, STEP_SECONDS } from './constants';
import { gapOf, type Drive } from './drive';
import type { Hazard } from './hazards';
import { lanesPast, route, type Course, type FirstMove } from './reach';
import { closingLaneAt, inLayout, layoutAt, pressTarget, type LaneChange } from './road';
import { revealGap } from './sight';

/**
 * A driver with human limits: it only reacts to what has been in view for
 * `reactionSeconds`, presses at most once every `pressGap` seconds, and waits
 * for a hesitant donkey to commit before trusting its lane. It finds its way
 * past each obstacle with the same search the planner uses to prove there is
 * one (reach.ts). It powers the title screen's demo, proves in the tests that
 * every planned road can be driven, and plays the scripted playtests.
 */
export interface AutopilotOptions {
  reactionSeconds: number;
  pressGap: number;
  /** Stays in a donkey's lane until this many seconds before it would hit, to farm near misses. */
  daring?: number;
  /** Goes for carrots in free lanes. */
  greedy?: boolean;
}

export interface Autopilot {
  /** Whether to press this step. */
  decide(drive: Drive): boolean;
}

export function createAutopilot({
  reactionSeconds,
  pressGap,
  daring = 0,
  greedy = true,
}: AutopilotOptions): Autopilot {
  // A hesitant donkey is noticed twice: when it appears, and again when it settles.
  const noticedAt = new Map<string, number>();
  let lastPress = -Infinity;

  const noticed = (drive: Drive, key: string) => {
    const since = noticedAt.get(key);
    if (since === undefined) {
      noticedAt.set(key, drive.roadTime);
      return false;
    }
    return drive.roadTime - since >= reactionSeconds - STEP_SECONDS / 2;
  };
  const knows = (drive: Drive, hazard: Hazard) =>
    hazard.revealed &&
    !hazard.passed &&
    !hazard.hit &&
    !hazard.collected &&
    noticed(drive, `${hazard.id}:${hazard.committed}`);
  // A lane's end is known once its "lane ends" sign has been in view long enough.
  const seeEnds = (drive: Drive) => {
    const ends = new Set<LaneChange>();
    for (const change of drive.road.changes) {
      if (change.closes === null || change.at - drive.car.nose > revealGap(drive.climb)) continue;
      if (noticed(drive, `lane-end:${change.at}`)) ends.add(change);
    }
    return ends;
  };

  return {
    decide(drive) {
      const { car } = drive;
      // Eyes keep watching between presses, so everything is noticed as it appears.
      const ends = seeEnds(drive);
      const known = drive.hazards.filter((hazard) => knows(drive, hazard));
      if (drive.roadTime - lastPress < pressGap || car.heldPresses.length > 0) return false;
      const nearby = known.filter(
        (hazard) => hazard.kind !== 'carrot' && (hazard.kind === 'barrier' || hazard.committed),
      );
      const ahead = nearby.filter((hazard) => gapOf(drive, hazard) > 0);
      const move = nextMove(drive, ahead, known, { pressGap, daring, greedy }, ends);
      if (move === null || move === 'stay' || move === 'wait') return false;
      if (!safeToEnter(drive, nearby, move.to)) return false;
      lastPress = drive.roadTime;
      return true;
    },
  };
}

interface Style {
  pressGap: number;
  daring: number;
  greedy: boolean;
}

/** What to do about the nearest row ahead, or, with nothing ahead, about an ending lane or a carrot. */
function nextMove(
  drive: Drive,
  obstacles: Hazard[],
  known: Hazard[],
  style: Style,
  ends: ReadonlySet<LaneChange>,
): FirstMove | null {
  const { car } = drive;
  const ahead = [...obstacles].sort((a, b) => a.position - b.position);
  const first = ahead[0];
  if (first) {
    const row = ahead.filter((hazard) => hazard.position - first.position < 0.5);
    const blocked = row.map((hazard) => hazard.lane);
    const seconds = gapOf(drive, first) / drive.speed;
    // Daring drivers wait for the last moment; everyone else leaves at once.
    if (style.daring > 0 && blocked.includes(car.lane) && seconds > style.daring + 0.02)
      return 'stay';
    const targets = lanesPast(drive.road, { position: first.position, blocked });
    const deadline = drive.roadTime + seconds;
    return (
      route(course(drive, style.pressGap), car.lane, drive.roadTime, deadline, targets) ??
      // Too slow to make it at its own pace: try anyway.
      route(course(drive, STEP_SECONDS), car.lane, drive.roadTime, deadline, targets)
    );
  }
  if (isEnding(drive, ends)) {
    const to = pressTarget(drive.road, car.nose, car.lane);
    return to === car.lane ? 'stay' : { to };
  }
  if (!style.greedy) return 'stay';
  const lane = carrotLane(drive, known);
  return lane === null || lane === car.lane
    ? 'stay'
    : { to: pressTarget(drive.road, car.nose, car.lane) };
}

/** Whether the car is in a lane that is closing, or that it has seen will close soon. */
function isEnding(drive: Drive, ends: ReadonlySet<LaneChange>): boolean {
  const { car, road } = drive;
  if (closingLaneAt(road, car.nose) === car.lane) return true;
  return road.changes.some(
    (change) =>
      change.closes === car.lane &&
      change.at > car.nose &&
      (change.barrier === null || change.barrier > car.nose) &&
      ends.has(change),
  );
}

/** The road just ahead as the driver judges it: at today's speed. */
function course(drive: Drive, pressSeconds: number): Course {
  const { car, speed, roadTime, road } = drive;
  return {
    road,
    steering: 'one-button',
    slack: 0,
    pressSeconds,
    positionAtTime: (time) => car.nose + (time - roadTime) * speed,
    timeAtPosition: (position) => roadTime + (position - car.nose) / speed,
  };
}

function carrotLane(drive: Drive, known: Hazard[]): number | null {
  const carrot = known
    .filter((hazard) => hazard.kind === 'carrot' && gapOf(drive, hazard) > 0)
    .sort((a, b) => a.position - b.position)[0];
  if (!carrot || !inLayout(layoutAt(drive.road, drive.car.nose), carrot.lane)) return null;
  return carrot.lane;
}

/** Moving into `lane` now must not run into a donkey or barrier beside or just ahead of the car. */
function safeToEnter(drive: Drive, obstacles: Hazard[], lane: number): boolean {
  return obstacles.every((hazard) => {
    if (hazard.lane !== lane) return true;
    const gap = gapOf(drive, hazard);
    return !(gap <= drive.speed * 0.06 && gap > -(CAR_LENGTH + hazard.depth));
  });
}
