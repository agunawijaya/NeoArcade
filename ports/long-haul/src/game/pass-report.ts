import type { GamePass } from '@shared/pass';
import type manifest from '../../pass.manifest';
import { eventsOfType } from '../engine/events';
import type { Trip } from '../engine/trip';

/**
 * What a finished trip earns on the Arcade Pass. The badges are worked out
 * from the trip's own record (its events and hourly trail) after the fact,
 * so nothing here runs while driving and every rule can be tested on a
 * simulated trip.
 */
type Manifest = typeof manifest;
type BadgeOf<M> = M extends { badges: readonly { id: infer Id }[] } ? Id : never;
type CosmeticOf<M> = M extends { cosmetics: readonly { id: infer Id }[] } ? Id : never;
type StatOf<M> = M extends { stats: readonly { key: infer Key }[] } ? Key : never;

export type BadgeId = BadgeOf<Manifest> & string;
export type CosmeticId = CosmeticOf<Manifest> & string;
export type StatKey = StatOf<Manifest> & string;
export type LongHaulPass = GamePass<BadgeId, CosmeticId, StatKey>;

export type TripMode = 'single' | 'career' | 'daily' | 'practice';

export interface TripReport {
  mode: TripMode;
  trip: Trip;
  /** The original's verdict said "washing dishes". */
  dishes: boolean;
  /** The trip ended in bankruptcy or repossession. */
  bankrupt: boolean;
}

export interface TripFindings {
  delivered: boolean;
  xp: number;
  reason: string;
  /** Badges to unlock outright. */
  unlock: BadgeId[];
  /** Counted badges and how much to add. */
  progress: [BadgeId, number][];
  tickets: number;
}

const NIGHT_HOURS = [0, 1, 2, 3, 4];

/** Miles of the longest stretch between truck stops (or the ends of the trip). */
export function longestStretch(trip: Trip): number {
  const marks = [
    0,
    ...eventsOfType(trip.events, 'truck-stop').map((event) => event.mile),
    trip.miles,
  ];
  let longest = 0;
  for (let index = 1; index < marks.length; index++)
    longest = Math.max(longest, (marks[index] ?? 0) - (marks[index - 1] ?? 0));
  return longest;
}

/** True when the rig rolled through every hour from midnight to 5 AM in one night. */
export function droveThroughTheNight(trip: Trip): boolean {
  let run = 0;
  for (const point of trip.trail) {
    const hour = (((trip.startClock + point.hr - 1) % 24) + 24) % 24;
    if (point.speed > 0 && NIGHT_HOURS.includes(hour)) {
      run = hour === 0 ? 1 : run > 0 ? run + 1 : 0;
      if (run >= NIGHT_HOURS.length) return true;
    } else {
      run = 0;
    }
  }
  return false;
}

export function findings(report: TripReport): TripFindings {
  const { trip, mode } = report;
  const settlement = trip.status === 'arrived' ? trip.settlement : undefined;
  const delivered = Boolean(settlement);
  const unlock: BadgeId[] = [];
  const progress: [BadgeId, number][] = [];
  const tickets = eventsOfType(trip.events, 'pulled-over').length;
  const blowouts = eventsOfType(trip.events, 'blowout').length;

  if (settlement) {
    unlock.push('first-load');
    if (mode === 'single' && trip.route.from === 'los-angeles' && trip.route.to === 'new-york')
      unlock.push('coast-to-coast');
    if (mode === 'single' && trip.route.from === 'new-york' && trip.route.to === 'los-angeles')
      unlock.push('westbound');
    if (trip.route.to === 'new-york') unlock.push('holland-tunnel');
    if (trip.cargo === 'oranges' && !settlement.spoiled && settlement.damage === 0)
      unlock.push('fresh-squeezed');
    if (trip.cargo === 'mail') unlock.push('neither-snow-nor-rain');
    if (settlement.profitCents > 10_000) unlock.push('good-work');
    if (trip.cargo === 'freight' && !settlement.late) progress.push(['right-on-time', 1]);
    if (mode === 'single' && tickets === 0 && blowouts === 0) unlock.push('clean-run');
    if (settlement.early) unlock.push('early-bird');
    if (trip.trail.filter((point) => point.condition === 'blizzard' && point.speed > 0).length >= 3)
      unlock.push('blizzard-survivor');
    if (mode === 'daily' || mode === 'practice') unlock.push('daily-driver');
  }
  const coffees = eventsOfType(trip.events, 'coffee').length;
  if (coffees > 0) progress.push(['bottomless-cup', coffees]);
  const waved = eventsOfType(trip.events, 'radar').filter((event) => !event.ticketed).length;
  if (waved > 0) progress.push(['smokeys-best-friend', waved]);
  if (longestStretch(trip) >= 600) unlock.push('iron-bladder');
  if (droveThroughTheNight(trip)) unlock.push('night-owl');
  if (eventsOfType(trip.events, 'rock-slide').some((event) => event.sleep >= 2))
    unlock.push('rock-slide-napper');
  if (eventsOfType(trip.events, 'out-of-fuel').length > 0) unlock.push('dummy');
  if (
    eventsOfType(trip.events, 'slept').some(
      (event) => event.daytime && !event.motel && event.sleep >= 8,
    )
  )
    unlock.push('sound-asleep');
  if (report.dishes) unlock.push('washing-dishes');
  if (report.bankrupt) unlock.push('repossessed');

  // Ten for finishing, more for a delivery, a little for distance and a profit.
  let xp = 10;
  if (settlement) {
    xp = 30 + Math.min(20, Math.round(trip.miles / 150));
    if (settlement.profitCents > 10_000) xp += 15;
    if (!settlement.late && !settlement.spoiled) xp += 5;
  }
  if (mode === 'practice') xp = Math.round(xp / 2);
  const reason = settlement
    ? `Delivered a load, ${Math.round(trip.miles).toLocaleString('en-US')} miles`
    : trip.status === 'crashed'
      ? 'Lost the rig on the road'
      : 'Lost the licence';
  return { delivered, xp, reason, unlock, progress, tickets };
}

/** Reports a finished trip; returns the XP granted, for the ledger. */
export function reportTrip(pass: LongHaulPass, report: TripReport): number {
  const found = findings(report);
  const { trip } = report;
  pass.stat('trips', { add: 1 });
  pass.stat('miles', { add: Math.round(trip.miles) });
  if (found.tickets > 0) pass.stat('tickets', { add: found.tickets });
  if (found.delivered && trip.settlement) {
    pass.stat('delivered', { add: 1 });
    pass.stat('bestProfit', { max: Math.round(trip.settlement.profitCents / 100) });
  }
  for (const id of found.unlock) pass.unlock(id);
  for (const [id, add] of found.progress) pass.progress(id, { add });
  return pass.award(found.xp, found.reason).granted;
}
