import { sinCosDegrees } from './exact-math';
import { bearingTrue, distanceNm, type LatLon } from './geo';
import { toMagnetic, variationAt } from './magnetic';
import { STATIONS, type Destination, type DestinationId, type Station } from './navdata';
import { windAt, type Weather } from './weather';

/**
 * The flight plan on the briefing screen: VOR to VOR along the program's
 * own stations, each leg a course to fly and a distance; a cruising
 * altitude for the distance; the fuel it should take; the wind expected up
 * there. And the radio facilities the flight will talk to: the port's own
 * frequencies, each in the right band for its job.
 */
export interface PlanLeg {
  station: Station;
  /** Course to the station, magnetic, and true. */
  course: number;
  courseTrue: number;
  distanceNm: number;
}

export interface FlightPlan {
  legs: PlanLeg[];
  totalNm: number;
  cruiseAltitudeFt: number;
  tripFuelLb: number;
  reserveFuelLb: number;
  blockFuelLb: number;
  expectedWind: { direction: number; speedKt: number };
  minutes: number;
}

export interface Facilities {
  clearance: number;
  tower: number;
  departure: number;
  departureName: string;
  center: number;
  centerName: string;
  approach: number;
  approachName: string;
  arrivalTower: number;
  arrivalTowerName: string;
}

const PHILADELPHIA = {
  clearance: 118.85,
  tower: 118.5,
  departure: 124.35,
  departureName: 'Philadelphia',
};

const ARRIVALS: Record<DestinationId, Omit<Facilities, keyof typeof PHILADELPHIA>> = {
  jfk: {
    center: 128.5,
    centerName: 'New York',
    approach: 127.4,
    approachName: 'New York',
    arrivalTower: 119.1,
    arrivalTowerName: 'Kennedy',
  },
  bos: {
    center: 133.45,
    centerName: 'Boston',
    approach: 120.6,
    approachName: 'Boston',
    arrivalTower: 128.8,
    arrivalTowerName: 'Boston',
  },
  ssm: {
    center: 132.15,
    centerName: 'Toronto',
    approach: 119.4,
    approachName: 'Sault',
    arrivalTower: 118.3,
    arrivalTowerName: 'Sault',
  },
  psb: {
    center: 132.1,
    centerName: 'Cleveland',
    approach: 125.2,
    approachName: 'Philipsburg',
    arrivalTower: 122.95,
    arrivalTowerName: 'Mid-State',
  },
  buf: {
    center: 134.75,
    centerName: 'Cleveland',
    approach: 126.5,
    approachName: 'Buffalo',
    arrivalTower: 120.5,
    arrivalTowerName: 'Buffalo',
  },
  phl: {
    center: 132.75,
    centerName: 'New York',
    approach: 128.4,
    approachName: 'Philadelphia',
    arrivalTower: 118.5,
    arrivalTowerName: 'Philadelphia',
  },
};

export function facilitiesFor(destination: DestinationId): Facilities {
  return { ...PHILADELPHIA, ...ARRIVALS[destination] };
}

/** Longest leg between stations: about as far as a VOR is heard at the cruising levels. */
const MAX_LEG_NM = 220;
/** Each extra station costs this much, so the route keeps to few long legs. */
const LEG_PENALTY_NM = 12;

/** The program's round trip: out to Robbinsville, back by Woodstown. */
const ROUND_TRIP = ['RBV', 'OOD'];

/** The shortest chain of stations from the departure to the destination's station. */
export function route(from: LatLon, destination: Destination): Station[] {
  const goal = STATIONS[destination.station] as Station;
  if (distanceNm(from, goal.position) < 30) {
    return ROUND_TRIP.map(
      (ident) => STATIONS.find((station) => station.ident === ident) as Station,
    );
  }
  const best = new Map<number, number>();
  const previous = new Map<number, number | null>();
  const open: { index: number; cost: number }[] = [];
  for (const station of STATIONS) {
    const leg = distanceNm(from, station.position);
    if (leg <= MAX_LEG_NM) {
      best.set(station.index, leg);
      previous.set(station.index, null);
      open.push({ index: station.index, cost: leg });
    }
  }
  while (open.length > 0) {
    open.sort((a, b) => a.cost - b.cost);
    const { index, cost } = open.shift() as { index: number; cost: number };
    if (cost > (best.get(index) ?? Infinity)) continue;
    if (index === goal.index) break;
    const here = STATIONS[index] as Station;
    for (const next of STATIONS) {
      if (next.index === index) continue;
      const leg = distanceNm(here.position, next.position);
      if (leg > MAX_LEG_NM) continue;
      const total = cost + leg + LEG_PENALTY_NM;
      if (total < (best.get(next.index) ?? Infinity)) {
        best.set(next.index, total);
        previous.set(next.index, index);
        open.push({ index: next.index, cost: total });
      }
    }
  }
  const chain: Station[] = [];
  let at: number | null | undefined = goal.index;
  while (at !== null && at !== undefined) {
    chain.unshift(STATIONS[at] as Station);
    at = previous.get(at);
  }
  return chain;
}

/** A cruising level for the distance: low for the short hops, the jet's level for the long ones. */
export function cruiseAltitudeFor(totalNm: number): number {
  if (totalNm < 130) return 12_000;
  if (totalNm < 280) return 24_000;
  return 35_000;
}

export function planFlight(from: LatLon, destination: Destination, weather: Weather): FlightPlan {
  const stations = route(from, destination);
  let position = from;
  const legs = stations.map((station) => {
    const courseTrue = bearingTrue(position, station.position);
    const leg: PlanLeg = {
      station,
      courseTrue,
      course: toMagnetic(courseTrue, variationAt(position)),
      distanceNm: distanceNm(position, station.position),
    };
    position = station.position;
    return leg;
  });
  const totalNm = legs.reduce((sum, leg) => sum + leg.distanceNm, 0);
  const cruiseAltitudeFt = cruiseAltitudeFor(totalNm);
  const middle = stations[Math.floor(stations.length / 2)]?.position ?? from;
  const wind = windAt(weather, middle, cruiseAltitudeFt);
  // A rough block: climb fuel by height, then pounds a mile, then 45 minutes in reserve.
  const tripFuelLb = Math.round(5_000 + cruiseAltitudeFt * 0.45 + totalNm * 58);
  const reserveFuelLb = 20_000;
  const blockFuelLb = Math.ceil((tripFuelLb + reserveFuelLb + 5_000) / 1000) * 1000;
  const averageTrack = legs[0]?.courseTrue ?? 0;
  const headwind = wind.speedKt * sinCosDegrees(wind.direction - averageTrack).cos;
  const groundSpeed = (cruiseAltitudeFt >= 24_000 ? 470 : 340) - headwind;
  return {
    legs,
    totalNm,
    cruiseAltitudeFt,
    tripFuelLb,
    reserveFuelLb,
    blockFuelLb,
    expectedWind: { direction: wind.direction, speedKt: wind.speedKt },
    minutes: Math.round((totalNm / (groundSpeed > 150 ? groundSpeed : 150)) * 60 + 12),
  };
}
