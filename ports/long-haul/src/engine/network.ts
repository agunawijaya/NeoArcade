import { CORRIDORS, type CorridorSpec } from '../data/corridors';
import { HUB_IDS, placeById } from '../data/places';
import { ZONE_OFFSETS, zoneOf } from '../data/zones';
import { decodeCode } from './original-routes';
import {
  forwardRoute,
  nameBorders,
  reverseRoute,
  type Direction,
  type Route,
  type RouteStop,
  type WaypointEvent,
} from './route';

/**
 * The corridor network: hubs joined by interstates, and the routes a load
 * can take across it. A route between two hubs is a chain of corridors,
 * each driven forward or backward, joined into one waypoint table the
 * engine drives exactly like an original route.
 */
export interface Leg {
  corridor: string;
  direction: Direction;
}

const BY_ID: ReadonlyMap<string, CorridorSpec> = new Map(CORRIDORS.map((spec) => [spec.id, spec]));

export function corridorById(id: string): CorridorSpec {
  const spec = BY_ID.get(id);
  if (!spec) throw new Error(`Unknown corridor "${id}".`);
  return spec;
}

function eventsAt(
  spec: CorridorSpec,
  place: string,
  codes: number | readonly number[] | undefined,
): WaypointEvent[] {
  const list = codes === undefined ? [] : typeof codes === 'number' ? [codes] : codes;
  return list.flatMap((code) =>
    decodeCode(code).map((event): WaypointEvent => {
      if (event.kind === 'toll' && spec.oneWayTolls?.[place]) {
        return { ...event, only: spec.oneWayTolls[place] };
      }
      if (event.kind === 'rock-slide') {
        const where = spec.slideNames?.[place] ?? placeById(place).name;
        const only = spec.oneWaySlides?.[place];
        return only ? { ...event, where, only } : { ...event, where };
      }
      return event;
    }),
  );
}

/** One corridor as authored, before choosing a direction. */
export function corridorRoute(spec: CorridorSpec): Route {
  const last = spec.rows.at(-1);
  const stops: RouteStop[] = spec.rows.map(([mile, place, road, codes]) => ({
    place,
    name: placeById(place).name,
    mile,
    road,
    events: eventsAt(spec, place, codes),
    factor: spec.factor,
    fineBase: spec.fineBase,
  }));
  return {
    id: spec.id,
    name: spec.roads,
    from: spec.from,
    to: spec.to,
    miles: last?.[0] ?? 0,
    factor: spec.factor,
    fineBase: spec.fineBase,
    weather: { kind: 'living' },
    stops,
    corridors: [spec.id],
  };
}

function orientedLeg(leg: Leg): Route {
  const route = corridorRoute(corridorById(leg.corridor));
  return leg.direction === 'forward' ? forwardRoute(route) : reverseRoute(route);
}

/**
 * Clocks change where the road crosses into another zone: the first stop on
 * the far side sets them, an hour per zone, ahead going east.
 */
function withTimeZones(route: Route): Route {
  let previous = placeById(route.from);
  return {
    ...route,
    stops: route.stops.map((stop) => {
      const place = placeById(stop.place);
      const shift = ZONE_OFFSETS[zoneOf(place)] - ZONE_OFFSETS[zoneOf(previous)];
      previous = place;
      if (shift === 0) return stop;
      const zone: WaypointEvent[] = [];
      for (let hour = 0; hour < Math.abs(shift); hour++) {
        zone.push({ kind: 'time-zone', hours: shift > 0 ? 1 : -1 });
      }
      return { ...stop, events: [...zone, ...stop.events] };
    }),
  };
}

/** Joins corridors end to end into one route from the first hub to the last. */
export function joinLegs(legs: readonly Leg[]): Route {
  if (legs.length === 0) throw new Error('A route needs at least one corridor.');
  const pieces = legs.map(orientedLeg);
  const first = pieces[0] as Route;
  const stops: RouteStop[] = [];
  let offset = 0;
  for (const [index, piece] of pieces.entries()) {
    if (index > 0 && piece.from !== pieces[index - 1]?.to) {
      throw new Error(`Corridors do not meet at ${piece.from}.`);
    }
    for (const stop of piece.stops) stops.push({ ...stop, mile: stop.mile + offset });
    offset += piece.miles;
  }
  const last = pieces.at(-1) as Route;
  return nameBorders(
    withTimeZones({
      id: legs.map((leg) => `${leg.corridor}${leg.direction === 'forward' ? '' : '~'}`).join('+'),
      name: roadsOf(legs),
      from: first.from,
      to: last.to,
      miles: offset,
      factor: first.factor,
      fineBase: first.fineBase,
      weather: { kind: 'living' },
      stops,
      corridors: legs.map((leg) => leg.corridor),
    }),
  );
}

/** "I-10 · I-20 · I-30", each road named once, in the order driven. */
export function roadsOf(legs: readonly Leg[]): string {
  const roads: string[] = [];
  for (const leg of legs) {
    const named = corridorById(leg.corridor).roads.split(' · ');
    const ordered = leg.direction === 'forward' ? named : [...named].reverse();
    for (const road of ordered) if (!roads.includes(road)) roads.push(road);
  }
  return roads.join(' · ');
}

interface Edge {
  to: string;
  miles: number;
  leg: Leg;
}

function buildGraph(): Map<string, Edge[]> {
  const graph = new Map<string, Edge[]>(HUB_IDS.map((hub) => [hub, []]));
  for (const spec of CORRIDORS) {
    const miles = spec.rows.at(-1)?.[0] ?? 0;
    graph
      .get(spec.from)
      ?.push({ to: spec.to, miles, leg: { corridor: spec.id, direction: 'forward' } });
    graph
      .get(spec.to)
      ?.push({ to: spec.from, miles, leg: { corridor: spec.id, direction: 'backward' } });
  }
  return graph;
}

const GRAPH = buildGraph();

/** Shortest road miles from every hub to `target` (Dijkstra; nineteen hubs). */
function distancesTo(target: string): Map<string, number> {
  const distance = new Map<string, number>(HUB_IDS.map((hub) => [hub, Infinity]));
  distance.set(target, 0);
  const open = new Set(HUB_IDS);
  while (open.size > 0) {
    let nearest: string | null = null;
    for (const hub of open) {
      if (
        nearest === null ||
        (distance.get(hub) ?? Infinity) < (distance.get(nearest) ?? Infinity)
      ) {
        nearest = hub;
      }
    }
    if (nearest === null) break;
    open.delete(nearest);
    const here = distance.get(nearest) ?? Infinity;
    for (const edge of GRAPH.get(nearest) ?? []) {
      const through = here + edge.miles;
      if (through < (distance.get(edge.to) ?? Infinity)) distance.set(edge.to, through);
    }
  }
  return distance;
}

export function shortestMiles(from: string, to: string): number {
  return distancesTo(to).get(from) ?? Infinity;
}

export interface RouteOption {
  legs: Leg[];
  miles: number;
  hubs: string[];
}

/**
 * Up to `count` ways from one hub to another, shortest first, none more than
 * `stretch` times the shortest. Every path is simple: no hub twice.
 */
export function routeOptions(from: string, to: string, count = 3, stretch = 1.35): RouteOption[] {
  if (from === to) return [];
  const remaining = distancesTo(to);
  const best = remaining.get(from) ?? Infinity;
  if (!Number.isFinite(best)) return [];
  const limit = best * stretch;
  const found: RouteOption[] = [];
  const walk = (hub: string, miles: number, legs: Leg[], hubs: string[]) => {
    if (hub === to) {
      found.push({ legs: [...legs], miles, hubs: [...hubs] });
      return;
    }
    for (const edge of GRAPH.get(hub) ?? []) {
      if (hubs.includes(edge.to)) continue;
      const total = miles + edge.miles;
      if (total + (remaining.get(edge.to) ?? Infinity) > limit) continue;
      legs.push(edge.leg);
      hubs.push(edge.to);
      walk(edge.to, total, legs, hubs);
      legs.pop();
      hubs.pop();
    }
  };
  walk(from, 0, [], [from]);
  found.sort((a, b) => a.miles - b.miles || a.legs.length - b.legs.length);
  // Two options that share every corridor but one barely differ; prefer variety.
  const chosen: RouteOption[] = [];
  for (const option of found) {
    if (chosen.length >= count) break;
    const similar = chosen.some((other) => overlap(other, option) > 0.85);
    if (!similar) chosen.push(option);
  }
  return chosen;
}

/** Share of `b`'s miles that run along corridors `a` also uses. */
function overlap(a: RouteOption, b: RouteOption): number {
  const shared = b.legs
    .filter((leg) => a.legs.some((other) => other.corridor === leg.corridor))
    .reduce((sum, leg) => sum + (corridorById(leg.corridor).rows.at(-1)?.[0] ?? 0), 0);
  return b.miles > 0 ? shared / b.miles : 0;
}

export function routeFor(option: RouteOption): Route {
  return joinLegs(option.legs);
}
