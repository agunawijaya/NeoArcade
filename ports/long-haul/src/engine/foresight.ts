import type { ConditionId } from './conditions';
import { conditionAt } from './living-weather';
import { pointAlong } from './position';
import type { WaypointEventKind } from './route';
import { streamFor } from './streams';
import { difficultyOf, elapsedHours, hourOfDay, stopMile, type Trip } from './trip';
import { eventKey, happens } from './waypoints';

/**
 * What the road ahead holds, read from the same streams the engine will
 * use. Nothing here changes the trip. The CB radio's voices and the radar
 * detector draw on it, each with their own honesty.
 */
export interface Ahead {
  stop: number;
  place: string;
  name: string;
  kind: WaypointEventKind;
  /** Whether it will actually happen when the rig gets there. */
  live: boolean;
  miles: number;
}

/** The events at the next few stops, and whether each will happen. */
export function eventsAhead(trip: Trip, stops = 4): Ahead[] {
  const found: Ahead[] = [];
  const odds = difficultyOf(trip).eventOdds;
  const visits = { ...trip.visits };
  const last = trip.route.stops.length - 1;
  for (let index = trip.next; index < Math.min(last, trip.next + stops); index++) {
    const stop = trip.route.stops[index];
    if (!stop) break;
    const visit = visits[stop.place] ?? 0;
    visits[stop.place] = visit + 1;
    stop.events.forEach((event, eventIndex) => {
      if (event.kind === 'time-zone' || event.kind === 'toll') return;
      if (event.kind === 'reefer' && trip.cargo !== 'oranges') return;
      const roll = streamFor(trip.seed, 'place', eventKey(stop.place, visit, eventIndex)).next();
      const extra = event.kind === 'reefer' ? trip.rig.reeferOdds : 1;
      found.push({
        stop: index,
        place: stop.place,
        name: stop.name,
        kind: event.kind,
        live: happens(event.chance, roll, odds * extra),
        miles: stopMile(trip, index) - trip.miles,
      });
    });
  }
  return found;
}

/** The diesel price at the next truck stop, in cents a gallon. */
export function nextDieselPrice(trip: Trip): number {
  return 85 + Math.floor(35 * streamFor(trip.seed, 'stop', trip.stopCount + 1).next());
}

/**
 * The road condition some miles ahead, if the rig keeps its speed. Only
 * routes with living weather can be forecast; the original's dice cannot.
 */
export function weatherAhead(trip: Trip, miles: number, speed: number): ConditionId | null {
  if (trip.route.weather.kind !== 'living') return null;
  const hours = miles / Math.max(20, speed);
  const point = pointAlong(trip.route, trip.miles + miles, (index) => stopMile(trip, index));
  const hour = (hourOfDay(trip) + Math.round(hours)) % 24;
  return conditionAt(trip.sky, point.lat, point.lon, elapsedHours(trip) + hours, hour);
}

/** A radar trap at a stop the rig will reach within the coming hour at this speed. */
export function radarWithin(trip: Trip, speed: number): Ahead | null {
  return (
    eventsAhead(trip, 3).find(
      (ahead) => ahead.kind === 'radar' && ahead.live && ahead.miles <= Math.max(speed, 1) * 1.05,
    ) ?? null
  );
}
