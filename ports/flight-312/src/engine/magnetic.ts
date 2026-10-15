import { normaliseDegrees } from './exact-math';
import { distanceNm, type LatLon } from './geo';
import { STATIONS } from './navdata';

/** The stations' published variations, weighted by the inverse square of their distance. */
function blended(point: LatLon): number {
  let weighted = 0;
  let total = 0;
  for (const station of STATIONS) {
    const distance = distanceNm(point, station.position);
    if (distance < 0.5) return station.variation;
    const weight = 1 / (distance * distance);
    weighted += station.variation * weight;
    total += weight;
  }
  return weighted / total;
}

/** The blend is worked out on a quarter-degree grid, once per corner, and interpolated in between. */
const CELL_DEGREES = 0.25;
const corners = new Map<string, number>();

function corner(row: number, col: number): number {
  const key = `${row},${col}`;
  let value = corners.get(key);
  if (value === undefined) {
    value = blended({ lat: row * CELL_DEGREES, lon: col * CELL_DEGREES });
    corners.set(key, value);
  }
  return value;
}

/**
 * Magnetic variation over the region, blended from the variation published
 * for each of the sixteen stations. Across this part of North America it
 * runs from about 2° west at Joliet to 15° west at Boston, so a compass
 * reads 076 true as 088 at Philadelphia.
 */
export function variationAt(point: LatLon): number {
  const y = point.lat / CELL_DEGREES;
  const x = point.lon / CELL_DEGREES;
  const row = Math.floor(y);
  const col = Math.floor(x);
  const fy = y - row;
  const fx = x - col;
  const south = corner(row, col) + (corner(row, col + 1) - corner(row, col)) * fx;
  const north = corner(row + 1, col) + (corner(row + 1, col + 1) - corner(row + 1, col)) * fx;
  return south + (north - south) * fy;
}

export const toMagnetic = (trueBearing: number, variation: number) =>
  normaliseDegrees(trueBearing - variation);

export const toTrue = (magneticBearing: number, variation: number) =>
  normaliseDegrees(magneticBearing + variation);
