import { AIRPORTS, type AirportData } from '../data/airport-data';
import { sinCosDegrees } from './exact-math';
import { advance, localFrame, type LatLon } from './geo';

/**
 * Runways as the engine flies them: a threshold, a heading and a strip of
 * concrete ahead of it. Positions come from OurAirports; a displaced
 * threshold moves the landing threshold down the runway, and the 1982
 * rules lay the program's 10,500 × 200 ft runway over the real one.
 */
export interface Runway {
  airport: string;
  ident: string;
  /** Where the landing threshold is (after any displacement). */
  threshold: LatLon;
  /** The physical start of the runway, where a takeoff begins. */
  start: LatLon;
  elevationFt: number;
  /** Elevation at the far end. */
  farElevationFt: number;
  headingTrue: number;
  /** Concrete from the physical start to the far end. */
  lengthFt: number;
  /** From the landing threshold to the far end. */
  landingLengthFt: number;
  displacedFt: number;
  widthFt: number;
}

/** The program's runway, the same everywhere: 10,500 by 200 feet. */
export const PROGRAM_RUNWAY = { lengthFt: 10_500, widthFt: 200 } as const;

export function airport(ident: string): AirportData {
  const found = AIRPORTS.find((candidate) => candidate.ident === ident);
  if (!found) throw new Error(`No data for airport ${ident}.`);
  return found;
}

export function runway(airportIdent: string, ident: string, programSize = false): Runway {
  const data = airport(airportIdent);
  for (const strip of data.runways) {
    const [a, b] = strip.ends;
    const here = a.ident === ident ? a : b.ident === ident ? b : null;
    if (!here) continue;
    const start = { lat: here.lat, lon: here.lon };
    const headingTrue = here.headingTrue;
    const displacedFt = programSize ? 0 : here.displacedFt;
    const along = sinCosDegrees(headingTrue);
    const threshold = advance(start, along.cos * displacedFt, along.sin * displacedFt);
    const lengthFt = programSize ? PROGRAM_RUNWAY.lengthFt : strip.lengthFt;
    return {
      airport: airportIdent,
      ident,
      threshold,
      start,
      // The terrain levels each airport to its field elevation, so the runways sit at it too.
      elevationFt: data.elevationFt,
      farElevationFt: data.elevationFt,
      headingTrue,
      lengthFt,
      landingLengthFt: lengthFt - displacedFt,
      displacedFt,
      widthFt: programSize ? PROGRAM_RUNWAY.widthFt : strip.widthFt,
    };
  }
  throw new Error(`Airport ${airportIdent} has no runway ${ident}.`);
}

/**
 * A place measured from a runway threshold: `along` the runway (feet ahead
 * of the threshold, negative before it) and `across` it (feet right of the
 * centreline, looking down the runway).
 */
export function onRunway(strip: Runway, point: LatLon): { along: number; across: number } {
  const frame = localFrame(strip.threshold);
  const { north, east } = frame.toLocal(point);
  const heading = sinCosDegrees(strip.headingTrue);
  return {
    along: north * heading.cos + east * heading.sin,
    across: east * heading.cos - north * heading.sin,
  };
}

/** The place `along` feet down the centreline and `across` feet to its right. */
export function runwayPoint(strip: Runway, along: number, across: number): LatLon {
  const heading = sinCosDegrees(strip.headingTrue);
  const north = along * heading.cos - across * heading.sin;
  const east = along * heading.sin + across * heading.cos;
  return localFrame(strip.threshold).toLatLon(north, east);
}
