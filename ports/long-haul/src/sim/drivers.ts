import { CONDITIONS } from '../engine/conditions';
import { driveHour } from '../engine/hour';
import { radarWithin } from '../engine/foresight';
import { patrolThreshold } from '../engine/police';
import {
  buyFuel,
  buyTyre,
  drinkCoffee,
  finishStop,
  openStop,
  roomInTank,
  type Rest,
  type StopVisit,
} from '../engine/stop';
import { hourOfDay, type Trip, type TyreOrder } from '../engine/trip';

/**
 * Simple drivers for balancing and tests. Each makes the decisions a player
 * makes, from what the dashboard shows, and drives the real engine hour by
 * hour exactly as the front ends do.
 */
export interface StopPlan {
  gallons: number;
  tyre: 'new' | 'retread' | null;
  coffee: boolean;
  rest: Rest | null;
}

export interface Driver {
  name: string;
  /** What they buy at the terminal. */
  tyres: TyreOrder;
  /** Mph for the coming hour. */
  speed(trip: Trip): number;
  wantsStop(trip: Trip): boolean;
  atStop(trip: Trip, visit: StopVisit): StopPlan;
}

const night = (trip: Trip) => {
  const hour = hourOfDay(trip);
  return hour >= 19 || hour < 4;
};

const weary = (trip: Trip) => ['tired', 'fatigued', 'exhausted'].includes(trip.fatigue);

/** Weather a careful driver would rather sleep through than drive in. */
const stormy = (trip: Trip) => trip.condition === 'blizzard' || trip.condition === 'fog';

/** What a sensible driver slows to for the weather, from a clear-road speed. */
function weatherSpeed(trip: Trip, clear: number): number {
  switch (trip.condition) {
    case 'blizzard':
      return 30;
    case 'fog':
      return 35;
    case 'rain':
    case 'light-snow':
      return Math.min(clear, 45);
    case 'wet':
      return Math.min(clear, 52);
    default:
      return clear;
  }
}

/**
 * Keeps to 55 for the best mileage and slows for the weather, never speeds,
 * sleeps a night's sleep when tired or late at night, waits out blizzards
 * and fog, and keeps a spare.
 */
export const cautious: Driver = {
  name: 'cautious',
  tyres: { kind: 'retread', count: 2 },
  speed: (trip) => weatherSpeed(trip, Math.min(55, trip.limit)),
  wantsStop: (trip) =>
    trip.fuel < 80 ||
    weary(trip) ||
    (night(trip) && trip.awake >= 14) ||
    stormy(trip) ||
    trip.spare === 0,
  atStop(trip) {
    const sleepNow = weary(trip) || (night(trip) && trip.awake >= 14) || stormy(trip);
    return {
      gallons: trip.fuel < 120 ? roomInTank(trip) : 0,
      tyre: trip.spare === 0 ? 'retread' : null,
      coffee: !sleepNow && trip.awake >= 6,
      rest: sleepNow ? { hours: night(trip) ? 8 : 6, motel: !night(trip) } : null,
    };
  },
};

/** Keeps just under the patrols' threshold, eases off for a radar trap it can see coming, sleeps at night when it must. */
export const balanced: Driver = {
  name: 'balanced',
  tyres: { kind: 'none' },
  speed: (trip) => {
    const brisk = Math.min(patrolThreshold(trip), trip.limit + 8);
    return weatherSpeed(trip, radarWithin(trip, brisk) ? trip.limit : brisk);
  },
  wantsStop: (trip) =>
    trip.fuel < 80 ||
    trip.fatigue === 'fatigued' ||
    trip.fatigue === 'exhausted' ||
    trip.condition === 'blizzard' ||
    (night(trip) && trip.awake >= 12),
  atStop(trip) {
    const sleepNow =
      trip.fatigue === 'fatigued' ||
      trip.fatigue === 'exhausted' ||
      trip.condition === 'blizzard' ||
      (night(trip) && trip.awake >= 12);
    return {
      gallons: trip.fuel < 130 ? roomInTank(trip) : 0,
      tyre: trip.spare === 0 ? 'retread' : null,
      coffee: !sleepNow,
      rest: sleepNow ? { hours: 8, motel: false } : null,
    };
  },
};

/**
 * Over the patrols' threshold whatever the weather until the record holds
 * two offences, then just under it; sleeps only when falling asleep.
 */
export const reckless: Driver = {
  name: 'reckless',
  tyres: { kind: 'none' },
  speed: (trip) => {
    if (trip.condition === 'blizzard') return 45;
    return patrolThreshold(trip) + (trip.offences >= 2 ? 0 : 5);
  },
  wantsStop: (trip) => trip.fuel < 70 || trip.fatigue === 'exhausted',
  atStop(trip) {
    return {
      gallons: roomInTank(trip),
      tyre: null,
      coffee: true,
      rest: trip.fatigue === 'exhausted' ? { hours: 5, motel: false } : null,
    };
  },
};

export const DRIVERS = { cautious, balanced, reckless } as const;

/** Drives a trip to its end with a driver; `maxHours` guards against a stuck loop. */
export function driveTrip(trip: Trip, driver: Driver, maxHours = 600): Trip {
  while (trip.status === 'driving' && trip.hourCount < maxHours) {
    if (trip.stopOffered && driver.wantsStop(trip)) {
      const { visit } = openStop(trip);
      const plan = driver.atStop(trip, visit);
      if (plan.gallons > 0) buyFuel(trip, visit, plan.gallons);
      if (plan.tyre && visit.tyres) buyTyre(trip, visit, plan.tyre);
      if (plan.coffee) drinkCoffee(trip, visit);
      finishStop(trip, visit, plan.rest);
      continue;
    }
    driveHour(trip, driver.speed(trip));
  }
  return trip;
}

/** The weather multiplier a driver faces this hour, for reports. */
export function roadRisk(trip: Trip): number {
  return CONDITIONS[trip.condition].risk;
}
