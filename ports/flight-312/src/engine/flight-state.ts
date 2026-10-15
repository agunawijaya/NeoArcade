import type { AfdsState } from './afds';
import type { referenceSpeeds } from './aircraft';
import type { AirframeState } from './airframe';
import type { AtcContext, AtcEvent, AtcState } from './atc';
import { distanceNm, type LatLon } from './geo';
import { toMagnetic, variationAt } from './magnetic';
import type { DestinationId } from './navdata';
import type { Ending, Report } from './outcome';
import type { Panel } from './panel';
import type { FlightPlan, Facilities } from './plan';
import type { Procedures, Violation } from './procedures';
import type { ProgramGate, ProgramState } from './program-model';
import type { Marker, NavReading } from './radios';
import type { ProgramLook, Readout } from './readout';
import { onRunway, type Runway } from './runways';
import type { Callout, Warnings } from './warnings';
import type { DestinationSky } from './weather';
import type { FlightWorld } from './world';

/**
 * One flight's state and the vocabulary around it: the setup chosen on the
 * briefing screen, the per-step input from the crew, the events a step
 * produces for the sound, the voices and the screen, and the record kept
 * for the report.
 */
export type Level = 'rules1982' | 'arcade' | 'pilot' | 'captain';
export type Mode = 'flight' | 'takeoff' | 'approach';
export type TimeOfDay = 'morning' | 'dusk' | 'night';

export interface FlightSetup {
  mode: Mode;
  level: Level;
  destination: DestinationId;
  seed: number;
  /** 1982 Rules: fly the program's one and only sky (its fixed RANDOMIZE 57.2958). */
  programSky?: boolean;
  /** Approach practice: the weather at the field, the surface wind (from, magnetic) and the hour. */
  sky?: DestinationSky;
  wind?: { direction: number; speedKt: number; gustKt: number };
  timeOfDay?: TimeOfDay;
  /** Captain: the fuel the crew orders; otherwise the plan's block fuel. */
  fuelLb?: number;
}

/** What the crew does in one step: the stick, pedals and brakes, and the keys pressed since the last step. */
export interface FlightInput {
  elevator: number;
  aileron: number;
  rudder: number;
  brakes: number;
  trim: number;
  /** The 1982 keys: presses of pitch (+ up) and rudder (+ right), rudder centred, flare, missed approach. */
  pitchSteps: number;
  rudderSteps: number;
  rudderCentre: boolean;
  flare: boolean;
  /** Missed approach under the 1982 rules; the TO/GA switches otherwise. */
  missedApproach: boolean;
}

export const NO_INPUT: FlightInput = {
  elevator: 0,
  aileron: 0,
  rudder: 0,
  brakes: 0,
  trim: 0,
  pitchSteps: 0,
  rudderSteps: 0,
  rudderCentre: false,
  flare: false,
  missedApproach: false,
};

export type HintId =
  | 'releaseBrakes'
  | 'setFlaps'
  | 'rotate'
  | 'gearUp'
  | 'climbThrust'
  | 'tuneComm'
  | 'armApproach'
  | 'gearDown'
  | 'landingFlaps'
  | 'flare'
  | 'idle'
  | 'reverse'
  | 'stall'
  | 'pullUp';

export type FlightEvent =
  | { kind: 'atc'; event: AtcEvent }
  | { kind: 'callout'; callout: Callout }
  | { kind: 'hint'; hint: HintId }
  | { kind: 'brakesReleased' }
  | { kind: 'liftoff' }
  | { kind: 'touchdown'; sinkFpm: number }
  | { kind: 'reversers' }
  | { kind: 'goAround' }
  | { kind: 'goAroundComplete'; proper: boolean }
  | { kind: 'autopilotOff' }
  | { kind: 'engineFlameout'; engine: number }
  | { kind: 'unstable' }
  | { kind: 'violation'; violation: Violation }
  | { kind: 'ending'; outcome: Outcome };

export interface Touchdown {
  at: number;
  sinkFpm: number;
  along: number;
  across: number;
  speedKt: number;
  crabDeg: number;
  runway: Runway;
  hard: boolean;
  crosswindKt: number;
}

export interface Outcome {
  ending: Ending;
  report: Report;
  level: Level;
  mode: Mode;
  destination: DestinationId;
  time: number;
  touchdown: Touchdown | null;
  violations: Violation[];
  readbacks: { missed: number; wrong: number };
  /** For badges: landed in minimum-ceiling fog; a whole flight from the departure to the stop. */
  breakout: boolean;
  fullFlight: boolean;
  properGoArounds: number;
}

export interface ApproachWatch {
  /** Flying the approach to land: close to the destination after leaving the departure behind. */
  active: boolean;
  lowestFt: number;
  goingAround: boolean;
  properGoArounds: number;
}

export interface TrackPoint {
  time: number;
  position: LatLon;
  altitudeFt: number;
}

export interface Flight {
  setup: FlightSetup;
  rules: 'program' | 'real';
  world: FlightWorld;
  plan: FlightPlan;
  facilities: Facilities;
  /** Speeds for the weight at the start: takeoff with flaps 10, landing with flaps 30. */
  speeds: ReturnType<typeof referenceSpeeds>;
  time: number;
  /** Local time at the start, seconds after midnight. */
  clockStart: number;
  panel: Panel;
  afds: AfdsState;
  /** Where the flight director's bars point, while it is switched on. */
  director: { pitch: number; bank: number } | null;
  program: ProgramState | null;
  programLook: ProgramLook | null;
  programGate: ProgramGate | null;
  /** Presses of pitch built up from a stick under the 1982 rules. */
  pitchPresses: number;
  airframe: AirframeState | null;
  readout: Readout;
  nav: [NavReading, NavReading];
  marker: Marker;
  radioAltitudeFt: number | null;
  atc: AtcState;
  atcContext: AtcContext;
  warnings: Warnings;
  procedures: Procedures;
  approach: ApproachWatch;
  hintsGiven: HintId[];
  brakesReleasedAt: number | null;
  liftoffAt: number | null;
  maxRollSpeedKt: number;
  touchdown: Touchdown | null;
  outcome: Outcome | null;
  track: TrackPoint[];
}

export const STEP_SECONDS = 1 / 60;
export const RESERVE_FUEL_LB = 20_000;

export const isRealLevel = (level: Level) => level !== 'rules1982';

/** Flies the 15 nm ILS practice and the end of the full flight alike. */
export const destinationRunway = (flight: Flight) => flight.world.ils.runway;

export function distanceToDestination(flight: Flight): number {
  return distanceNm(flight.readout.position, destinationRunway(flight).threshold);
}

export function distanceFromDeparture(flight: Flight): number {
  return distanceNm(flight.readout.position, flight.world.departure.threshold);
}

export const magneticHeading = (flight: Flight) =>
  toMagnetic(flight.readout.headingTrue, variationAt(flight.readout.position));

/** "runway 04R at Boston Logan", or "38 nm from Philadelphia" along the route. */
export function placeName(flight: Flight): string {
  const position = flight.readout.position;
  const strips = [destinationRunway(flight), flight.world.departure, ...flight.world.runways];
  for (const strip of strips) {
    const { along, across } = onRunway(strip, position);
    if (
      along > -strip.displacedFt - 2000 &&
      along < strip.landingLengthFt + 4000 &&
      Math.abs(across) < 1500
    ) {
      return `runway ${strip.ident} at ${airportName(strip.airport)}`;
    }
  }
  const toDestination = distanceToDestination(flight);
  const fromDeparture = distanceFromDeparture(flight);
  return toDestination < fromDeparture
    ? `${Math.round(toDestination)} nm from ${airportName(destinationRunway(flight).airport)}`
    : `${Math.round(fromDeparture)} nm from ${airportName(flight.world.departure.airport)}`;
}

const AIRPORT_NAMES: Record<string, string> = {
  KPHL: 'Philadelphia',
  KJFK: 'New York Kennedy',
  KBOS: 'Boston Logan',
  CYAM: 'Sault Ste. Marie',
  KPSB: 'Philipsburg Mid-State',
  KBUF: 'Buffalo',
};

export const airportName = (ident: string) => AIRPORT_NAMES[ident] ?? ident;
