/**
 * Where the sun is, for the sky in the windscreen and the night side of the
 * map. Good to a degree or so, which is all a sunset needs.
 */
const RADIANS = Math.PI / 180;

export function dayOfYear(utcMs: number): number {
  const date = new Date(utcMs);
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  return (utcMs - start) / 86_400_000;
}

export function solarDeclination(utcMs: number): number {
  return 23.44 * Math.sin((2 * Math.PI * (284 + dayOfYear(utcMs))) / 365);
}

/** The sun's height above the horizon, in degrees. */
export function sunAltitude(lat: number, lon: number, utcMs: number): number {
  const declination = solarDeclination(utcMs) * RADIANS;
  const hours = (((utcMs / 3_600_000) % 24) + 24) % 24;
  const hourAngle = ((hours - 12) * 15 + lon) * RADIANS;
  const latitude = lat * RADIANS;
  const sine =
    Math.sin(latitude) * Math.sin(declination) +
    Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle);
  return Math.asin(Math.max(-1, Math.min(1, sine))) / RADIANS;
}

/**
 * The sun's direction across the sky, 0 due east at sunrise to 1 due west at
 * sunset, for placing it in a side view.
 */
export function sunArc(_lat: number, lon: number, utcMs: number): number {
  const hours = (((utcMs / 3_600_000) % 24) + 24) % 24;
  const solarNoonOffset = (hours - 12) * 15 + lon;
  return Math.max(0, Math.min(1, 0.5 + solarNoonOffset / 180));
}

/** 0 at night, 1 in full day, easing through twilight between −10° and +6°. */
export function daylight(altitude: number): number {
  const t = (altitude + 10) / 16;
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * (3 - 2 * clamped);
}
