import type { LatLon } from '../engine/geo';

/**
 * Where the sun is: the NOAA solar position equations, good to a fraction
 * of a degree, for the flight's date and local time. The flight is set on a
 * late-February morning in 1982, Eastern Standard Time, five hours behind
 * Greenwich; every destination keeps the same clock.
 */
export const FLIGHT_DATE = { year: 1982, month: 2, day: 25 } as const;
const UTC_OFFSET_HOURS = -5;

export interface SunPosition {
  /** Degrees above the horizon. */
  elevation: number;
  /** Degrees clockwise from true north. */
  azimuth: number;
}

const RADIANS = Math.PI / 180;

function julianDay(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

/** The sun at a place, `secondsAfterMidnight` local time on the flight's date. */
export function sunAt(place: LatLon, secondsAfterMidnight: number): SunPosition {
  const utcHours = secondsAfterMidnight / 3600 - UTC_OFFSET_HOURS;
  const jd = julianDay(FLIGHT_DATE.year, FLIGHT_DATE.month, FLIGHT_DATE.day) - 0.5 + utcHours / 24;
  const t = (jd - 2451545) / 36525;
  const meanLongitude = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const meanAnomaly = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const centre =
    Math.sin(meanAnomaly * RADIANS) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * meanAnomaly * RADIANS) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * meanAnomaly * RADIANS) * 0.000289;
  const trueLongitude = meanLongitude + centre;
  const omega = 125.04 - 1934.136 * t;
  const apparent = trueLongitude - 0.00569 - 0.00478 * Math.sin(omega * RADIANS);
  const obliquity =
    23 +
    (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60 +
    0.00256 * Math.cos(omega * RADIANS);
  const declination = Math.asin(Math.sin(obliquity * RADIANS) * Math.sin(apparent * RADIANS));
  const y = Math.tan((obliquity / 2) * RADIANS) ** 2;
  const equationOfTime =
    (4 *
      (y * Math.sin(2 * meanLongitude * RADIANS) -
        2 * eccentricity * Math.sin(meanAnomaly * RADIANS) +
        4 *
          eccentricity *
          y *
          Math.sin(meanAnomaly * RADIANS) *
          Math.cos(2 * meanLongitude * RADIANS) -
        0.5 * y * y * Math.sin(4 * meanLongitude * RADIANS) -
        1.25 * eccentricity * eccentricity * Math.sin(2 * meanAnomaly * RADIANS))) /
    RADIANS;
  const trueSolarMinutes =
    (((utcHours * 60 + equationOfTime + 4 * place.lon) % 1440) + 1440) % 1440;
  const hourAngle = (trueSolarMinutes / 4 - 180) * RADIANS;
  const latitude = place.lat * RADIANS;
  const cosZenith =
    Math.sin(latitude) * Math.sin(declination) +
    Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle);
  const zenith = Math.acos(Math.min(1, Math.max(-1, cosZenith)));
  const azimuth =
    Math.atan2(
      Math.sin(hourAngle),
      Math.cos(hourAngle) * Math.sin(latitude) - Math.tan(declination) * Math.cos(latitude),
    ) /
      RADIANS +
    180;
  return { elevation: 90 - zenith / RADIANS, azimuth: azimuth % 360 };
}

/** "08:04" for a time of day in seconds. */
export function clockText(secondsAfterMidnight: number): string {
  const minutes = Math.floor(secondsAfterMidnight / 60) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
