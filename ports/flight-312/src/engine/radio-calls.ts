import { createRng } from '@shared/rng';
import { stepAtc, type AtcContext, type AtcCrew, type AtcSituation } from './atc';
import { angleDifference } from './exact-math';
import {
  destinationRunway,
  distanceFromDeparture,
  distanceToDestination,
  type Flight,
  type FlightEvent,
  type FlightSetup,
  type Level,
} from './flight-state';
import { bearingTrue, distanceNm } from './geo';
import { toMagnetic, variationAt } from './magnetic';
import type { Facilities, FlightPlan } from './plan';
import { onRunway, runwayPoint } from './runways';
import { FEET_PER_NM } from './units';
import type { FlightWorld } from './world';

/** Takeoff clearance comes at 08:00, as in the program. */
export const TAKEOFF_CLOCK = 8 * 3600;

const CREW: Record<Level, AtcCrew> = {
  rules1982: 'firstOfficer',
  arcade: 'firstOfficer',
  pilot: 'pilot',
  captain: 'captain',
};

/** The wind as a tower gives it: from, magnetic. */
function towerWind(field: FlightWorld['weather']['departure']) {
  return {
    direction: toMagnetic(field.wind.direction, variationAt(field.position)),
    speedKt: field.wind.speedKt,
    gustKt: field.gustKt,
  };
}

export function atcContextFor(
  setup: FlightSetup,
  world: FlightWorld,
  facilities: Facilities,
  plan: FlightPlan,
  departureHeading: number,
): AtcContext {
  const rng = createRng(setup.seed * 31 + 7);
  const squawk = [rng.int(1, 7), rng.int(0, 7), rng.int(0, 7), rng.int(0, 7)].join('');
  const destination = world.destination;
  const cruise = plan.cruiseAltitudeFt;
  const intercept = destination.interceptAltitudeFt;
  return {
    crew: CREW[setup.level],
    rules: world.style,
    practice: setup.mode,
    facilities,
    destinationName: AIRPORT_SPOKEN[destination.airport] ?? destination.city,
    arrivalCity: destination.city,
    departureRunway: world.departure.ident,
    arrivalRunway: world.ils.runway.ident,
    departureHeading,
    initialAltitudeFt: Math.min(10_000, cruise),
    cruiseAltitudeFt: cruise,
    descentAltitudeFt: Math.min(11_000, cruise - 4000),
    interceptAltitudeFt: intercept,
    goAroundAltitudeFt: Math.max(3000, Math.ceil((intercept + 1000) / 1000) * 1000),
    departureWind: towerWind(world.weather.departure),
    arrivalWind: towerWind(world.weather.destination),
    arrivalAltimeter: world.weather.destination.qnh,
    squawk,
  };
}

const AIRPORT_SPOKEN: Record<string, string> = {
  KJFK: 'Kennedy',
  KBOS: 'Boston Logan',
  CYAM: 'Sault Ste. Marie',
  KPSB: 'Philipsburg',
  KBUF: 'Buffalo',
  KPHL: 'Philadelphia',
};

/** Where the vectors lead: 16 nm out on the extended centreline, 4 nm off it on the flight's side. */
const BASE_OUT_NM = 16;
const BASE_OFFSET_NM = 4;
/** Close enough to the base point to be turned onto the intercept. */
const BASE_REACHED_NM = 2.5;

/** A 30° intercept from here meets the localizer at least this far out: in time for the glideslope. */
const INTERCEPT_BY_NM = 10;
const TAN_30 = 0.5773502691896257;

function interceptsInTime(finalNm: number, offsetNm: number): boolean {
  return finalNm < 22 && offsetNm <= (finalNm - INTERCEPT_BY_NM) * TAN_30;
}

export function atcSituation(flight: Flight): AtcSituation {
  const r = flight.readout;
  const strip = destinationRunway(flight);
  const { along, across } = onRunway(strip, r.position);
  const finalNm = along < 0 ? -along / FEET_PER_NM : 0;
  const side = across >= 0 ? 1 : -1;
  const base = runwayPoint(strip, -BASE_OUT_NM * FEET_PER_NM, side * BASE_OFFSET_NM * FEET_PER_NM);
  const variation = variationAt(r.position);
  const nav = flight.nav[0];
  const established =
    flight.rules === 'program'
      ? flight.program?.phase === 'ils' || flight.program?.phase === 'rollout'
      : nav.kind === 'localizer' &&
        nav.ident === flight.world.destination.localizerIdent &&
        Math.abs(nav.deviation) < nav.fullScale / 2 &&
        finalNm > 0 &&
        Math.abs(angleDifference(r.headingTrue, strip.headingTrue)) < 40;
  const field = flight.world.weather.destination;
  return {
    time: flight.time,
    comm: flight.panel.comm,
    takeoffTime: flight.clockStart + flight.time >= TAKEOFF_CLOCK,
    airborne: !r.onGround,
    heightFt: r.heightFt,
    altitudeFt: r.altitudeFt,
    fromDepartureNm: distanceFromDeparture(flight),
    toDestinationNm: distanceToDestination(flight),
    descentNm: ((r.altitudeFt - field.elevationFt) / 1000) * 3 + 15,
    nearInterceptPoint:
      distanceNm(r.position, base) < BASE_REACHED_NM ||
      interceptsInTime(finalNm, Math.abs(across) / FEET_PER_NM),
    vectorHeading: toMagnetic(bearingTrue(r.position, base), variation),
    interceptHeading: toMagnetic(strip.headingTrue - side * 30, variation),
    established,
    finalNm,
    stopped: flight.touchdown !== null && r.onGround && r.groundSpeedKt < 2,
    goingAround: flight.approach.goingAround,
  };
}

/** One step of the radio: ATC speaks, the first officer tunes. */
export function stepRadio(flight: Flight, events: FlightEvent[]) {
  for (const event of stepAtc(flight.atc, atcSituation(flight), flight.atcContext)) {
    if (event.kind === 'tune' && Math.abs(flight.panel.comm - event.frequency) > 0.005) {
      flight.panel.commStandby = flight.panel.comm;
      flight.panel.comm = event.frequency;
    }
    events.push({ kind: 'atc', event });
  }
}
