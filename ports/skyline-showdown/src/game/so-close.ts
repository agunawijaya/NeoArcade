import type { Rng } from '@shared/rng';
import { landingX } from '../engine/ai';
import { GORILLA_SIZE } from '../engine/constants';
import type { Point } from '../engine/geometry';
import { gorillaCentre, otherPlayer, throwingHand, type Gorilla } from '../engine/gorillas';
import type { ShotRecord } from '../engine/shot';

/**
 * "So close!": after a miss, how close it came, in words a player can use.
 * A gorilla is about two metres tall, which sets the scale. The verdict is
 * judged the way the CPU judges its own throws: where the arc was heading
 * at the target's height. Short or long; over, when it passed right above
 * the target's head; blocked, when a building or the drone stopped an arc
 * that would have got there.
 */
export const METRES_PER_UNIT = 2 / GORILLA_SIZE;

export type Verdict = 'short' | 'long' | 'over' | 'blocked';

export interface Miss {
  /** How near the banana came to the target gorilla, in metres. */
  metres: number;
  verdict: Verdict;
  /** Where the closest banana came to rest (or was stopped). */
  landing: Point;
}

/** Closer than this, a miss counts as a whisker. */
const WHISKER_METRES = 1.5;
const CLOSE_METRES = 5;
/** Stopped this much short of where its arc was heading counts as blocked… */
const BLOCKED_UNITS = 40;
/** …as long as the arc was heading at least this near the target. */
const WOULD_HAVE_REACHED = 30;

export function judgeMiss(
  shot: ShotRecord,
  gorillas: readonly [Gorilla, Gorilla],
  gravity: number,
): Miss {
  const thrower = shot.input.thrower;
  const target = gorillas[otherPlayer(thrower)];
  const centre = gorillaCentre(target);
  const hand = throwingHand(gorillas[thrower], thrower);
  const towards = Math.sign(centre.x - hand.x) || 1;
  const needed = (centre.x - hand.x) * towards;
  const along = (x: number) => (x - hand.x) * towards;

  let best: { distance: number; track: ShotRecord['tracks'][number] } | null = null;
  for (const track of shot.tracks) {
    const distance = Math.min(
      ...track.points.map((point) => Math.hypot(point.x - centre.x, point.y - centre.y)),
    );
    if (!best || distance < best.distance) best = { distance, track };
  }
  if (!best) return { metres: 0, verdict: 'short', landing: centre };

  const { points } = best.track;
  const landing = points.at(-1) ?? centre;
  const heading = along(landingX(points, centre.y, gravity));
  const ending = shot.events.filter((event) => event.banana === best.track.id).at(-1)?.type;
  const stopped = ending === 'explosion' || ending === 'drone';
  const passedOver = points.some(
    (point) => Math.abs(point.x - centre.x) < GORILLA_SIZE / 2 && point.y < target.y,
  );

  let verdict: Verdict;
  if (
    stopped &&
    heading - along(landing.x) > BLOCKED_UNITS &&
    heading > needed - WOULD_HAVE_REACHED
  ) {
    verdict = 'blocked';
  } else if (passedOver && heading > needed) {
    verdict = 'over';
  } else {
    verdict = heading < needed ? 'short' : 'long';
  }
  const metres = Math.max(0.1, (best.distance - GORILLA_SIZE / 2) * METRES_PER_UNIT);
  return { metres: Math.round(metres * 10) / 10, verdict, landing };
}

const COMMENTS = {
  whisker: [
    'Just a banana’s width!',
    'Whiskers! So close.',
    'That one brushed the fur!',
    'A hair’s breadth!',
  ],
  short: [
    'Just short. A touch more power.',
    'Nearly there: a little harder.',
    'Short! Give it some beef.',
  ],
  long: ['A bit long. Ease off.', 'Overcooked it!', 'Long! Soften it a touch.'],
  over: ['Right over their head!', 'Sailed clean over!', 'Too high: it flew right past.'],
  blocked: ['The building took that one.', 'Blocked! Lob it higher.', 'Something was in the way.'],
  far: [
    'Wind got that one.',
    'New angle, maybe?',
    'Way off, but the city felt it.',
    'Shake it off.',
  ],
} as const;

/** One line for a miss, never the same line twice in a row. */
export function commentFor(miss: Miss, previous: string | null, rng: Rng): string {
  const pool =
    miss.verdict === 'blocked'
      ? COMMENTS.blocked
      : miss.metres <= WHISKER_METRES
        ? COMMENTS.whisker
        : miss.metres <= CLOSE_METRES
          ? COMMENTS[miss.verdict]
          : COMMENTS.far;
  const fresh = pool.filter((line) => line !== previous);
  return rng.pick(fresh.length > 0 ? fresh : pool);
}

/** "2.4 m short": the number on the marker. */
export function describeMiss(miss: Miss): string {
  return `${miss.metres.toFixed(1)} m ${miss.verdict}`;
}
