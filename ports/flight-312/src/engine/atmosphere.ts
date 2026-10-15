import { exp, pow } from './exact-math';
import { FPS_PER_KNOT } from './units';

/**
 * The International Standard Atmosphere up to the lower stratosphere, with
 * a temperature offset for the day, and the airspeed conversions a pitot
 * tube and an air-data computer make. Altitudes are pressure altitudes in
 * feet.
 */
export const SEA_LEVEL_TEMPERATURE = 288.15;
export const SEA_LEVEL_PRESSURE = 2116.22;
export const SEA_LEVEL_DENSITY = 0.0023769;
/** Speed of sound at sea level, in knots. */
export const SEA_LEVEL_SOUND_KT = 661.4786;
const LAPSE_PER_FOOT = 0.0019812;
const TROPOPAUSE_FT = 36_089.24;
const TROPOPAUSE_TEMPERATURE = 216.65;
const TROPOPAUSE_PRESSURE_RATIO = 0.2233611;
const STRATOSPHERE_SCALE_FT = 20_805.8;

export interface Air {
  /** Kelvin. */
  temperature: number;
  /** Pressure over sea-level pressure. */
  pressureRatio: number;
  /** Density over sea-level density. */
  densityRatio: number;
  /** Slugs per cubic foot. */
  density: number;
  soundKt: number;
}

export function airAt(pressureAltitudeFt: number, temperatureOffset = 0): Air {
  const standard =
    pressureAltitudeFt < TROPOPAUSE_FT
      ? SEA_LEVEL_TEMPERATURE - LAPSE_PER_FOOT * pressureAltitudeFt
      : TROPOPAUSE_TEMPERATURE;
  const pressureRatio =
    pressureAltitudeFt < TROPOPAUSE_FT
      ? pow(standard / SEA_LEVEL_TEMPERATURE, 5.25588)
      : TROPOPAUSE_PRESSURE_RATIO *
        exp(-(pressureAltitudeFt - TROPOPAUSE_FT) / STRATOSPHERE_SCALE_FT);
  const temperature = standard + temperatureOffset;
  const densityRatio = pressureRatio / (temperature / SEA_LEVEL_TEMPERATURE);
  return {
    temperature,
    pressureRatio,
    densityRatio,
    density: SEA_LEVEL_DENSITY * densityRatio,
    soundKt: SEA_LEVEL_SOUND_KT * Math.sqrt(temperature / SEA_LEVEL_TEMPERATURE),
  };
}

/** Impact pressure for a calibrated airspeed, over sea-level pressure. */
function impactRatioFromCas(casKt: number): number {
  const ratio = casKt / SEA_LEVEL_SOUND_KT;
  return pow(1 + 0.2 * ratio * ratio, 3.5) - 1;
}

export function machFromCas(casKt: number, air: Air): number {
  const impact = impactRatioFromCas(casKt) / air.pressureRatio;
  return Math.sqrt(5 * (pow(impact + 1, 2 / 7) - 1));
}

export function tasFromCas(casKt: number, air: Air): number {
  return machFromCas(casKt, air) * air.soundKt;
}

export function casFromTas(tasKt: number, air: Air): number {
  const mach = tasKt / air.soundKt;
  const impact = (pow(1 + 0.2 * mach * mach, 3.5) - 1) * air.pressureRatio;
  return SEA_LEVEL_SOUND_KT * Math.sqrt(5 * (pow(impact + 1, 2 / 7) - 1));
}

/** Dynamic pressure in pounds per square foot. */
export function dynamicPressure(tasKt: number, air: Air): number {
  const speed = tasKt * FPS_PER_KNOT;
  return 0.5 * air.density * speed * speed;
}

/**
 * The altitude an altimeter shows, given the true altitude above sea level,
 * the day's sea-level pressure (QNH, inches of mercury) and the setting in
 * its window: about a thousand feet to the inch near the ground.
 */
export function indicatedAltitude(trueAltitudeFt: number, qnh: number, setting: number): number {
  return trueAltitudeFt + (setting - qnh) * 1000;
}

export function pressureAltitude(trueAltitudeFt: number, qnh: number): number {
  return indicatedAltitude(trueAltitudeFt, qnh, 29.92);
}
