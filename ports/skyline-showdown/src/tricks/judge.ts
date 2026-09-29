import { BANANA_RADIUS, GORILLA_SIZE, STEPS_PER_SECOND } from '../engine/constants';
import { discTouchesRect, type Point } from '../engine/geometry';
import { gorillaHitboxes } from '../engine/gorillas';
import type { ShotEvent, ShotRecord } from '../engine/shot';
import { BELL_RADIUS, CRATE_SIZE, HOOP_RADIUS } from '../engine/targets';
import { METRES_PER_UNIT } from '../game/so-close';
import { PAD_RADIUS_METRES, type BuiltPuzzle, type PlacedTarget, type StyleGoal } from './puzzle';

/**
 * Whether one throw solves a puzzle, and with style. Everything is read
 * from the shot the engine recorded: which targets it reached, whether it
 * met the rule, and how close it came when it did not. Distances are
 * compared squared, so the verdict is exact in every browser too.
 */
export type Failure =
  /** Not every target was reached. */
  | 'missed'
  | 'selfHit'
  /** The rule asked for the sun. */
  | 'noSun'
  /** The rule asked for two bounces. */
  | 'fewBounces'
  /** The rule asked for every banana, and one strayed. */
  | 'strayBanana';

export interface Verdict {
  solved: boolean;
  failure: Failure | null;
  /** The style goal was met on a solving throw. */
  styled: boolean;
  /** Which targets were reached, in the puzzle's order. */
  reached: boolean[];
  /** How near the closest banana came to the first target missed; 0 when all were reached. */
  metres: number;
  /** Where that banana came to rest, for the "so close" marker. */
  landing: Point;
}

const UNITS_PER_METRE = 1 / METRES_PER_UNIT;

export function judgeThrow(built: BuiltPuzzle, shot: ShotRecord): Verdict {
  const { puzzle, targets, thrower } = built;
  const arrivals = targets.map((target) => arrivalAt(target, shot));
  const reached = arrivals.map((arrival) => arrival !== null);

  const failure = failureOf(built, shot, reached);
  const solved = failure === null;
  const missing = targets.findIndex((_, index) => !reached[index]);
  const focus = targets[missing === -1 ? targets.length - 1 : missing] as PlacedTarget;
  const approach = closestApproach(shot, focus.centre);
  const last = arrivals.at(-1) ?? null;
  const gap = Math.sqrt(approach.distanceSquared) - reach(focus);

  return {
    solved,
    failure,
    styled: solved && last !== null && meetsStyle(puzzle.style, built, shot, last),
    reached,
    metres: missing === -1 ? 0 : Math.max(0.1, Math.round(gap * METRES_PER_UNIT * 10) / 10),
    landing: shot.victim === thrower || !last ? approach.landing : last.landing,
  };
}

/** The event with which a banana reached this target, if one did. */
interface Arrival {
  event: ShotEvent;
  landing: Point;
}

function arrivalAt(target: PlacedTarget, shot: ShotRecord): Arrival | null {
  const event = shot.events.find((candidate) => reaches(candidate, target));
  return event ? { event, landing: { x: event.x, y: event.y } } : null;
}

function reaches(event: ShotEvent, target: PlacedTarget): boolean {
  switch (target.kind) {
    case 'dummy':
      return event.type === 'gorilla' && event.player === target.player;
    case 'pad':
      return (
        event.type === 'explosion' &&
        event.building === target.building &&
        within(event, target.centre, PAD_RADIUS_METRES * UNITS_PER_METRE)
      );
    default:
      return event.type === 'target' && event.target === target.engineIndex;
  }
}

function failureOf(built: BuiltPuzzle, shot: ShotRecord, reached: boolean[]): Failure | null {
  if (shot.victim === built.thrower) return 'selfHit';
  if (reached.includes(false)) return 'missed';
  const { events } = shot;
  switch (built.puzzle.rule) {
    case 'sun':
      return events.some((event) => event.type === 'sun') ? null : 'noSun';
    case 'bounceTwice':
      return events.filter((event) => event.type === 'bounce').length >= 2 ? null : 'fewBounces';
    case 'allBananas':
      return everyBananaArrived(built, shot) ? null : 'strayBanana';
    default:
      return null;
  }
}

/**
 * The Tri-Banana split, and every banana that flew to the end came down on
 * a target. (A throw with no rise never splits, which would dodge the rule.)
 */
function everyBananaArrived(built: BuiltPuzzle, shot: ShotRecord): boolean {
  if (!shot.events.some((event) => event.type === 'split')) return false;
  return shot.tracks.every((track) => {
    const ending = shot.events.filter((event) => event.banana === track.id).at(-1);
    if (!ending) return false;
    return ending.type === 'split' || built.targets.some((target) => reaches(ending, target));
  });
}

function meetsStyle(
  style: StyleGoal,
  built: BuiltPuzzle,
  shot: ShotRecord,
  last: Arrival,
): boolean {
  const main = built.targets.at(-1) as PlacedTarget;
  switch (style.kind) {
    case 'bullseye':
      return within(last.landing, main.centre, style.metres * UNITS_PER_METRE);
    case 'sun':
      return shot.events.some((event) => event.type === 'sun');
    case 'quick':
      return last.event.step <= style.seconds * STEPS_PER_SECOND;
    case 'sky':
      return shot.tracks.some((track) => track.points.some((point) => point.y < 0));
    case 'clean':
      return !shot.events.some((event) => event.type === 'explosion');
    case 'bonk': {
      if (main.kind !== 'dummy') return false;
      const head = gorillaHitboxes(built.round.gorillas[main.player])[0];
      return (
        head !== undefined && discTouchesRect(last.landing.x, last.landing.y, BANANA_RADIUS, head)
      );
    }
  }
}

/** How far from a target's middle a banana still touches it. */
function reach(target: PlacedTarget): number {
  switch (target.kind) {
    case 'dummy':
      return GORILLA_SIZE / 2;
    case 'crate':
      return CRATE_SIZE / 2 + BANANA_RADIUS;
    case 'bell':
      return BELL_RADIUS + BANANA_RADIUS;
    case 'hoop':
      return HOOP_RADIUS;
    case 'pad':
      return PAD_RADIUS_METRES * UNITS_PER_METRE;
  }
}

function closestApproach(
  shot: ShotRecord,
  centre: Point,
): { distanceSquared: number; landing: Point } {
  let best = { distanceSquared: Infinity, landing: centre };
  for (const track of shot.tracks) {
    const closest = Math.min(...track.points.map((point) => distanceSquared(point, centre)));
    if (closest < best.distanceSquared) {
      best = { distanceSquared: closest, landing: track.points.at(-1) ?? centre };
    }
  }
  return best;
}

export function distanceSquared(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function within(point: Point, centre: Point, radius: number): boolean {
  return distanceSquared(point, centre) <= radius * radius;
}
