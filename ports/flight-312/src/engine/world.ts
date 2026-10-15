import { angleDifference, sinCosDegrees } from './exact-math';
import type { LatLon } from './geo';
import type { Destination } from './navdata';
import { ALL_ILS, ilsFor, type Ils, type RadioStyle } from './radios';
import { airport, onRunway, runway, type Runway } from './runways';
import type { Terrain } from './terrain';
import { gustAt, nearestField, skyAt, windAt, windVector, type Weather } from './weather';

/**
 * Everything outside the aircraft that one flight needs: the ground and the
 * water, the weather, the runways it can use and the ILS it is flying to.
 */
export interface FlightWorld {
  style: RadioStyle;
  terrain: Terrain;
  weather: Weather;
  departure: Runway;
  destination: Destination;
  ils: Ils;
  ilsList: readonly Ils[];
  /** Every runway end at the departure and destination airports. */
  runways: Runway[];
}

export function createWorld(
  style: RadioStyle,
  terrain: Terrain,
  weather: Weather,
  departure: Runway,
  destination: Destination,
): FlightWorld {
  const ils = ilsFor(destination, style);
  // The 1982 rules know one runway at each end: the program's 10,500 × 200 ft strip.
  const runways =
    style === 'program'
      ? [departure, ils.runway]
      : [...new Set([departure.airport, destination.airport])].flatMap((ident) =>
          airport(ident).runways.flatMap((strip) =>
            strip.ends.map((end) => runway(ident, end.ident)),
          ),
        );
  return { style, terrain, weather, departure, destination, ils, ilsList: ALL_ILS(style), runways };
}

export type Surface =
  | { kind: 'runway'; runway: Runway; along: number; across: number }
  | { kind: 'ground' }
  | { kind: 'water' };

/**
 * What is under a point: a runway (and where on it), the ground, or water.
 * Each strip of concrete is two runways, one for each direction; given a
 * heading, the one the aircraft is pointing along is chosen.
 */
export function surfaceAt(world: FlightWorld, point: LatLon, headingTrue?: number): Surface {
  let found: Surface | null = null;
  for (const strip of world.runways) {
    const { along, across } = onRunway(strip, point);
    const fromStart = along + strip.displacedFt;
    if (fromStart < 0 || fromStart > strip.lengthFt || Math.abs(across) > strip.widthFt / 2)
      continue;
    const aligned =
      headingTrue === undefined || Math.abs(angleDifference(strip.headingTrue, headingTrue)) <= 90;
    if (aligned) return { kind: 'runway', runway: strip, along, across };
    found ??= { kind: 'runway', runway: strip, along, across };
  }
  if (found) return found;
  return world.terrain.isWater(point) ? { kind: 'water' } : { kind: 'ground' };
}

export const groundAt = (world: FlightWorld, point: LatLon) => world.terrain.elevationFt(point);

/** How far above a field its gusts reach, and the bumps inside cloud. */
const GUST_LAYER_FT = 3000;
const CLOUD_BUMPS_FPS = 4;

/**
 * The air's motion at a place and a moment, feet per second: the steady
 * wind, the gusts near the fields (stronger toward their peak speed), and a
 * restless up and down inside cloud.
 */
export function airMotion(world: FlightWorld, point: LatLon, altitudeFt: number, time: number) {
  const weather = world.weather;
  const steady = windAt(weather, point, altitudeFt);
  let speedKt = steady.speedKt;
  const field = nearestField(weather, point);
  if (
    field &&
    altitudeFt - field.elevationFt < GUST_LAYER_FT &&
    field.gustKt > field.wind.speedKt
  ) {
    const gust = gustAt(weather, time);
    speedKt += (field.gustKt - field.wind.speedKt) * (gust > 0 ? gust : 0);
  }
  const wind = windVector({ direction: steady.direction, speedKt });
  const up = skyAt(weather, point, altitudeFt).inCloud
    ? CLOUD_BUMPS_FPS * gustAt(weather, time * 1.7 + 31)
    : 0;
  return { north: wind.north, east: wind.east, up };
}

/** The wind's components on a runway: headwind (+) and crosswind from the right (+), knots. */
export function runwayWind(strip: Runway, wind: { direction: number; speedKt: number }) {
  const angle = sinCosDegrees(wind.direction - strip.headingTrue);
  return { headwindKt: wind.speedKt * angle.cos, crosswindKt: wind.speedKt * angle.sin };
}
