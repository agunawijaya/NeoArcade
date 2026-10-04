import { CARGO } from './cargo';
import type { TripEvent } from './events';
import { RULES } from './rules';
import { streamFor } from './streams';
import { expensesTotal, hourOfDay, type Trip } from './trip';

/**
 * "WELCOME TO NEW YORK" — lines 5000–5490: the warehouse, the bill for the
 * truck, and what the load pays.
 */
export interface Settlement {
  /** HR when the load was handed over, after any wait for the warehouse. */
  deliveredHr: number;
  dockWait: number;
  /** Whole days and leftover hours on the road (line 5140). */
  days: number;
  hours: number;
  /** Fuel, tyres, tolls, fines and the rest, before the truck's daily cost. */
  tripCents: number;
  /** $85 for every day started (line 5180). */
  truckCents: number;
  /** The full rate for the load. */
  rateCents: number;
  /** Points of orange damage at delivery; each costs 5 % (line 5280). */
  damage: number;
  spoiled: boolean;
  late: boolean;
  /** Delivered by the due time on a contract that pays a bonus for it. */
  early: boolean;
  /** What the load actually paid: the rate less damage or lateness, or the dump fee. */
  paidCents: number;
  /** paid − trip − truck. */
  profitCents: number;
}

/**
 * The warehouse is closed from 6 PM to 6 AM (line 5110), and a night
 * arrival waits for the doors to open. The original line took HR − INT(HR/24)
 * for the hour of the day, which was never in range after the first day, so
 * the warehouse never shut; and its wait ran to 8 AM, two hours past the
 * opening its own test implies.
 */
/** The bonus some contracts pay for a load delivered by its due time. */
export const EARLY_BONUS = 0.1;

export function dockWaitHours(localHour: number): number {
  if (localHour >= RULES.dockOpensHour && localHour < RULES.dockClosesHour) return 0;
  return (24 + RULES.dockOpensHour - localHour) % 24;
}

export function settle(trip: Trip): TripEvent[] {
  const events: TripEvent[] = [];
  const dockWait = dockWaitHours(hourOfDay(trip));
  if (dockWait > 0) {
    trip.hr += dockWait;
    events.push({ type: 'warehouse-closed', waitHours: dockWait, hr: trip.hr, mile: trip.miles });
  }
  const days = Math.floor(trip.hr / 24);
  const hours = trip.hr - days * 24;
  const truckCents = RULES.truckDayCents * days + RULES.truckDayCents;
  const tripCents = expensesTotal(trip);
  const cargo = CARGO[trip.cargo];
  const rateCents = trip.payCents ?? Math.round(trip.load * cargo.centsPerPound);

  let paidCents = rateCents;
  let spoiled = false;
  let late = false;
  if (trip.cargo === 'oranges') {
    const rng = streamFor(trip.seed, 'arrival', 0);
    const extra = (days - trip.deadline.spoilAfterDays) * Math.floor(rng.next() * 3);
    if (extra > 0) trip.damage += extra;
    if (trip.damage > 6) {
      spoiled = true;
      paidCents = -RULES.dumpCents;
    } else if (trip.damage >= 1) {
      paidCents = rateCents - Math.round((rateCents * trip.damage) / 20);
    }
  } else if (cargo.deadline && trip.hr >= trip.deadline.lateHr) {
    // Line 5340 announced the penalty and never took it.
    late = true;
    paidCents = rateCents - Math.round(rateCents * RULES.latePenalty);
  }

  const early = trip.earlyBonus && !spoiled && trip.hr <= trip.deadline.dueHr;
  if (early) paidCents += Math.round(rateCents * EARLY_BONUS);

  trip.settlement = {
    early,
    deliveredHr: trip.hr,
    dockWait,
    days,
    hours,
    tripCents,
    truckCents,
    rateCents,
    damage: trip.damage,
    spoiled,
    late,
    paidCents,
    profitCents: paidCents - tripCents - truckCents,
  };
  return events;
}

/** When freight arriving at a given HR would be delivered, and whether it would be late. */
export function deliveryIfArrivingAt(
  trip: Pick<Trip, 'startClock' | 'deadline'>,
  arrivalHr: number,
): { deliveredHr: number; late: boolean } {
  const localHour = (((trip.startClock + arrivalHr) % 24) + 24) % 24;
  const deliveredHr = arrivalHr + dockWaitHours(localHour);
  return { deliveredHr, late: deliveredHr >= trip.deadline.lateHr };
}
