import { placeById } from '../data/places';
import type { Route } from '../engine/route';
import { placePoint, type MapPoint } from './projection';

/**
 * A route as a line on the map: the start, then every stop, each with its
 * milepost on this trip. Positions in between are read off by miles.
 */
export interface RouteVertex extends MapPoint {
  mile: number;
  place: string;
}

export function routeLine(route: Route, stopMiles?: (index: number) => number): RouteVertex[] {
  const start = placePoint(route.from);
  return [
    { ...start, mile: 0, place: route.from },
    ...route.stops.map((stop, index) => ({
      ...placePoint(stop.place),
      mile: stopMiles ? stopMiles(index) : stop.mile,
      place: stop.place,
    })),
  ];
}

export function pointAtMile(
  line: readonly RouteVertex[],
  mile: number,
): MapPoint & { heading: number } {
  for (let index = 1; index < line.length; index++) {
    const from = line[index - 1] as RouteVertex;
    const to = line[index] as RouteVertex;
    if (mile <= to.mile || index === line.length - 1) {
      const span = to.mile - from.mile;
      const t = span > 0 ? Math.max(0, Math.min(1, (mile - from.mile) / span)) : 1;
      return {
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
        heading: Math.atan2(to.y - from.y, to.x - from.x),
      };
    }
  }
  const only = line[0] ?? { x: 0, y: 0 };
  return { x: only.x, y: only.y, heading: 0 };
}

/** The part of a line between two mileposts, for highlighting a leg or a trail. */
export function sliceLine(
  line: readonly RouteVertex[],
  fromMile: number,
  toMile: number,
): MapPoint[] {
  const points: MapPoint[] = [pointAtMile(line, fromMile)];
  for (const vertex of line)
    if (vertex.mile > fromMile && vertex.mile < toMile) points.push(vertex);
  points.push(pointAtMile(line, toMile));
  return points;
}

export function boundsOf(points: readonly MapPoint[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { minX, minY, maxX, maxY };
}

export function placeLabel(id: string): string {
  return placeById(id).name;
}
