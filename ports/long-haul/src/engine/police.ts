import type { Rng } from '@shared/rng';
import { placeById } from '../data/places';
import type { TripEvent } from './events';
import { DETECTOR_BANNED_STATES, DETECTOR_FINE_CENTS } from './rig';
import { RULES } from './rules';
import { difficultyOf, legFactor, legFineBase, nextStop, spend, type Trip } from './trip';

/**
 * "Smokey is behind you with his lights on." The patrol (lines 2300–2310),
 * the radar trap (lines 3410–3440) and the justice of the peace (lines
 * 2350–2460).
 */

/** Line 1450: a patrol takes an interest above the limit, minus RH, plus 10. */
export function patrolThreshold(trip: Trip): number {
  return trip.limit - legFactor(trip) + 10 - difficultyOf(trip).policeThresholdDrop;
}

/**
 * Line 2310: no ticket while (SP − SL + 2·RH − 5)² < 900 × RND. The chance
 * of a ticket in an hour is that square over 900, capped at certain.
 */
export function ticketChance(trip: Trip, speed: number): number {
  if (speed <= patrolThreshold(trip)) return 0;
  const excess = speed - trip.limit + 2 * legFactor(trip) - 5;
  return Math.min(1, (excess * excess * difficultyOf(trip).policeOdds) / 900);
}

export function patrol(trip: Trip, speed: number, rng: Rng): TripEvent[] {
  if (speed <= patrolThreshold(trip)) return [];
  const excess = speed - trip.limit + 2 * legFactor(trip) - 5;
  if (excess * excess * difficultyOf(trip).policeOdds < 900 * rng.next()) return [];
  return citation(trip, speed, rng, false);
}

/**
 * Lines 2350–2460: wait for the hearing, one hour per offence on the record,
 * then a fine of a base plus so much per mile an hour over. The fourth
 * offence is thirty days in jail and the end of the road.
 */
export function citation(trip: Trip, speed: number, rng: Rng, byRadar: boolean): TripEvent[] {
  trip.offences += 1;
  const offence = trip.offences;
  const waitHours = offence;
  trip.hr += waitHours;
  trip.awake += waitHours;
  if (offence >= RULES.offencesToJail) {
    trip.status = 'jailed';
    return [{ type: 'jailed', offence, waitHours, hr: trip.hr, mile: trip.miles }];
  }
  const perMph = Math.floor(offence * (rng.next() * 5));
  const base = Math.floor(5 * (legFineBase(trip) + offence * (rng.next() * 4)));
  const overBy = speed - trip.limit;
  const scale = difficultyOf(trip).fineScale;
  const cents = Math.round((base + perMph * overBy) * 100 * scale);
  spend(trip, 'fine', cents, `${ordinal(offence)} offence`);
  const event: TripEvent = {
    type: 'pulled-over',
    offence,
    waitHours,
    baseCents: Math.round(base * 100 * scale),
    perMphCents: Math.round(perMph * 100 * scale),
    overBy,
    cents,
    byRadar,
    hr: trip.hr,
    mile: trip.miles,
  };
  const detector = detectorFine(trip);
  if (detector > 0) {
    spend(trip, 'fine', detector, 'radar detector');
    event.detectorCents = detector;
  }
  return [event];
}

/** Being pulled over with a detector on the dash where it is banned. */
function detectorFine(trip: Trip): number {
  if (!trip.rig.radarDetector) return 0;
  const state = placeById(nextStop(trip).place).state;
  return DETECTOR_BANNED_STATES.includes(state) ? DETECTOR_FINE_CENTS : 0;
}

/** Line 3420: the radar reads within a few miles an hour of the truth. */
export function radarReading(speed: number, rng: Rng): number {
  return speed + rng.next() * 5 - 2;
}

export function ordinal(offence: number): string {
  return ['first', 'second', 'third', 'fourth'][offence - 1] ?? `${offence}th`;
}
