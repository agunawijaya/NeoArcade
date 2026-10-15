import {
  atan2,
  DEGREES_PER_RADIAN,
  normaliseDegrees,
  RADIANS_PER_DEGREE,
  sinCos,
  sinCosDegrees,
} from './exact-math';
import { EARTH_RADIUS_FT, EARTH_RADIUS_NM, FEET_PER_NM } from './units';

/**
 * Places on a spherical Earth. Latitudes and longitudes are degrees, north
 * and east positive (the 1982 program kept west longitudes positive; the
 * data tables convert once). Bearings are true, in degrees.
 */
export interface LatLon {
  lat: number;
  lon: number;
}

/** Great-circle distance in nautical miles (haversine). */
export function distanceNm(from: LatLon, to: LatLon): number {
  const halfLat = sinCos(((to.lat - from.lat) * RADIANS_PER_DEGREE) / 2).sin;
  const halfLon = sinCos(((to.lon - from.lon) * RADIANS_PER_DEGREE) / 2).sin;
  const a =
    halfLat * halfLat + sinCosDegrees(from.lat).cos * sinCosDegrees(to.lat).cos * halfLon * halfLon;
  return 2 * EARTH_RADIUS_NM * atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Initial true bearing of the great circle from one place to another. */
export function bearingTrue(from: LatLon, to: LatLon): number {
  const a = sinCosDegrees(from.lat);
  const b = sinCosDegrees(to.lat);
  const dLon = sinCosDegrees(to.lon - from.lon);
  const y = dLon.sin * b.cos;
  const x = a.cos * b.sin - a.sin * b.cos * dLon.cos;
  return normaliseDegrees(atan2(y, x) * DEGREES_PER_RADIAN);
}

/** The place a given distance away along a true bearing. */
export function destination(from: LatLon, bearing: number, distance: number): LatLon {
  const angular = distance / EARTH_RADIUS_NM;
  const a = sinCosDegrees(from.lat);
  const d = sinCos(angular);
  const course = sinCosDegrees(bearing);
  const sinLat = a.sin * d.cos + a.cos * d.sin * course.cos;
  const lat = atan2(sinLat, Math.sqrt(1 - sinLat * sinLat));
  const lon =
    from.lon * RADIANS_PER_DEGREE + atan2(course.sin * d.sin * a.cos, d.cos - a.sin * sinLat);
  return { lat: lat * DEGREES_PER_RADIAN, lon: lon * DEGREES_PER_RADIAN };
}

/**
 * A flat frame around one place, accurate to a few feet over the tens of
 * miles of an approach: north and east offsets in feet.
 */
export interface LocalFrame {
  origin: LatLon;
  toLocal(point: LatLon): { north: number; east: number };
  toLatLon(north: number, east: number): LatLon;
}

export function localFrame(origin: LatLon): LocalFrame {
  const feetPerDegreeLat = EARTH_RADIUS_FT * RADIANS_PER_DEGREE;
  const feetPerDegreeLon = feetPerDegreeLat * sinCosDegrees(origin.lat).cos;
  return {
    origin,
    toLocal: (point) => ({
      north: (point.lat - origin.lat) * feetPerDegreeLat,
      east: (point.lon - origin.lon) * feetPerDegreeLon,
    }),
    toLatLon: (north, east) => ({
      lat: origin.lat + north / feetPerDegreeLat,
      lon: origin.lon + east / feetPerDegreeLon,
    }),
  };
}

/** Moves a place by a velocity over a time step: the integration the aircraft uses. */
export function advance(point: LatLon, northFt: number, eastFt: number): LatLon {
  const radiansLat = northFt / EARTH_RADIUS_FT;
  const radiansLon = eastFt / (EARTH_RADIUS_FT * sinCosDegrees(point.lat).cos);
  return {
    lat: point.lat + radiansLat * DEGREES_PER_RADIAN,
    lon: point.lon + radiansLon * DEGREES_PER_RADIAN,
  };
}

export const feetToNm = (feet: number) => feet / FEET_PER_NM;
