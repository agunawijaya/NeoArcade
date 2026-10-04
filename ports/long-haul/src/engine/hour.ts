import type { Rng } from '@shared/rng';
import { CONDITIONS, FATIGUE } from './conditions';
import type { CrashCause, TripEvent } from './events';
import { emptyTankAtRoadside } from './fuel';
import { lookAhead } from './outlook';
import { patrol } from './police';
import { RULES, gallonsPerHour, milesPerGallon, speedCap } from './rules';
import { settle } from './arrival';
import { declineStop } from './stop';
import { streamFor } from './streams';
import { difficultyOf, legFactor, spend, stopMile, totalMiles, type Trip } from './trip';
import { passStop } from './waypoints';

/**
 * One hour on the road: lines 1400–1520, then the waypoints passed and the
 * look ahead to the next hour. The checks run in the original's order —
 * crash, tyre, police — before the clock and the odometer move.
 */
export interface HourResult {
  /** The speed driven, after the rig's limit. */
  speed: number;
  /** "You can only get the old rig to go 52 MPH on this road." */
  capped: boolean;
  fromMile: number;
  toMile: number;
  fromHr: number;
  toHr: number;
  events: TripEvent[];
}

/** The speed the rig will actually do when asked for `requested` (lines 1650–1660). */
export function clampSpeed(trip: Trip, requested: number): { speed: number; capped: boolean } {
  const cap = speedCap(trip.limit);
  const whole = Math.round(Number.isFinite(requested) ? requested : RULES.speedLimit);
  if (whole > cap) return { speed: cap, capped: true };
  return { speed: Math.max(RULES.minSpeed, whole), capped: false };
}

/** Line 1420: the chance of a crash this hour at this speed. */
export function crashChance(trip: Trip, speed: number): number {
  const risk = speed * speed * FATIGUE[trip.fatigue].risk * CONDITIONS[trip.condition].risk;
  return Math.min(1, risk / RULES.crashScale);
}

/** Line 1440 without the square root: √(MF+100)·TC > RH·25000·RND, both sides squared. */
export function blowsOut(trip: Trip, roll: number): boolean {
  if (trip.tyreWear <= 0) return false;
  const odds = difficultyOf(trip).blowoutOdds;
  const wear = trip.tyreWear * odds;
  const threshold = legFactor(trip) * RULES.blowoutScale * roll;
  return (trip.miles + 100) * wear * wear > threshold * threshold;
}

export function driveHour(trip: Trip, requested: number): HourResult {
  if (trip.status !== 'driving') throw new Error(`Cannot drive: the trip has ${trip.status}.`);
  const events: TripEvent[] = [];
  if (trip.stopOffered) declineStop(trip);

  const { speed, capped } = clampSpeed(trip, requested);
  const fromMile = trip.miles;
  const fromHr = trip.hr;
  const rng = streamFor(trip.seed, 'hour', trip.hourCount);
  trip.hourCount += 1;
  trip.speed = speed;
  const result = (): HourResult => {
    trip.events.push(...events);
    return { speed, capped, fromMile, toMile: trip.miles, fromHr, toHr: trip.hr, events };
  };

  if (
    speed * speed * FATIGUE[trip.fatigue].risk * CONDITIONS[trip.condition].risk >
    rng.next() * RULES.crashScale
  ) {
    trip.status = 'crashed';
    events.push({
      type: 'crash',
      cause: crashCause(trip, speed),
      speed,
      hr: trip.hr,
      mile: trip.miles,
    });
    return result();
  }

  if (blowsOut(trip, rng.next())) events.push(blowout(trip, rng));

  events.push(...patrol(trip, speed, rng));
  if (trip.status !== 'driving') return result();

  trip.hr += 1;
  trip.awake += 1;
  // A work zone lasts one hour (line 1470); the leg's own limit comes back.
  if (trip.limit < 40) trip.limit = trip.legLimit;

  const burn = gallonsPerHour(speed, trip.rig.economy);
  trip.fuel -= burn;
  let moved = speed;
  if (trip.fuel < 0) {
    // Lines 2500–2510: the miles the last drops were good for.
    const burned = burn + trip.fuel;
    const lastMiles = (milesPerGallon(speed) / trip.rig.economy) * burned;
    trip.fuel = 0;
    trip.miles += Math.round(lastMiles);
    moved = 0;
    events.push(emptyTankAtRoadside(trip, rng, lastMiles, false));
  }
  trip.miles += moved;
  trip.trail.push({ hr: trip.hr, mile: trip.miles, speed, condition: trip.condition });

  events.push(...passStops(trip));
  if (trip.status !== 'driving') return result();

  if (trip.miles >= totalMiles(trip)) {
    trip.miles = Math.min(trip.miles, totalMiles(trip));
    trip.status = 'arrived';
    events.push({ type: 'arrived', deliveredHr: trip.hr, hr: trip.hr, mile: trip.miles });
    events.push(...settle(trip));
    return result();
  }

  events.push(...lookAhead(trip));
  return result();
}

/**
 * Every waypoint reached this hour, in order. The original checked for
 * New York before looking at waypoints, so a fast last hour skipped the
 * Holland Tunnel and its toll; here every waypoint counts.
 */
function passStops(trip: Trip): TripEvent[] {
  const events: TripEvent[] = [];
  const last = trip.route.stops.length - 1;
  while (trip.status === 'driving' && trip.next < last && stopMile(trip, trip.next) <= trip.miles) {
    const index = trip.next;
    const stop = trip.route.stops[index];
    if (!stop) break;
    events.push(...passStop(trip, index, stop));
  }
  return events;
}

/** Lines 2600–2740. */
function blowout(trip: Trip, rng: Rng): TripEvent {
  if (trip.spare === 0) {
    trip.hr += RULES.towHours;
    trip.awake += RULES.towHours;
    spend(trip, 'tow', RULES.towCents, 'tow truck and tyre');
    return {
      type: 'blowout',
      spare: false,
      hours: RULES.towHours,
      tyre: null,
      cents: RULES.towCents,
      hr: trip.hr,
      mile: trip.miles,
    };
  }
  trip.tyreWear -= 2 * trip.spare;
  trip.spare = 0;
  const hours = Math.floor(rng.next() * 2) + 1;
  trip.hr += hours;
  // The original line read HL=HR+T+1, which made anyone who changed a tyre after
  // the first day "exhausted"; the hours awake were meant.
  trip.awake += hours + 1;
  return {
    type: 'blowout',
    spare: true,
    hours,
    tyre: hours === 1 ? 'outside' : 'inside',
    cents: 0,
    hr: trip.hr,
    mile: trip.miles,
  };
}

/** Lines 4070–4120: the first reason that fits. */
export function crashCause(trip: Pick<Trip, 'fatigue' | 'condition'>, speed: number): CrashCause {
  if (trip.fatigue === 'exhausted' || (trip.fatigue === 'fatigued' && speed < 65)) return 'asleep';
  if (trip.condition === 'blizzard') return 'snow-ditch';
  if (trip.condition === 'fog') return 'pickup';
  if (speed > 65) return 'speed';
  if (CONDITIONS[trip.condition].risk > 2) return 'skid';
  return 'drunk-driver';
}
