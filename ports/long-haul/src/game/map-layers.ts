import { CORRIDORS } from '../data/corridors';
import { HUB_IDS, placeById } from '../data/places';
import { corridorRoute } from '../engine/network';
import type { Route } from '../engine/route';
import { stopMile, type Trip } from '../engine/trip';
import { placePoint } from '../map/projection';
import { pointAtMile, routeLine, sliceLine, type RouteVertex } from '../map/route-geometry';
import type { MapLayers, MapMarker, MapTown, MarkerKind, TrailPoint } from '../render/map-painter';

/**
 * What the maps show, worked out from a route or a trip in progress: the
 * line, its towns, the trail driven so far with its incidents, the rig, the
 * weather systems and the night.
 */
let networkCache: RouteVertex[][] | null = null;

export function networkLines(): RouteVertex[][] {
  networkCache ??= CORRIDORS.map((spec) => routeLine(corridorRoute(spec)));
  return networkCache;
}

export function hubTowns(): MapTown[] {
  return HUB_IDS.map((id) => ({
    ...placePoint(id),
    name: placeById(id).name,
    rank: 'hub' as const,
  }));
}

export function routeTowns(route: Route): MapTown[] {
  const towns: MapTown[] = [];
  const seen = new Set<string>();
  for (const id of [route.from, ...route.stops.map((stop) => stop.place)]) {
    if (seen.has(id)) continue;
    seen.add(id);
    const place = placeById(id);
    towns.push({
      ...placePoint(id),
      name: place.name,
      rank: place.kind === 'hub' ? 'hub' : place.kind === 'line' ? 'line' : 'stop',
    });
  }
  return towns;
}

export function tripLine(trip: Trip): RouteVertex[] {
  return routeLine(trip.route, (index) => stopMile(trip, index));
}

export function trailOf(
  trip: Trip,
  line: readonly RouteVertex[],
  uptoMile = trip.miles,
): TrailPoint[] {
  const points: TrailPoint[] = [];
  for (const point of trip.trail) {
    if (point.mile > uptoMile) break;
    points.push({ ...pointAtMile(line, point.mile), speed: point.speed });
  }
  if (points.length > 0)
    points.push({ ...pointAtMile(line, uptoMile), speed: points.at(-1)?.speed ?? 0 });
  return points;
}

const MARKS: Partial<Record<Trip['events'][number]['type'], MarkerKind>> = {
  'truck-stop': 'stop',
  slept: 'sleep',
  'pulled-over': 'ticket',
  blowout: 'blowout',
  toll: 'toll',
  'weigh-station': 'scale',
  construction: 'construction',
  barred: 'detour',
  'rock-slide': 'slide',
  crash: 'crash',
  jailed: 'ticket',
};

export function markersOf(
  trip: Trip,
  line: readonly RouteVertex[],
  uptoHr = Infinity,
): MapMarker[] {
  const markers: MapMarker[] = [];
  for (const event of trip.events) {
    if (event.hr > uptoHr) break;
    let kind = MARKS[event.type];
    if (event.type === 'weather' && (event.to === 'blizzard' || event.to === 'fog'))
      kind = 'weather';
    if (!kind) continue;
    markers.push({ ...pointAtMile(line, event.mile), kind });
  }
  return markers;
}

export interface TripLayerOptions {
  mile: number;
  /** Real hours since departure, for the weather systems. */
  elapsed: number;
  utc: number | null;
  /** Leg by leg: the leg about to be driven. */
  highlightTo?: number | null;
  pulse?: { mile: number; age: number } | null;
  withTrail: boolean;
  withMarkers: boolean;
  network: boolean;
}

export function tripLayers(trip: Trip, options: TripLayerOptions): MapLayers {
  const line = tripLine(trip);
  const rig = pointAtMile(line, options.mile);
  return {
    network: options.network ? networkLines() : undefined,
    routes: [{ line, tone: 'active' }],
    highlight:
      options.highlightTo !== undefined && options.highlightTo !== null
        ? sliceLine(line, options.mile, options.highlightTo)
        : undefined,
    trail: options.withTrail ? trailOf(trip, line, options.mile) : undefined,
    markers: options.withMarkers ? markersOf(trip, line) : undefined,
    towns: routeTowns(trip.route),
    rig,
    weather: trip.sky.length > 0 ? { systems: trip.sky, hour: options.elapsed } : null,
    nightAt: options.utc,
    zoneBands: true,
    stateNames: true,
    pulse: options.pulse
      ? { point: pointAtMile(line, options.pulse.mile), age: options.pulse.age }
      : null,
  };
}
