import { createRng, type Rng } from '@shared/rng';
import { clamp, normaliseDegrees, sinCos, sinCosDegrees, TWO_PI } from './exact-math';
import { distanceNm, type LatLon } from './geo';
import { FPS_PER_KNOT } from './units';

/**
 * The weather of one flight, worked out from its seed: winds aloft in the
 * program's eleven 4,000-foot bands, the surface wind and its gusts, the
 * low cloud at both ends that makes the approach the drama, the layers en
 * route ("scattered at 20,000, broken at 30,000"), the altimeter setting
 * and the temperature. The 1982 program seeded its generator with the same
 * constant every time (RANDOMIZE 57.2958), so every flight had the same
 * sky; each flight here has its own, and that constant is offered as an
 * option for the purist.
 */
export type WindStyle = 'program' | 'realistic';

export interface WindBand {
  /** True direction the wind blows from, degrees. */
  direction: number;
  speedKt: number;
}

export interface FieldWeather {
  position: LatLon;
  elevationFt: number;
  wind: WindBand;
  gustKt: number;
  /** Base of the overcast above the field, feet above it, or null for none. */
  ceilingFt: number | null;
  /** How thick that overcast is, feet. */
  cloudDepthFt: number;
  visibilityMi: number;
  rain: boolean;
  /** Sea-level pressure, inches of mercury. */
  qnh: number;
  temperatureC: number;
}

export interface CloudLayer {
  baseFt: number;
  topFt: number;
  /** Octas of sky covered, 0–8. */
  cover: number;
}

export interface Weather {
  seed: number;
  style: WindStyle;
  departure: FieldWeather;
  destination: FieldWeather;
  /** Layers everywhere along the route, feet above sea level. */
  layers: CloudLayer[];
  bands: WindBand[];
  /** The program's takeoff head- (+) or tailwind (−) gust, W3, knots. */
  takeoffGustKt: number;
  /** The program's drift on final, RW, knots to the right (+) or left (−). */
  finalDriftKt: number;
  /** Which way the takeoff gusts push the nose: +1 right, −1 left. */
  gustSide: 1 | -1;
  /** The degrees each eighteen-second gust swings the nose on the roll, one or two (RND(2)). */
  gustSwings: number[];
  /** ISA deviation, °C. */
  temperatureOffset: number;
  /** Phases of the gust oscillators, so gusts differ between flights. */
  gustPhases: number[];
}

export const BAND_DEPTH_FT = 4000;
export const BAND_COUNT = 11;
/** The constant the single-file program seeded every flight with. */
export const PROGRAM_SEED = 572_958;

export interface WeatherRequest {
  seed: number;
  style: WindStyle;
  departure: { position: LatLon; elevationFt: number };
  destination: { position: LatLon; elevationFt: number };
  /** Practice approaches choose the sky at the destination. */
  destinationSky?: DestinationSky;
  /** And the surface wind there. */
  destinationWind?: { direction: number; speedKt: number; gustKt: number };
}

export type DestinationSky = 'clear' | 'low' | 'minimums' | 'fog';

/** Runway ends closer than this belong to one airport. */
const SAME_FIELD_NM = 3;

export function generateWeather(request: WeatherRequest): Weather {
  const rng = createRng(request.seed);
  const style = request.style;
  const bands = style === 'program' ? programBands(rng) : realisticBands(rng);
  const gustSide: 1 | -1 = rng.next() < 0.5 ? -1 : 1;
  const takeoffGustKt = gustSide * rng.int(1, 20);
  const finalDriftKt = (rng.next() < 0.5 ? -1 : 1) * rng.float(5, 15);
  const temperatureOffset = rng.float(-12, -2);

  // "Surface winds variable, gusting to 15. Minimum ceiling conditions are in effect."
  const departure: FieldWeather = {
    ...request.departure,
    wind: { direction: rng.float(0, 360), speedKt: rng.float(3, 9) },
    gustKt: 15,
    ceilingFt: rng.int(2, 4) * 100,
    cloudDepthFt: rng.int(14, 26) * 100,
    visibilityMi: rng.pick([0.5, 0.75, 1]),
    rain: false,
    qnh: round2(rng.float(29.62, 30.28)),
    temperatureC: round1(rng.float(1, 8)),
  };
  const destination = destinationWeather(rng, request);
  // Back to Philadelphia, the field has one weather: the one the approach asked for.
  const sameField =
    distanceNm(request.departure.position, request.destination.position) < SAME_FIELD_NM;

  return {
    seed: request.seed,
    style,
    departure: sameField
      ? { ...destination, position: departure.position, elevationFt: departure.elevationFt }
      : departure,
    destination,
    layers: [
      { baseFt: 20_000, topFt: 21_500, cover: 3 },
      { baseFt: 30_000, topFt: 32_500, cover: 6 },
    ],
    bands,
    takeoffGustKt,
    finalDriftKt,
    gustSide,
    gustSwings: Array.from({ length: 64 }, () => rng.int(1, 2)),
    temperatureOffset,
    gustPhases: Array.from({ length: 6 }, () => rng.float(0, TWO_PI)),
  };
}

/** The program's wind table: bands 0–7 any direction, 8–10 from the west; 25 kt more per band. */
function programBands(rng: Rng): WindBand[] {
  return Array.from({ length: BAND_COUNT }, (_, band) => ({
    direction: band < 8 ? rng.int(1, 359) : rng.float(225, 315),
    speedKt: band === 0 ? 0 : 25 * rng.next() + 25 * (band - 1),
  }));
}

/** Winds as an East Coast February has them: veering westerlies, a jet near 33,000 ft. */
function realisticBands(rng: Rng): WindBand[] {
  const jetDirection = rng.float(250, 300);
  const jetSpeed = rng.float(70, 140);
  const surfaceDirection = rng.float(0, 360);
  return Array.from({ length: BAND_COUNT }, (_, band) => {
    const altitude = band * BAND_DEPTH_FT + BAND_DEPTH_FT / 2;
    const toJet = clamp(altitude / 33_000, 0, 1);
    const aboveJet = altitude > 33_000 ? 1 - (altitude - 33_000) / 30_000 : 1;
    const speed = (8 + (jetSpeed - 8) * toJet * toJet) * aboveJet + rng.float(-6, 6);
    const blend = clamp(toJet * 1.4, 0, 1);
    return {
      direction: normaliseDegrees(
        mixDirection(surfaceDirection, jetDirection, blend) + rng.float(-8, 8),
      ),
      speedKt: speed > 2 ? speed : 2,
    };
  });
}

function destinationWeather(rng: Rng, request: WeatherRequest): FieldWeather {
  const sky = request.destinationSky ?? rng.pick(['low', 'minimums', 'minimums'] as const);
  const wind = request.destinationWind ?? {
    direction: rng.float(0, 360),
    speedKt: rng.float(4, 16),
    gustKt: rng.next() < 0.5 ? 0 : rng.float(18, 26),
  };
  const ceiling: Record<DestinationSky, number | null> = {
    clear: null,
    low: rng.int(4, 8) * 100,
    minimums: rng.int(2, 3) * 100,
    fog: 100,
  };
  const visibility: Record<DestinationSky, number> = {
    clear: 10,
    low: rng.pick([1.5, 2, 3]),
    minimums: rng.pick([0.5, 0.75]),
    fog: 0.25,
  };
  return {
    ...request.destination,
    wind: { direction: wind.direction, speedKt: wind.speedKt },
    gustKt: wind.gustKt,
    ceilingFt: ceiling[sky],
    cloudDepthFt: rng.int(25, 45) * 100,
    visibilityMi: visibility[sky],
    rain: sky !== 'clear' && rng.next() < 0.7,
    qnh: round2(rng.float(29.55, 30.25)),
    temperatureC: round1(rng.float(-3, 6)),
  };
}

function mixDirection(from: number, to: number, t: number): number {
  let difference = (to - from) % 360;
  if (difference > 180) difference -= 360;
  if (difference < -180) difference += 360;
  return normaliseDegrees(from + difference * t);
}

const round1 = (value: number) => Math.round(value * 10) / 10;
const round2 = (value: number) => Math.round(value * 100) / 100;

/** Below this height above a field its surface wind takes over from the bands. */
const SURFACE_LAYER_FT = 2000;
/** Fields within this distance lend the flight their surface wind and low cloud. */
const FIELD_RADIUS_NM = 40;

/** The steady wind at a place and altitude: where it blows from, and how hard. */
export function windAt(weather: Weather, point: LatLon, altitudeFt: number): WindBand {
  const band = bandAt(weather, altitudeFt);
  const field = nearestField(weather, point);
  if (!field) return band;
  const height = altitudeFt - field.elevationFt;
  if (height >= SURFACE_LAYER_FT) return band;
  const t = height > 0 ? height / SURFACE_LAYER_FT : 0;
  return {
    direction: mixDirection(field.wind.direction, band.direction, t),
    speedKt: field.wind.speedKt + (band.speedKt - field.wind.speedKt) * t,
  };
}

function bandAt(weather: Weather, altitudeFt: number): WindBand {
  const position = (altitudeFt > 0 ? altitudeFt : 0) / BAND_DEPTH_FT;
  const index = Math.floor(position) < BAND_COUNT - 1 ? Math.floor(position) : BAND_COUNT - 1;
  const here = weather.bands[index] as WindBand;
  // The program's wind jumps at each band's edge; the real one changes smoothly between band centres.
  if (weather.style === 'program' || index === BAND_COUNT - 1) return here;
  const above = weather.bands[index + 1] as WindBand;
  const t = position - index;
  return {
    direction: mixDirection(here.direction, above.direction, t),
    speedKt: here.speedKt + (above.speedKt - here.speedKt) * t,
  };
}

export function nearestField(weather: Weather, point: LatLon): FieldWeather | null {
  const toDeparture = distanceNm(point, weather.departure.position);
  const toDestination = distanceNm(point, weather.destination.position);
  if (toDeparture > FIELD_RADIUS_NM && toDestination > FIELD_RADIUS_NM) return null;
  return toDeparture <= toDestination ? weather.departure : weather.destination;
}

/**
 * The gust at a moment, from −1 to 1: a few slow oscillators with the
 * flight's own phases, so it never repeats within a flight and is the same
 * on every replay.
 */
export function gustAt(weather: Weather, time: number): number {
  const periods = [7.1, 11.3, 17.9, 4.3, 23.7, 2.9];
  let sum = 0;
  let total = 0;
  periods.forEach((period, index) => {
    const amplitude = 1 / (1 + index * 0.4);
    sum += amplitude * sinCos((TWO_PI * time) / period + (weather.gustPhases[index] ?? 0)).sin;
    total += amplitude;
  });
  return sum / total;
}

/** The wind as a velocity of the air mass: feet per second toward north and east. */
export function windVector(wind: WindBand): { north: number; east: number } {
  const from = sinCosDegrees(wind.direction);
  const speed = wind.speedKt * FPS_PER_KNOT;
  return { north: -from.cos * speed, east: -from.sin * speed };
}

export interface Sky {
  /** Inside cloud: the view is grey. */
  inCloud: boolean;
  /** How far the pilot can see, statute miles. */
  visibilityMi: number;
  rain: boolean;
}

/** What it looks like outside at a place and altitude. */
export function skyAt(weather: Weather, point: LatLon, altitudeFt: number): Sky {
  for (const layer of weather.layers) {
    if (altitudeFt >= layer.baseFt && altitudeFt <= layer.topFt && layer.cover >= 5) {
      return { inCloud: true, visibilityMi: 0.1, rain: false };
    }
  }
  const field = nearestField(weather, point);
  if (field && field.ceilingFt !== null) {
    const base = field.elevationFt + field.ceilingFt;
    if (altitudeFt >= base && altitudeFt <= base + field.cloudDepthFt) {
      return { inCloud: true, visibilityMi: 0.05, rain: field.rain };
    }
    if (altitudeFt < base)
      return { inCloud: false, visibilityMi: field.visibilityMi, rain: field.rain };
  }
  return { inCloud: false, visibilityMi: 10, rain: false };
}
