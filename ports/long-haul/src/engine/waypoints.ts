import type { Rng } from '@shared/rng';
import type { TripEvent } from './events';
import { citation, radarReading } from './police';
import type { RouteStop, WaypointEvent } from './route';
import { RULES } from './rules';
import { streamFor } from './streams';
import { emptyTankAtRoadside } from './fuel';
import { difficultyOf, grossWeight, isRefrigerated, spend, type Trip } from './trip';

/**
 * Passing a waypoint (lines 3100–3920): the limit goes back to normal, and
 * whatever the waypoint's code says may happen does. Each event at a place
 * rolls its own stream, keyed by the place, so a driver can be told in
 * advance whether the scale at Gallup is open today (see `foresight.ts`).
 */
export function passStop(trip: Trip, index: number, stop: RouteStop): TripEvent[] {
  const visit = trip.visits[stop.place] ?? 0;
  trip.visits[stop.place] = visit + 1;
  trip.next = index + 1;
  trip.legLimit = trip.route.stops[index + 1]?.limit ?? RULES.speedLimit;
  trip.limit = trip.legLimit;
  const events: TripEvent[] = [
    {
      type: 'passed',
      stop: index,
      place: stop.place,
      name: stop.name,
      hr: trip.hr,
      mile: trip.miles,
    },
  ];
  stop.events.forEach((event, eventIndex) => {
    if (trip.status !== 'driving') return;
    const rng = streamFor(trip.seed, 'place', eventKey(stop.place, visit, eventIndex));
    events.push(...resolve(trip, index, event, rng));
  });
  return events;
}

export function eventKey(place: string, visit: number, eventIndex: number): string {
  return `${place}:${visit}:${eventIndex}`;
}

/** Whether an event with these odds happens, given its stream's first draw. */
export function happens(chance: number, roll: number, odds: number): boolean {
  return roll < chance * odds;
}

function resolve(trip: Trip, index: number, event: WaypointEvent, rng: Rng): TripEvent[] {
  const at = () => ({ hr: trip.hr, mile: trip.miles });
  const odds = difficultyOf(trip).eventOdds;
  switch (event.kind) {
    case 'time-zone':
      trip.hr += event.hours;
      trip.zoneShift += event.hours;
      return [{ type: 'time-zone', hours: event.hours, ...at() }];

    case 'toll':
      spend(trip, 'toll', event.cents);
      return [{ type: 'toll', cents: event.cents, ...at() }];

    case 'construction':
      if (!happens(event.chance, rng.next(), odds)) return [];
      trip.limit = RULES.constructionLimit;
      return [{ type: 'construction', limit: trip.limit, ...at() }];

    case 'radar': {
      if (!happens(event.chance, rng.next(), odds)) return [];
      const reading = radarReading(trip.speed, rng);
      const ticketed = reading > trip.limit + 3;
      const radar: TripEvent = { type: 'radar', reading, limit: trip.limit, ticketed, ...at() };
      return ticketed ? [radar, ...citation(trip, trip.speed, rng, true)] : [radar];
    }

    case 'weigh-station':
      return weighStation(trip, index, event, rng);

    case 'rock-slide':
      if (!happens(event.chance, rng.next(), odds)) return [];
      return rockSlide(trip, event.where, rng);

    case 'reefer': {
      if (!isRefrigerated(trip)) return [];
      if (!happens(event.chance, rng.next(), odds * trip.rig.reeferOdds)) return [];
      const damage = Math.floor(rng.next() * 5);
      trip.damage += damage;
      trip.hr += RULES.reeferRepairHours;
      trip.awake += RULES.reeferRepairHours;
      spend(trip, 'repair', RULES.reeferRepairCents, 'reefer unit');
      return [
        {
          type: 'reefer-failure',
          damage,
          hours: RULES.reeferRepairHours,
          cents: RULES.reeferRepairCents,
          ...at(),
        },
      ];
    }
  }
}

/** Lines 3500–3690. */
function weighStation(
  trip: Trip,
  index: number,
  event: Extract<WaypointEvent, { kind: 'weigh-station' }>,
  rng: Rng,
): TripEvent[] {
  if (!happens(event.chance, rng.next(), difficultyOf(trip).eventOdds)) return [];
  const pounds = Math.round(grossWeight(trip) + 25 * Math.floor(rng.next() * 10));
  const overBy = Math.floor(pounds - RULES.grossLimitPounds);
  const at = { hr: trip.hr, mile: trip.miles };
  if (overBy < 1) {
    return [{ type: 'weigh-station', pounds, overBy: 0, cents: 0, centsPerPound: 0, ...at }];
  }
  if (event.barrier) {
    const { barrier } = event;
    trip.legLimit = barrier.limit;
    trip.limit = barrier.limit;
    // The original renamed the waypoint just passed, so the detour's road never showed.
    trip.detourRoad = { stop: index + 1, road: barrier.via };
    trip.extraMiles += barrier.detourMiles;
    trip.extraFrom = index + 1;
    return [
      {
        type: 'barred',
        state: barrier.state,
        pounds,
        detourMiles: barrier.detourMiles,
        via: barrier.via,
        limit: barrier.limit,
        ...at,
      },
    ];
  }
  const centsPerPound = Math.floor(rng.next() * 4) + 2;
  const cents = Math.round(
    (RULES.overweightBaseCents + overBy * centsPerPound) * difficultyOf(trip).fineScale,
  );
  spend(trip, 'scale-fine', cents, 'overweight');
  return [{ type: 'weigh-station', pounds, overBy, cents, centsPerPound, ...at }];
}

/**
 * Lines 3710–3830: up to five hours' wait, half of it slept. Oranges keep
 * the reefer running on diesel meanwhile, and a nearly empty tank runs dry.
 */
function rockSlide(trip: Trip, where: string, rng: Rng): TripEvent[] {
  const hours = Math.floor(rng.next() * 6);
  trip.hr += hours;
  const slide = { type: 'rock-slide' as const, where, hours, hr: trip.hr, mile: trip.miles };
  if (isRefrigerated(trip)) {
    trip.fuel -= RULES.reeferGallonsPerHour * hours;
    // Line 3820 sets T to 0 before the barrel arrives, so a dry tank means no nap.
    if (trip.fuel <= 1) return [{ ...slide, sleep: 0 }, emptyTankAtRoadside(trip, rng, 0, true)];
  }
  const sleep = hours > 1 ? Math.floor(hours / 2 + 0.5) : 0;
  if (sleep > 3) trip.awake = 0;
  else if (sleep > 0) trip.awake = Math.round(trip.awake / 2);
  trip.slept += sleep;
  return [{ ...slide, sleep }];
}
