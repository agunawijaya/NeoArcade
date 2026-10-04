import type { Rng } from '@shared/rng';
import type { TripEvent } from './events';
import { RULES } from './rules';
import { isRefrigerated, spend, type Trip } from './trip';

/**
 * "After 12.3 more miles, you ran out of fuel (DUMMY !!)" — lines 2500–2590.
 * A barrel of diesel is brought out to the road for $200. The original
 * added those $200 to a variable nothing ever read, so running dry was free;
 * here it is charged.
 */
export function emptyTankAtRoadside(
  trip: Trip,
  rng: Rng,
  lastMiles: number,
  parked: boolean,
): TripEvent {
  spend(trip, 'barrel', RULES.barrelCents, 'emergency diesel');
  trip.fuel = RULES.barrelGallons;
  const hours = Math.floor(rng.next() * 5);
  trip.hr += hours;
  trip.awake += hours;
  const damage = isRefrigerated(trip) ? Math.floor(rng.next() * 3) : 0;
  trip.damage += damage;
  return {
    type: 'out-of-fuel',
    lastMiles,
    hours,
    cents: RULES.barrelCents,
    damage,
    parked,
    hr: trip.hr,
    mile: trip.miles,
  };
}

/**
 * Line 2570 on its own: asleep at a truck stop with the reefer's tank run
 * dry. There is a pump right there, so no barrel, but the oranges suffer.
 */
export function reeferIdled(trip: Trip, rng: Rng): TripEvent {
  const damage = Math.floor(rng.next() * 3);
  trip.damage += damage;
  return { type: 'reefer-idle', damage, hr: trip.hr, mile: trip.miles };
}
