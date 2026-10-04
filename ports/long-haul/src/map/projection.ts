import { placeById } from '../data/places';
import { ALBERS, MAP_HEIGHT, MAP_WIDTH } from './geography';

/**
 * Degrees to map units, with the same Albers projection the map was built
 * with (`scripts/build-map.ts`). Rendering only: the engine works in
 * degrees and never needs this.
 */
const RADIANS = Math.PI / 180;
const n = (Math.sin(ALBERS.parallel1 * RADIANS) + Math.sin(ALBERS.parallel2 * RADIANS)) / 2;
const C = Math.cos(ALBERS.parallel1 * RADIANS) ** 2 + 2 * n * Math.sin(ALBERS.parallel1 * RADIANS);
const rho0 = Math.sqrt(C - 2 * n * Math.sin(ALBERS.originLat * RADIANS)) / n;

export interface MapPoint {
  x: number;
  y: number;
}

export function project(lon: number, lat: number): MapPoint {
  const rho = Math.sqrt(C - 2 * n * Math.sin(lat * RADIANS)) / n;
  const theta = n * (lon - ALBERS.originLon) * RADIANS;
  const x = rho * Math.sin(theta);
  const y = rho0 - rho * Math.cos(theta);
  return { x: (x - ALBERS.minX) * ALBERS.scale, y: (ALBERS.maxY - y) * ALBERS.scale };
}

export function placePoint(id: string): MapPoint {
  const place = placeById(id);
  return project(place.lon, place.lat);
}

/** Map units per mile on the ground, roughly: for sizing weather systems and scale bars. */
export const UNITS_PER_MILE = (ALBERS.scale / 3959) * 1;

export { MAP_HEIGHT, MAP_WIDTH };
