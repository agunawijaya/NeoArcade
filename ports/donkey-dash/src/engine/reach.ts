import { MUD_DELAY, PRESS_SECONDS, REACTION_SECONDS } from './constants';
import { isMuddy, pavedLanes, pressTarget, stepTarget, type Road } from './road';

/**
 * The proof behind every planned road: a player who reacts in
 * REACTION_SECONDS and presses no faster than PRESS_SECONDS can always get
 * past the next obstacle, from wherever the one before left them.
 *
 * An obstacle is a row of donkeys or the barrier at the end of a closing
 * lane. Between two obstacles the road may change shape: a lane opens and can
 * be entered from that point on, a lane starts closing and can no longer be
 * entered. So the search below walks through time, not just lanes: it may
 * press, or wait for the road to change, and every press goes where the real
 * buttons would send the car at that moment (see `pressTarget` and
 * `stepTarget`). It is small, since there are four lanes at most and a few
 * presses between two obstacles.
 *
 * The autopilot and the CPU rival drive with the same search, so they find
 * every way past that the planner proved is there.
 */
export type Steering = 'one-button' | 'two-button';

export interface Obstacle {
  position: number;
  /** Road time at which the car's nose reaches it. */
  arrival: number;
  /** Road time from which a player can know where it will be: it comes into view, or a hesitant donkey settles. */
  known: number;
  /** Seconds the car takes to drive past it. */
  clear: number;
  blocked: readonly number[];
}

/** Where a player may be once an obstacle is behind them, and from when they are free to move. */
export interface Standing {
  lanes: readonly number[];
  clearedAt: number;
}

export interface Course {
  road: Road;
  steering: Steering;
  timeAtPosition(position: number): number;
  positionAtTime(time: number): number;
  /** Seconds of room beyond what a quick player needs after clearing one obstacle. */
  slack: number;
  /** Seconds from one press to the next; PRESS_SECONDS unless a driver is slower. */
  pressSeconds?: number;
  /** A lane the car may not enter: the other car's, in Rival Driver. */
  occupied?: number | null;
}

/** The first thing to do on the way: already there, wait for now, or move to this lane. */
export type FirstMove = 'stay' | 'wait' | { to: number };

/** No pattern ever needs more presses than this between two obstacles. */
const MOST_MOVES = 4;

/** The lanes a car can be in as it drives past an obstacle unharmed. */
export function lanesPast(road: Road, obstacle: Pick<Obstacle, 'position' | 'blocked'>): number[] {
  return pavedLanes(road, obstacle.position).filter((lane) => !obstacle.blocked.includes(lane));
}

export function standingAfter(road: Road, obstacle: Obstacle): Standing {
  return { lanes: lanesPast(road, obstacle), clearedAt: obstacle.arrival + obstacle.clear };
}

/** Whether, from every lane in `from`, some lane past `next` can be reached in time. */
export function canGetPast(course: Course, from: Standing, next: Obstacle): boolean {
  const targets = lanesPast(course.road, next);
  if (targets.length === 0) return false;
  const start = Math.max(from.clearedAt + course.slack, next.known + REACTION_SECONDS);
  return from.lanes.every(
    (lane) => search(course, lane, start, next.arrival, targets, MOST_MOVES) !== null,
  );
}

/**
 * The way from `lane` at `time` into one of `targets` before `deadline` with
 * the fewest moves, as its first step; null if there is none. Moving at once
 * is tried before waiting, so a driver following it leaves a lane early.
 */
export function route(
  course: Course,
  lane: number,
  time: number,
  deadline: number,
  targets: readonly number[],
): FirstMove | null {
  for (let moves = 0; moves <= MOST_MOVES; moves++) {
    const first = search(course, lane, time, deadline, targets, moves);
    if (first !== null) return first;
  }
  return null;
}

function search(
  course: Course,
  lane: number,
  time: number,
  deadline: number,
  targets: readonly number[],
  movesLeft: number,
): FirstMove | null {
  if (targets.includes(lane)) return 'stay';
  if (movesLeft === 0) return null;
  const { road } = course;
  const muddy = isMuddy(road, course.positionAtTime(time), lane);
  // A press in mud goes through late; either way the next one comes a press later.
  const lands = time + (muddy ? MUD_DELAY : 0);
  const free = lands + (course.pressSeconds ?? PRESS_SECONDS);
  if (free <= deadline) {
    const where = course.positionAtTime(lands);
    for (const next of movesFrom(course, where, lane)) {
      if (search(course, next, free, deadline, targets, movesLeft - 1) !== null)
        return { to: next };
    }
  }
  // Or hold on until the road changes shape, and see what can be done then.
  const change = nextChangeTime(course, time);
  if (change === null || change >= deadline) return null;
  return search(course, lane, change, deadline, targets, movesLeft) === null ? null : 'wait';
}

function movesFrom(course: Course, position: number, lane: number): number[] {
  const moves =
    course.steering === 'one-button'
      ? [pressTarget(course.road, position, lane)]
      : ([-1, 1] as const)
          .map((direction) => stepTarget(course.road, position, lane, direction))
          .filter((next): next is number => next !== null);
  return moves.filter((next) => next !== lane && next !== course.occupied);
}

/** The first moment after `time` when the car reaches a point where lanes open or close. */
function nextChangeTime(course: Course, time: number): number | null {
  const position = course.positionAtTime(time);
  for (const change of course.road.changes) {
    if (change.at < position - 1) continue;
    const reached = course.timeAtPosition(change.at);
    if (reached > time + 1e-9) return reached;
  }
  return null;
}
