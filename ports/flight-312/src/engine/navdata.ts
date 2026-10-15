import { STATION_IDENTITIES } from '../data/airport-data';
import type { LatLon } from './geo';

/**
 * The 1982 program's radio world: sixteen VOR stations with the
 * frequencies of its tables, six of them with an ILS at the airport
 * nearby. Positions are the IBM PC edition's (two of the single-file
 * edition's longitudes are digit slips; see docs/games/flight-312.md),
 * converted to west-negative longitudes. Each station was identified by
 * matching its position to OurAirports' navaids (all within 0.3 nm); the
 * variation is today's published one.
 */
export interface Station {
  /** Index in the program's tables, 0–15. */
  index: number;
  ident: string;
  name: string;
  /** The program's frequency, MHz. Three stations have moved since (todayMhz). */
  frequency: number;
  todayMhz: number;
  position: LatLon;
  elevationFt: number;
  /** Magnetic variation, degrees east (west is negative). */
  variation: number;
}

/** The program's frequency and position for a station, completed from its identification. */
function station(index: number, frequency: number, lat: number, lonWest: number): Station {
  const identity = STATION_IDENTITIES.find((candidate) => candidate.index === index);
  if (!identity) throw new Error(`Station ${index} has not been identified.`);
  return {
    index,
    ident: identity.ident,
    name: identity.name,
    frequency,
    todayMhz: identity.todayMhz,
    position: { lat, lon: -lonWest },
    elevationFt: identity.elevationFt,
    variation: identity.variation,
  };
}

export const STATIONS: readonly Station[] = [
  station(0, 115.9, 40.633, 73.773),
  station(1, 113.8, 40.202, 74.495),
  station(2, 112.7, 42.358, 70.99301),
  station(3, 117.7, 41.282, 70.027),
  station(4, 117.8, 42.74301, 73.802),
  station(5, 112.2, 46.41201, 84.315),
  station(6, 117.4, 38.35, 81.77001),
  station(7, 115.5, 40.917, 77.99301),
  station(8, 116.4, 42.928, 78.64701),
  station(9, 113.6, 41.358, 82.162),
  station(10, 116.9, 42.96701, 83.74201),
  station(11, 117.0, 44.555, 88.19501),
  station(12, 112.3, 41.547, 88.318),
  station(13, 117.9, 39.495, 76.97801),
  station(14, 115.7, 42.048, 83.458),
  station(15, 112.8, 39.637, 75.303),
];

export type DestinationId = 'jfk' | 'bos' | 'ssm' | 'psb' | 'buf' | 'phl';

/**
 * An ILS destination: the program's numbers for it, and the real runway the
 * port lands on. `markerRadial` and `landingCourse` are the program's
 * VG(n,0) and VG(n,1): the radial the marker lights on, ten to twelve miles
 * out, and the heading to hold to capture the ILS.
 */
export interface Destination {
  id: DestinationId;
  station: number;
  city: string;
  airport: string;
  runway: string;
  /** The port's own localizer frequencies and identifiers, in the band of the day. */
  localizer: number;
  localizerIdent: string;
  program: { markerRadial: number; landingCourse: number };
  /** Altitude to hold, feet above sea level, until established on the glideslope. */
  interceptAltitudeFt: number;
  /** A line for the briefing. */
  note: string;
}

export const DESTINATIONS: readonly Destination[] = [
  {
    id: 'jfk',
    station: 0,
    city: 'New York',
    airport: 'KJFK',
    runway: '04R',
    localizer: 109.5,
    localizerIdent: 'IJFK',
    program: { markerRadial: 238, landingCourse: 28 },
    interceptAltitudeFt: 2000,
    note: 'Kennedy, over Jamaica Bay. The shortest trip: ninety miles up the coast.',
  },
  {
    id: 'bos',
    station: 2,
    city: 'Boston',
    airport: 'KBOS',
    runway: '04R',
    localizer: 110.3,
    localizerIdent: 'IBOS',
    program: { markerRadial: 240, landingCourse: 30 },
    interceptAltitudeFt: 2000,
    note: 'Logan, out on the harbour. The threshold is displaced 1,154 feet.',
  },
  {
    id: 'ssm',
    station: 5,
    city: 'Sault Ste. Marie',
    airport: 'CYAM',
    runway: '22',
    localizer: 109.7,
    localizerIdent: 'IYAM',
    program: { markerRadial: 90, landingCourse: 217 },
    interceptAltitudeFt: 2600,
    note: 'Across the river in Ontario: 6,000 feet of runway. Land light and stop hard.',
  },
  {
    id: 'psb',
    station: 7,
    city: 'Philipsburg',
    airport: 'KPSB',
    runway: '16',
    localizer: 108.9,
    localizerIdent: 'IPSB',
    program: { markerRadial: 299, landingCourse: 164 },
    interceptAltitudeFt: 4000,
    note: 'Up on the Allegheny plateau, 1,948 feet high, 5,711 feet long and only 100 wide.',
  },
  {
    id: 'buf',
    station: 8,
    city: 'Buffalo',
    airport: 'KBUF',
    runway: '05',
    localizer: 110.7,
    localizerIdent: 'IBUF',
    program: { markerRadial: 166, landingCourse: 42 },
    interceptAltitudeFt: 2700,
    note: 'Lake-effect country. A long final over the suburbs.',
  },
  {
    id: 'phl',
    station: 15,
    city: 'Philadelphia',
    airport: 'KPHL',
    runway: '09R',
    localizer: 109.3,
    localizerIdent: 'IPHL',
    program: { markerRadial: 341, landingCourse: 75 },
    interceptAltitudeFt: 2000,
    note: 'Home, by way of Woodstown across the Delaware: the program’s round trip.',
  },
];

export const DEPARTURE = { airport: 'KPHL', runway: '09R' } as const;

/** The program starts the takeoff here: 39.8667 N, 75.25 W, heading 075, 07:59. */
export const PROGRAM_START = { position: { lat: 39.8667, lon: -75.25 }, heading: 75 } as const;

export function stationByFrequency(frequency: number): Station | undefined {
  return STATIONS.find((candidate) => Math.abs(candidate.frequency - frequency) < 0.005);
}

export function destinationById(id: DestinationId): Destination {
  return DESTINATIONS.find((candidate) => candidate.id === id) as Destination;
}
