import type { EventOf, TripEvent } from './events';
import { reeferIdled } from './fuel';
import { refreshAfterStop } from './outlook';
import { RULES } from './rules';
import { streamFor } from './streams';
import { hourOfDay, isRefrigerated, spend, type Trip } from './trip';

/**
 * "Truck stop ahead. Do you want to stop?" — lines 1700–2020. Diesel at
 * the day's price, a tyre if the spare is gone, an hour off the road, and a
 * bunk if you want one. The port adds a cup of coffee and a motel room.
 */
export interface StopVisit {
  number: number;
  /** Cents a gallon: 85 to 119 (line 1740). */
  dieselCents: number;
  /** Offered only when the spare has been used (line 1800). */
  tyres: { newCents: number; retreadCents: number } | null;
  motelCents: number;
  coffeeCents: number;
  coffee: boolean;
  /** The hour off the road has been taken. */
  done: boolean;
}

export const COFFEE_CENTS = 50;
/** A coffee takes the edge off: two hours fewer awake, never below zero. */
export const COFFEE_HOURS = 2;

/** Line 1720: pressing on past a truck stop counts as an hour more awake. */
export function declineStop(trip: Trip): EventOf<'stop-declined'> {
  trip.awake += 1;
  trip.stopOffered = false;
  return record(trip, { type: 'stop-declined', hr: trip.hr, mile: trip.miles });
}

function record<T extends TripEvent | TripEvent[]>(trip: Trip, happened: T): T {
  trip.events.push(...(Array.isArray(happened) ? happened : [happened]));
  return happened;
}

export function openStop(trip: Trip): { visit: StopVisit; events: TripEvent[] } {
  trip.stopCount += 1;
  const rng = streamFor(trip.seed, 'stop', trip.stopCount);
  const dieselCents = 85 + Math.floor(35 * rng.next());
  const newCents = (200 + Math.floor(50 * rng.next())) * 100;
  const retreadCents = (100 + Math.floor(70 * rng.next())) * 100;
  const motelCents = (16 + Math.floor(12 * rng.next())) * 100;
  trip.stopOffered = false;
  const visit: StopVisit = {
    number: trip.stopCount,
    dieselCents,
    tyres: trip.spare === 0 ? { newCents, retreadCents } : null,
    motelCents,
    coffeeCents: COFFEE_CENTS,
    coffee: false,
    done: false,
  };
  return {
    visit,
    events: record(trip, [
      { type: 'truck-stop', number: visit.number, dieselCents, hr: trip.hr, mile: trip.miles },
    ]),
  };
}

/** How many gallons would fill the tank right now. */
export function roomInTank(trip: Trip): number {
  return Math.max(0, Math.floor(trip.rig.tankGallons - trip.fuel));
}

/** Lines 1760–1790. Pumping more than the tank holds spills the rest, paid for all the same. */
export function buyFuel(trip: Trip, visit: StopVisit, gallons: number): EventOf<'fuel-bought'> {
  const bought = Math.max(0, Math.floor(gallons));
  const cents = visit.dieselCents * bought;
  spend(trip, 'fuel', cents, `${bought} gal at ${(visit.dieselCents / 100).toFixed(2)}`);
  trip.fuel += bought;
  let spilled = 0;
  if (trip.fuel > trip.rig.tankGallons + 1) {
    spilled = Math.floor(trip.fuel - trip.rig.tankGallons);
    trip.fuel = trip.rig.tankGallons;
  }
  return record(trip, {
    type: 'fuel-bought',
    gallons: bought,
    cents,
    spilled,
    hr: trip.hr,
    mile: trip.miles,
  });
}

/**
 * Lines 1810–1850. The original asked "Do you want to buy a tire?" and
 * then stopped dead on a STOP statement. A new tyre makes a new spare, a
 * retread an old one, just as at the terminal.
 */
export function buyTyre(
  trip: Trip,
  visit: StopVisit,
  kind: 'new' | 'retread',
): EventOf<'tyre-bought'> {
  if (!visit.tyres || trip.spare !== 0) throw new Error('The spare is still in its rack.');
  const cents = kind === 'new' ? visit.tyres.newCents : visit.tyres.retreadCents;
  spend(trip, 'tyres', cents, `${kind === 'new' ? 'new' : 'retreaded'} spare`);
  trip.spare = kind === 'new' ? 2 : 1;
  visit.tyres = null;
  return record(trip, { type: 'tyre-bought', kind, cents, hr: trip.hr, mile: trip.miles });
}

export function drinkCoffee(trip: Trip, visit: StopVisit): EventOf<'coffee'> {
  if (visit.coffee) throw new Error('One cup is all that helps.');
  visit.coffee = true;
  spend(trip, 'coffee', visit.coffeeCents, 'coffee');
  trip.awake = Math.max(0, trip.awake - COFFEE_HOURS);
  return record(trip, { type: 'coffee', cents: visit.coffeeCents, hr: trip.hr, mile: trip.miles });
}

export interface Rest {
  hours: number;
  /** A motel room is quiet in daytime; the bunk is not. */
  motel: boolean;
}

/**
 * The stop's hour passes (line 1900), then, if asked, sleep (lines
 * 1930–1990). Sleep taken between 6 AM and 8 PM in the bunk is broken by
 * the noise and only about half counts. Oranges keep the reefer running on
 * the truck's diesel, seven gallons an hour.
 */
export function finishStop(trip: Trip, visit: StopVisit, rest: Rest | null): TripEvent[] {
  if (visit.done) throw new Error('This stop is already over.');
  visit.done = true;
  trip.hr += 1;
  trip.hoursSinceStop = 0;
  trip.stopOffered = false;
  const events: TripEvent[] = [];
  const hours = rest ? Math.floor(rest.hours) : 0;
  if (rest && hours >= 1) {
    const startHour = hourOfDay(trip);
    trip.hr += hours;
    let reeferGallons = 0;
    if (isRefrigerated(trip)) {
      reeferGallons = RULES.reeferGallonsPerHour * hours;
      trip.fuel -= reeferGallons;
      if (trip.fuel < 0) {
        trip.fuel = 0;
        events.push(reeferIdled(trip, streamFor(trip.seed, 'stop', `${visit.number}:reefer`)));
      }
    }
    if (rest.motel) spend(trip, 'motel', visit.motelCents, 'motel room');
    const daytime = startHour >= 6 && startHour < 20;
    const quiet = rest.motel || trip.rig.sleeper === 'sleeper-cab';
    const sleep = daytime && !quiet ? Math.floor(hours / 2 + 0.6) : hours;
    trip.slept += sleep;
    trip.awake = sleep > 3 ? 0 : Math.round(trip.awake / 2);
    events.unshift({
      type: 'slept',
      hours,
      sleep,
      daytime,
      motel: rest.motel,
      reeferGallons,
      hr: trip.hr,
      mile: trip.miles,
    });
  }
  events.push(...refreshAfterStop(trip, hours >= 1));
  return record(trip, events);
}
