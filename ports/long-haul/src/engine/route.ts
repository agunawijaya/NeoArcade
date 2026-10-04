import { placeById, STATE_NAMES } from '../data/places';
import type { RegionId } from '../data/regions';

/**
 * A route is the original's waypoint table made explicit: an ordered list of
 * stops along the road, each at a mile from the start, with the road that
 * leads to it and what can happen on passing it. The last stop is the
 * destination. Single Haul uses the three original tables; Career and the Daily
 * Haul join corridors of the same shape (see `planner.ts`).
 */
export type WaypointEvent = (
  | /** Code 1: the clock moves an hour (ahead going east). */
    { kind: 'time-zone'; hours: 1 | -1 }
    /** Code 2: the fraction is the toll in dollars. */
  | { kind: 'toll'; cents: number }
  /** Code 3: a 35 mph work zone for the next hour. */
  | { kind: 'construction'; chance: number }
  /** Code 4: a radar trap clocks the truck. */
  | { kind: 'radar'; chance: number }
  /** Code 5: a weigh station; code 5 exactly also bars an overweight truck from a state. */
  | { kind: 'weigh-station'; chance: number; barrier?: StateBarrier }
  /** Code 6: a rock slide closes the road for up to five hours. */
  | { kind: 'rock-slide'; chance: number; where: string }
  /** Code 7: the trailer's refrigeration unit fails (oranges only). */
  | { kind: 'reefer'; chance: number }
) & {
  /**
   * Only in one direction of travel: a toll taken on the way into New York,
   * a barrier at the state line you cross going that way.
   */
  only?: Direction;
};

export type Direction = 'forward' | 'backward';

export type WaypointEventKind = WaypointEvent['kind'];

/** The Louisiana rule of lines 3630–3680, in general form. */
export interface StateBarrier {
  state: string;
  detourMiles: number;
  /** The road name for the detour leg. */
  via: string;
  limit: number;
}

export interface RouteStop {
  /** Id of the place in `data/places.ts`. */
  place: string;
  /** The landscape on the way here, when it differs from the place's own. */
  region?: RegionId;
  /** The name shown on the road, which may differ from the town's ("End of Interstate"). */
  name: string;
  mile: number;
  /** The road that leads to this stop. */
  road: string;
  events: readonly WaypointEvent[];
  /** Speed limit on the road leading here, when it is not 55. */
  limit?: number;
  /** RH and RT for the road leading here, on routes joined from corridors. */
  factor?: number;
  fineBase?: number;
  /** The original code from the DATA line, for the original routes. */
  code?: number;
}

export type WeatherModel =
  /** The original formula, with one of its three regional profiles. */
  | { kind: 'original'; profile: 'north' | 'middle' | 'south' }
  /** Weather systems drifting across the map (`living-weather.ts`). */
  | { kind: 'living' };

export interface Route {
  id: string;
  name: string;
  /** Place ids of the start and the destination. */
  from: string;
  to: string;
  miles: number;
  /**
   * RH: 4 north, 2 middle, 1 south. A bigger number means fewer blowouts
   * (line 1440) but stricter police (lines 1450 and 2310).
   */
  factor: number;
  /** RT, which the original folds into every fine (line 2390). */
  fineBase: number;
  weather: WeatherModel;
  /** In order; the last is the destination, at `miles`. */
  stops: readonly RouteStop[];
  /** Corridor ids the route was joined from; empty for the original tables. */
  corridors: readonly string[];
}

/** Keeps the events that apply going this way. A route as authored runs forward. */
function eventsGoing(events: readonly WaypointEvent[], direction: Direction): WaypointEvent[] {
  return events
    .filter((event) => event.only === undefined || event.only === direction)
    .map((event) => {
      const rest: WaypointEvent = { ...event };
      delete rest.only;
      if (direction === 'backward' && rest.kind === 'time-zone') {
        return { ...rest, hours: rest.hours === 1 ? -1 : 1 } as WaypointEvent;
      }
      return rest as WaypointEvent;
    });
}

/** The route as authored, with the events meant for the other direction removed. */
export function forwardRoute(route: Route): Route {
  return {
    ...route,
    stops: route.stops.map((stop) => ({ ...stop, events: eventsGoing(stop.events, 'forward') })),
  };
}

/**
 * The same road driven the other way. Mileposts count from the far end;
 * each stop is reached by the road that left it going forward; clocks turn
 * back where they went ahead; and events marked for one direction stay with
 * it. The old start becomes the destination.
 */
export function reverseRoute(route: Route, id = `${route.id}-back`, name = route.name): Route {
  const stops = route.stops;
  const destination = destinationStop(route);
  const reversed: RouteStop[] = [];
  for (let index = stops.length - 2; index >= 0; index--) {
    const stop = stops[index] as RouteStop;
    const leadingIn = stops[index + 1] as RouteStop;
    reversed.push(
      withoutUndefined({
        place: stop.place,
        region: stop.region,
        name: stop.name,
        mile: route.miles - stop.mile,
        road: leadingIn.road,
        limit: leadingIn.limit,
        factor: leadingIn.factor,
        fineBase: leadingIn.fineBase,
        events: eventsGoing(stop.events, 'backward'),
        code: stop.code,
      }),
    );
  }
  const first = stops[0];
  reversed.push(
    withoutUndefined({
      place: route.from,
      name: placeById(route.from).name,
      mile: route.miles,
      road: first?.road ?? destination.road,
      limit: first?.limit,
      factor: first?.factor,
      fineBase: first?.fineBase,
      events: [],
    }),
  );
  return {
    ...route,
    id,
    name,
    from: route.to,
    to: route.from,
    stops: reversed,
  };
}

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T;
}

/**
 * State lines are named for the state they lead into, as the original tables
 * name them going east ("Ohio border"); driven the other way the same line
 * is the Indiana border.
 */
export function nameBorders(route: Route): Route {
  return {
    ...route,
    stops: route.stops.map((stop, index) => {
      if (placeById(stop.place).kind !== 'line') return stop;
      const ahead = route.stops[index + 1] ?? stop;
      const state = STATE_NAMES[placeById(ahead.place).state];
      return state ? { ...stop, name: `${state} border` } : stop;
    }),
  };
}

export function destinationStop(route: Route): RouteStop {
  const last = route.stops.at(-1);
  if (!last) throw new Error(`Route ${route.id} has no stops.`);
  return last;
}

/** Tolls a route will certainly charge, in cents, for comparing routes before choosing. */
export function knownTolls(route: Route): number {
  return route.stops.reduce(
    (sum, stop) =>
      sum +
      stop.events.reduce((cents, event) => cents + (event.kind === 'toll' ? event.cents : 0), 0),
    0,
  );
}

export function countEvents(route: Route, kind: WaypointEventKind): number {
  return route.stops.reduce(
    (count, stop) => count + stop.events.filter((event) => event.kind === kind).length,
    0,
  );
}
