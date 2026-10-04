import type { TripEvent } from '../engine/events';
import type { HourResult } from '../engine/hour';
import { stopMile, type Trip } from '../engine/trip';

/**
 * The engine settles an hour at once; the screen plays it out. Each event
 * gets its moment inside the hour: a waypoint when the rig reaches its
 * milepost, the tank running dry where the diesel ran out, a patrol car or
 * a blowout somewhere along the way. Weather and fatigue change at the end,
 * because they describe the hour to come.
 */
export type BeatWeight = 'card' | 'quick' | 'quiet';

export interface Beat {
  /** 0–1 through the hour. */
  at: number;
  event: TripEvent;
  weight: BeatWeight;
}

export interface HourPlay {
  result: HourResult;
  beats: Beat[];
  /** Miles the rig appears to cover, which a crash cuts short. */
  visibleMiles: number;
}

/** Events that stop the clock and ask to be read. */
const CARDS: ReadonlySet<TripEvent['type']> = new Set([
  'crash',
  'blowout',
  'pulled-over',
  'jailed',
  'out-of-fuel',
  'barred',
  'rock-slide',
  'reefer-failure',
  'arrived',
]);

/** Events worth a quick look that need no answer. */
const QUICK: ReadonlySet<TripEvent['type']> = new Set([
  'toll',
  'construction',
  'radar',
  'weigh-station',
  'time-zone',
  'reefer-idle',
]);

export function weightOf(event: TripEvent, pauseAll: boolean): BeatWeight {
  if (CARDS.has(event.type)) {
    // A radar reading that ended in a ticket comes with its own card.
    return 'card';
  }
  if (QUICK.has(event.type)) {
    if (event.type === 'weigh-station' && event.overBy > 0) return 'card';
    return pauseAll ? 'card' : 'quick';
  }
  return 'quiet';
}

/** A fixed pseudo-random fraction for an event, so a replay looks the same. */
function moment(seed: number, hour: number, slot: number, low: number, high: number): number {
  let h = (seed ^ Math.imul(hour + 1, 0x9e3779b1) ^ Math.imul(slot + 7, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  const t = ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  return low + (high - low) * t;
}

export function planHour(trip: Trip, result: HourResult, pauseAll: boolean): HourPlay {
  const moved = Math.max(0, result.toMile - result.fromMile);
  const fractionOf = (mile: number) =>
    moved > 0 ? Math.max(0, Math.min(1, (mile - result.fromMile) / moved)) : 0.5;
  const beats: Beat[] = [];
  let lastStopFraction = 0;
  let slot = 0;
  let visibleMiles = moved;

  for (const event of result.events) {
    let at: number;
    switch (event.type) {
      case 'crash': {
        at = moment(trip.seed, trip.hourCount, slot++, 0.3, 0.7);
        visibleMiles = result.speed * at;
        break;
      }
      case 'blowout':
        at = moment(trip.seed, trip.hourCount, slot++, 0.15, 0.55);
        break;
      case 'pulled-over':
      case 'jailed':
        at =
          event.type === 'pulled-over' && event.byRadar
            ? lastStopFraction + 0.02
            : moment(trip.seed, trip.hourCount, slot++, 0.3, 0.75);
        break;
      case 'out-of-fuel':
        at = event.parked
          ? lastStopFraction + 0.03
          : result.speed > 0
            ? Math.min(0.98, event.lastMiles / result.speed)
            : 0.5;
        break;
      case 'passed':
        at = fractionOf(stopMile(trip, event.stop));
        lastStopFraction = at;
        break;
      case 'arrived':
      case 'warehouse-closed':
        at = Math.max(lastStopFraction, fractionOf(event.mile));
        break;
      case 'weather':
      case 'fatigue':
      case 'stop-declined':
        at = 1;
        break;
      default:
        // Waypoint events follow their 'passed' beat.
        at = Math.min(1, lastStopFraction + 0.01);
    }
    beats.push({ at, event, weight: weightOf(event, pauseAll) });
  }
  // Keep the engine's order for events at the same moment.
  beats.forEach((beat, index) => {
    const previous = beats[index - 1];
    if (previous && beat.at < previous.at && sameWaypointGroup(previous, beat))
      beat.at = previous.at;
  });
  beats.sort((a, b) => a.at - b.at);
  return { result, beats, visibleMiles };
}

function sameWaypointGroup(a: Beat, b: Beat): boolean {
  return a.event.mile === b.event.mile;
}
