import { angleDifference, atan2, clamp, DEGREES_PER_RADIAN, normaliseDegrees } from './exact-math';
import { bearingTrue, distanceNm, type LatLon } from './geo';
import { toMagnetic, variationAt } from './magnetic';
import { DESTINATIONS, STATIONS, type Destination, type Station } from './navdata';
import { onRunway, runway, type Runway } from './runways';
import type { Terrain } from './terrain';
import { FEET_PER_NM } from './units';

/**
 * What the radios hear. A VHF nav receiver tuned to a VOR gives the radial,
 * TO or FROM, the course deviation against the course set on the OBS and
 * the DME distance; tuned to a localizer, the localizer and glideslope
 * deviations. The marker receiver lights over the outer and middle
 * markers, and the radar altimeter measures the height of the wheels.
 *
 * `program` receivers behave as the 1982 program's did: true bearings, any
 * station within 300 nm, a needle that pegs at five degrees. `real` ones
 * use magnetic bearings, line-of-sight range and the instruments' usual
 * full-scale deflections.
 */
export type RadioStyle = 'program' | 'real';

export interface NavTuning {
  frequency: number;
  /** The course on the OBS (magnetic, or true under the program's rules). */
  course: number;
}

export type ToFrom = 'to' | 'from' | 'off';

export interface NavReading {
  kind: 'none' | 'vor' | 'localizer';
  ident: string;
  /** VOR: the radial the aircraft is on. */
  radial: number;
  /** VOR: the bearing to the station, for the RMI. */
  bearingTo: number;
  toFrom: ToFrom;
  /** Degrees; positive when the course lies to the right. Clamped to full scale. */
  deviation: number;
  /** Full-scale deviation in degrees for this receiver and station. */
  fullScale: number;
  dmeNm: number | null;
  /** Localizer only: degrees above (+) or below (−) the glideslope, or null out of coverage. */
  glideslope: number | null;
}

export interface Ils {
  destination: Destination;
  runway: Runway;
  /** Where the glideslope antenna sits, feet past the threshold. */
  glidePointFt: number;
  glideslopeDeg: number;
  outerMarkerFt: number;
  middleMarkerFt: number;
}

/** The program measured its glideslope from 750 ft past the threshold, at 2.82471°. */
export const PROGRAM_GLIDESLOPE = { pointFt: 750, angleDeg: 2.82471 } as const;
const REAL_GLIDE_POINT_FT = 1000;
const REAL_GLIDESLOPE_DEG = 3;
/** Outer marker six miles from the glideslope antenna, as in the program; middle marker 3,500 ft out. */
const OUTER_MARKER_FT = 36_481 - 750;
const MIDDLE_MARKER_FT = 3500;

export function ilsFor(destination: Destination, style: RadioStyle): Ils {
  const strip = runway(destination.airport, destination.runway, style === 'program');
  return {
    destination,
    runway: strip,
    glidePointFt: style === 'program' ? PROGRAM_GLIDESLOPE.pointFt : REAL_GLIDE_POINT_FT,
    glideslopeDeg: style === 'program' ? PROGRAM_GLIDESLOPE.angleDeg : REAL_GLIDESLOPE_DEG,
    outerMarkerFt: OUTER_MARKER_FT,
    middleMarkerFt: MIDDLE_MARKER_FT,
  };
}

export const NO_READING: NavReading = {
  kind: 'none',
  ident: '',
  radial: 0,
  bearingTo: 0,
  toFrom: 'off',
  deviation: 0,
  fullScale: 10,
  dmeNm: null,
  glideslope: null,
};

/** How far a station reaches: the program heard everything within 300 nm. */
function inRange(
  style: RadioStyle,
  distance: number,
  altitudeFt: number,
  station: Station,
): boolean {
  if (style === 'program') return distance <= 300;
  const lineOfSight =
    1.23 * (Math.sqrt(altitudeFt > 0 ? altitudeFt : 0) + Math.sqrt(station.elevationFt + 30));
  return distance <= (lineOfSight < 200 ? lineOfSight : 200);
}

export function readNav(
  tuning: NavTuning,
  position: LatLon,
  altitudeFt: number,
  style: RadioStyle,
  ilsList: readonly Ils[],
): NavReading {
  const station = STATIONS.find(
    (candidate) => Math.abs(candidate.frequency - tuning.frequency) < 0.005,
  );
  if (station) return readVor(station, tuning, position, altitudeFt, style);
  if (style === 'real') {
    const ils = ilsList.find(
      (candidate) => Math.abs(candidate.destination.localizer - tuning.frequency) < 0.005,
    );
    if (ils) return readLocalizer(ils, position, altitudeFt);
  }
  return NO_READING;
}

function readVor(
  station: Station,
  tuning: NavTuning,
  position: LatLon,
  altitudeFt: number,
  style: RadioStyle,
): NavReading {
  const distance = distanceNm(station.position, position);
  if (!inRange(style, distance, altitudeFt, station)) return NO_READING;
  const fromStation = bearingTrue(station.position, position);
  const toStation = bearingTrue(position, station.position);
  const radial = style === 'program' ? fromStation : toMagnetic(fromStation, station.variation);
  const bearingTo = style === 'program' ? toStation : toMagnetic(toStation, variationAt(position));
  const off = angleDifference(radial, tuning.course);
  const toFrom: ToFrom = Math.abs(off) > 90 ? 'to' : 'from';
  // FROM: the course is to the right when the radial is anticlockwise of it; TO, the reverse.
  const raw =
    toFrom === 'from'
      ? angleDifference(tuning.course, radial)
      : angleDifference(radial, normaliseDegrees(tuning.course + 180));
  const fullScale = style === 'program' ? 5 : 10;
  const height = (altitudeFt - station.elevationFt) / FEET_PER_NM;
  return {
    kind: 'vor',
    ident: station.ident,
    radial: normaliseDegrees(radial),
    bearingTo: normaliseDegrees(bearingTo),
    toFrom,
    deviation: clamp(raw, -fullScale, fullScale),
    fullScale,
    dmeNm: style === 'program' ? distance : Math.sqrt(distance * distance + height * height),
    glideslope: null,
  };
}

/** Localizer and glideslope geometry for a place, in the runway's own frame. */
export function ilsGeometry(ils: Ils, position: LatLon, altitudeFt: number) {
  const { along, across } = onRunway(ils.runway, position);
  const antennaAlong = ils.runway.landingLengthFt + 1000;
  const toAntenna = antennaAlong - along;
  const localizerDeg = atan2(across, toAntenna) * DEGREES_PER_RADIAN;
  const toGlidePoint = ils.glidePointFt - along;
  const height = altitudeFt - ils.runway.elevationFt;
  const elevationDeg = atan2(height, toGlidePoint) * DEGREES_PER_RADIAN;
  return { along, across, toAntenna, toGlidePoint, height, localizerDeg, elevationDeg };
}

function readLocalizer(ils: Ils, position: LatLon, altitudeFt: number): NavReading {
  const geometry = ilsGeometry(ils, position, altitudeFt);
  const rangeNm = geometry.toAntenna / FEET_PER_NM;
  if (rangeNm > 25 || rangeNm < 0 || Math.abs(geometry.localizerDeg) > 35) return NO_READING;
  const inSlopeCoverage =
    geometry.toGlidePoint > 0 &&
    geometry.toGlidePoint / FEET_PER_NM < 12 &&
    Math.abs(geometry.localizerDeg) < 8 &&
    geometry.elevationDeg > 0.3 * ils.glideslopeDeg &&
    geometry.elevationDeg < 1.75 * ils.glideslopeDeg;
  return {
    kind: 'localizer',
    ident: ils.destination.localizerIdent,
    radial: 0,
    bearingTo: 0,
    toFrom: 'off',
    // Right of the centreline the course lies to the left.
    deviation: clamp(-geometry.localizerDeg, -2.5, 2.5),
    fullScale: 2.5,
    dmeNm: null,
    glideslope: inSlopeCoverage
      ? clamp(geometry.elevationDeg - ils.glideslopeDeg, -0.7, 0.7)
      : null,
  };
}

export type Marker = 'outer' | 'middle' | null;

/** The marker receiver: lit while the aircraft is in a marker's fan above the extended centreline. */
export function readMarker(ils: Ils | null, position: LatLon, altitudeFt: number): Marker {
  if (!ils) return null;
  const { along, across, height } = ilsGeometry(ils, position, altitudeFt);
  if (height <= 0 || Math.abs(across) > 3000) return null;
  const fan = height * 0.7 > 400 ? height * 0.7 : 400;
  if (Math.abs(-along - ils.outerMarkerFt) < fan) return 'outer';
  if (Math.abs(-along - ils.middleMarkerFt) < fan) return 'middle';
  return null;
}

/** Height of the wheels over the ground, as a radar altimeter reads it, up to 2,500 ft. */
export function readRadarAltitude(
  terrain: Terrain,
  position: LatLon,
  altitudeFt: number,
): number | null {
  const height = altitudeFt - terrain.elevationFt(position);
  return height <= 2500 ? (height > 0 ? height : 0) : null;
}

export const ALL_ILS = (style: RadioStyle) =>
  DESTINATIONS.map((destination) => ilsFor(destination, style));
