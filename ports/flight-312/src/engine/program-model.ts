import { angleDifference, clamp, normaliseDegrees, sinCosDegrees } from './exact-math';
import { advance, bearingTrue, distanceNm, type LatLon } from './geo';
import { STATIONS, type Destination } from './navdata';
import { ilsGeometry, type Ils, type NavReading } from './radios';
import { onRunway, type Runway } from './runways';
import { FPS_PER_KNOT } from './units';
import { windAt, windVector, type Weather } from './weather';

/**
 * JETSET's own flight model (the "1982 Rules"). The program ran its main
 * loop about once a second and moved everything in whole-second steps of
 * its real-time clock; the port keeps its equations and applies each rate
 * per second of simulated time.
 *
 * The program's variable names appear in the comments: TR thrust index, FA
 * pitch, RA rudder, ZS airspeed, RC rate of climb, AL altitude, CC heading,
 * BR flaps, WH wheels. Its bugs are fixed and listed, each with the line it
 * comes from, in docs/games/flight-312.md.
 */
export type ProgramPhase =
  'parked' | 'takeoffRoll' | 'departure' | 'cruise' | 'ils' | 'rollout' | 'ended';

export type ProgramEnding =
  | 'tailStrike'
  | 'runwayLights'
  | 'marshes'
  | 'trimSequence'
  | 'flewIntoGround'
  | 'stallOnFinal'
  | 'nosedIn'
  | 'flaredTooHigh'
  | 'hardLanding'
  | 'gearUp'
  | 'missedRunway'
  | 'noFlare'
  | 'rolledOff'
  | 'missedApproach'
  | 'landed';

export interface ProgramState {
  phase: ProgramPhase;
  /** TR: 1 maximum … 4 climb … 6 idle, 7 reverse. */
  thrustIndex: number;
  /** FA, degrees. */
  pitch: number;
  /** RA, −4 … 4. */
  rudder: number;
  /** BR, WH. */
  flapsDown: boolean;
  gearDown: boolean;
  /** F(3) of the takeoff module: flaps set before the roll. */
  flapsSetForTakeoff: boolean;
  /** ZS, knots. */
  airspeedKt: number;
  /** RC, feet per minute. */
  climbRateFpm: number;
  /** Altitude above sea level; the program's AL was above the field. */
  altitudeFt: number;
  /** CC, true degrees. */
  heading: number;
  position: LatLon;
  /** FU, pounds. */
  fuelLb: number;
  /** The takeoff roll's V0 (feet per second), the gust clock and how many gusts have come. */
  rollSpeedFps: number;
  gustClock: number;
  gusts: number;
  fieldElevationFt: number;
  /** F(1): the marker is lit. */
  markerLit: boolean;
  /** F(5). */
  missedApproach: boolean;
  /** F(6), and AX: the height the flare began at. */
  flared: boolean;
  flareHeightFt: number;
  /** The localizer course, once captured. */
  landingCourse: number | null;
  /** TX and TY at touchdown: feet short of the threshold (+) and right of the centreline (+). */
  touchdown: { short: number; right: number } | null;
  ending: ProgramEnding | null;
}

export interface ProgramInput {
  /** TR the levers ask for, from their detents. */
  thrustIndex: number;
  /** Presses of pitch this step: + nose up (U, or 2 on the keypad), − nose down. */
  pitchSteps: number;
  /** Presses of rudder this step: + right (.), − left (,). */
  rudderSteps: number;
  /** '/': rudder centred. */
  rudderCentre: boolean;
  /** Pedals or a stick's twist, −1 … 1, for players without the 1982 keys. */
  rudderAxis: number;
  flapsDown: boolean;
  gearDown: boolean;
  releaseBrakes: boolean;
  flare: boolean;
  missedApproach: boolean;
  /** Q: reverse thrust, once on the runway. */
  reverse: boolean;
}

export const NO_PROGRAM_INPUT: ProgramInput = {
  thrustIndex: 6,
  pitchSteps: 0,
  rudderSteps: 0,
  rudderCentre: false,
  rudderAxis: 0,
  flapsDown: false,
  gearDown: true,
  releaseBrakes: false,
  flare: false,
  missedApproach: false,
  reverse: false,
};

export interface ProgramContext {
  weather: Weather;
  departure: Runway;
  destination: Destination;
  ils: Ils;
  gate: ProgramGate;
  /** What the first nav receiver hears; the marker needs the destination's station tuned. */
  nav: NavReading;
  groundFt: number;
}

export interface ProgramEvent {
  kind:
    | 'brakesReleased'
    | 'liftoff'
    | 'cruise'
    | 'markerOn'
    | 'markerOff'
    | 'ilsCaptured'
    | 'flare'
    | 'touchdown'
    | 'reverse'
    | 'ending';
  ending?: ProgramEnding;
}

export function startProgram(departure: Runway, fuelLb = 200_000): ProgramState {
  return {
    phase: 'parked',
    thrustIndex: 6,
    pitch: 0,
    rudder: 0,
    flapsDown: false,
    gearDown: true,
    flapsSetForTakeoff: false,
    airspeedKt: 0,
    climbRateFpm: 0,
    altitudeFt: departure.elevationFt,
    heading: departure.headingTrue,
    position: departure.start,
    fuelLb,
    rollSpeedFps: 0,
    gustClock: 0,
    gusts: 0,
    fieldElevationFt: departure.elevationFt,
    markerLit: false,
    missedApproach: false,
    flared: false,
    flareHeightFt: 0,
    landingCourse: null,
    touchdown: null,
    ending: null,
  };
}

/** The program's turning rates for rudder 1–4, in degrees per pass of its loop: here, per second. */
export const TURN_RATES = [0, 1, 10, 20, 30] as const;

export function stepProgram(
  state: ProgramState,
  input: ProgramInput,
  context: ProgramContext,
  dt: number,
): ProgramEvent[] {
  const events: ProgramEvent[] = [];
  if (state.phase === 'parked' || state.phase === 'takeoffRoll') {
    takeoffRoll(state, input, context, dt, events);
  } else if (state.phase === 'departure') {
    departure(state, input, dt, events);
  } else if (state.phase !== 'ended') {
    cruise(state, input, context, dt, events);
  }
  return events;
}

function end(state: ProgramState, ending: ProgramEnding, events: ProgramEvent[]) {
  state.ending = ending;
  state.phase = 'ended';
  events.push({ kind: 'ending', ending });
}

// ——— The takeoff module (lines 10000–12099) ———

function takeoffRoll(
  state: ProgramState,
  input: ProgramInput,
  context: ProgramContext,
  dt: number,
  events: ProgramEvent[],
) {
  // F: full thrust in one press; L: the flaps, once.
  if (input.thrustIndex === 1) state.thrustIndex = 1;
  if (input.flapsDown && !state.flapsSetForTakeoff) {
    state.flapsSetForTakeoff = true;
    state.flapsDown = true;
  }
  // FU −= 40 lb a second, brakes set or not.
  state.fuelLb = Math.max(0, state.fuelLb - 40 * dt);
  if (state.phase === 'parked') {
    if (!input.releaseBrakes) return;
    state.phase = 'takeoffRoll';
    events.push({ kind: 'brakesReleased' });
  }

  // Rudder and pitch answer only above 50 kt: a degree of heading, or ten of pitch, per press.
  if (state.airspeedKt > 50) {
    state.heading = normaliseDegrees(state.heading + input.rudderSteps + input.rudderAxis * 2 * dt);
    if (input.pitchSteps !== 0) state.pitch = clamp(state.pitch + 10 * input.pitchSteps, -60, 60);
  }

  // A = (118 − 18·TR) × 0.04028 ft/s², about 4 ft/s² at full thrust.
  const acceleration = (118 - 18 * state.thrustIndex) * 0.04028;
  const before = state.rollSpeedFps;
  state.rollSpeedFps = before + acceleration * dt;
  const distance = ((before + state.rollSpeedFps) / 2) * dt;

  // Every eighteen seconds a gust swings the nose a degree or two, always the same way.
  state.gustClock += dt;
  if (state.gustClock >= 18) {
    state.gustClock -= 18;
    const swing = context.weather.gustSwings[state.gusts % context.weather.gustSwings.length] ?? 1;
    state.gusts++;
    state.heading = normaliseDegrees(state.heading + context.weather.gustSide * swing);
  }
  const along = sinCosDegrees(state.heading);
  state.position = advance(state.position, along.cos * distance, along.sin * distance);

  // ZS = V / 1.69278, plus the head- or tailwind (fixed: the program added WS, which it never set).
  state.airspeedKt = state.rollSpeedFps / 1.69278;
  if (state.airspeedKt > 20) state.airspeedKt += context.weather.takeoffGustKt;

  const where = onRunway(context.departure, state.position);
  if (where.along + context.departure.displacedFt > context.departure.lengthFt) {
    return end(state, 'marshes', events);
  }
  if (Math.abs(where.across) > context.departure.widthFt / 2) {
    return end(state, 'runwayLights', events);
  }
  if (state.pitch <= 0) return;
  if (state.airspeedKt < 150 || state.pitch > 10) return end(state, 'tailStrike', events);
  // Without flaps the wing will not lift: the roll goes on, into the marshes.
  if (!state.flapsSetForTakeoff) return;
  state.phase = 'departure';
  state.altitudeFt = state.fieldElevationFt + 25;
  events.push({ kind: 'liftoff' });
}

function departure(state: ProgramState, input: ProgramInput, dt: number, events: ProgramEvent[]) {
  // W raises the gear; then L the flaps; then S reduces to climb thrust. Each key waits for the one before.
  if (!input.gearDown) state.gearDown = false;
  if (!state.gearDown && !input.flapsDown) state.flapsDown = false;
  if (!state.flapsDown && input.thrustIndex >= 4 && state.thrustIndex === 1) state.thrustIndex = 4;

  const height = state.altitudeFt - state.fieldElevationFt;
  if (!state.gearDown && !state.flapsDown) {
    if (state.thrustIndex === 4 && height > 1800) {
      state.phase = 'cruise';
      events.push({ kind: 'cruise' });
      return;
    }
  } else if (height >= 1200) {
    return end(state, 'trimSequence', events);
  }
  // Clean, it gathers five knots a pass for the gear and five for the flaps.
  if (!state.gearDown) state.airspeedKt += 5 * dt;
  if (!state.flapsDown) state.airspeedKt += 5 * dt;

  state.fuelLb = Math.max(0, state.fuelLb - 40 * dt);
  state.climbRateFpm = climbRate(state.airspeedKt, state.pitch);
  state.altitudeFt += (state.climbRateFpm / 60) * dt;
  const heading = sinCosDegrees(state.heading);
  const distance = state.airspeedKt * FPS_PER_KNOT * sinCosDegrees(state.pitch).cos * dt;
  state.position = advance(state.position, heading.cos * distance, heading.sin * distance);
}

/** RC = ZS · sin|FA| · 101.6: knots and degrees to feet per minute. */
function climbRate(airspeedKt: number, pitch: number): number {
  const rate = airspeedKt * Math.abs(sinCosDegrees(pitch).sin) * 101.6;
  return pitch < 0 ? -rate : rate;
}

// ——— The cruise module (lines 23–3620) ———

function cruise(
  state: ProgramState,
  input: ProgramInput,
  context: ProgramContext,
  dt: number,
  events: ProgramEvent[],
) {
  const rolling = state.phase === 'rollout';
  // F and S move TR one step (fixed: the single-file edition let S push it past idle into reverse).
  if (!rolling) state.thrustIndex = clamp(input.thrustIndex, 1, 6);
  if (rolling && input.reverse && state.thrustIndex !== 7) {
    state.thrustIndex = 7;
    events.push({ kind: 'reverse' });
  }
  if (input.pitchSteps !== 0 && !state.flared) {
    // Five degrees a press, one with the flaps down.
    const step = state.flapsDown ? 1 : 5;
    state.pitch = clamp(state.pitch + step * input.pitchSteps, -40, 40);
  }
  if (input.rudderCentre) state.rudder = 0;
  if (input.rudderSteps !== 0) state.rudder = clamp(state.rudder + input.rudderSteps, -4, 4);
  if (input.rudderAxis !== 0) state.rudder = clamp(Math.round(input.rudderAxis * 4), -4, 4);
  state.flapsDown = input.flapsDown;
  state.gearDown = input.gearDown;
  // M flags the missed approach, on the ILS only (fixed: the IBM edition never set the flag).
  if (input.missedApproach && state.phase === 'ils') state.missedApproach = true;
  // C (or 6): on the ILS, flare to one degree nose up; anywhere else, level off.
  if (input.flare) state.pitch = state.phase === 'ils' ? 1 : 0;

  // FU −= (14 − TR) lb a second. (The port: running dry closes the throttles.)
  state.fuelLb = Math.max(0, state.fuelLb - (14 - Math.min(state.thrustIndex, 7)) * dt);
  if (state.fuelLb === 0 && state.thrustIndex < 6) state.thrustIndex = 6;

  turn(state, input, dt);

  if (state.thrustIndex === 7) {
    // Reverse: the speed falls by 3.236 ft/s every second.
    const speed = state.airspeedKt * FPS_PER_KNOT - 3.23636 * dt;
    state.airspeedKt = (speed > 0 ? speed : 0) / FPS_PER_KNOT;
  } else {
    // ZS = 800 − 100·TR − 2·FA; with flaps down, a third of that plus twenty.
    state.airspeedKt = 800 - 100 * state.thrustIndex - 2 * state.pitch;
    if (state.flapsDown) state.airspeedKt = state.airspeedKt / 3 + 20;
  }

  if (rolling) state.climbRateFpm = 0;
  else if (!state.flared) state.climbRateFpm = climbRate(state.airspeedKt, state.pitch);
  if (!rolling) state.altitudeFt += (state.climbRateFpm / 60) * dt;

  if (state.phase === 'cruise') {
    navigate(state, context, dt);
    if (state.altitudeFt <= context.groundFt) return end(state, 'flewIntoGround', events);
    markerAndCapture(state, context, events);
    return;
  }
  approachAndLanding(state, context, dt, events);
}

function turn(state: ProgramState, input: ProgramInput, dt: number) {
  if (state.phase === 'rollout') {
    state.heading = state.landingCourse ?? state.heading;
    return;
  }
  if (state.phase === 'ils' && !state.missedApproach) {
    // On the ILS each press nudges the heading a degree and the rudder centres itself.
    state.heading = normaliseDegrees(state.heading + input.rudderSteps + input.rudderAxis * dt);
    state.rudder = 0;
    return;
  }
  const rate = TURN_RATES[Math.abs(state.rudder)] ?? 0;
  state.heading = normaliseDegrees(state.heading + Math.sign(state.rudder) * rate * dt);
}

/** Dead reckoning through the band's wind: AJ = ZS·cos FA along the heading (lines 1400–2054). */
function navigate(state: ProgramState, context: ProgramContext, dt: number) {
  const air = state.airspeedKt * sinCosDegrees(state.pitch).cos * FPS_PER_KNOT;
  const heading = sinCosDegrees(state.heading);
  const wind = windVector(windAt(context.weather, state.position, state.altitudeFt));
  state.position = advance(
    state.position,
    (heading.cos * air + wind.north) * dt,
    (heading.sin * air + wind.east) * dt,
  );
}

/**
 * Where the program's capture zone sits on the real runway. The program lit
 * the marker ten to twelve miles from the station on the radial VG(n,0) and
 * captured the ILS when the heading came within a degree of VG(n,1) with
 * the rudder centred; its ILS then began six miles out on the centreline,
 * wherever the aircraft had really been. The port keeps the real runway, so
 * the zone is a gate on its extended centreline, six miles from the glide
 * path's origin, given (like the program's) as a radial and a distance from
 * the same station.
 */
export interface ProgramGate {
  radial: number;
  dmeNm: number;
  position: LatLon;
}

export function programGate(destination: Destination, ils: Ils): ProgramGate {
  const station = STATIONS[destination.station] as (typeof STATIONS)[number];
  const strip = ils.runway;
  const outFt = 36_481 - ils.glidePointFt;
  const back = sinCosDegrees(strip.headingTrue + 180);
  const position = advance(strip.threshold, back.cos * outFt, back.sin * outFt);
  return {
    radial: bearingTrue(station.position, position),
    dmeNm: distanceNm(station.position, position),
    position,
  };
}

function markerAndCapture(state: ProgramState, context: ProgramContext, events: ProgramEvent[]) {
  const station = STATIONS[context.destination.station];
  const tuned = station && context.nav.kind === 'vor' && context.nav.ident === station.ident;
  let inZone = false;
  if (tuned) {
    const radial = bearingTrue(station.position, state.position);
    const dme = distanceNm(station.position, state.position);
    // The window is 2.5° wide until the marker lights, 9° while it stays lit.
    const width = state.markerLit ? 9 : 2.5;
    inZone =
      Math.abs(dme - context.gate.dmeNm) <= 1 &&
      state.altitudeFt - context.ils.runway.elevationFt <= 4000 &&
      Math.abs(angleDifference(radial, context.gate.radial)) <= width;
  }
  if (inZone !== state.markerLit) events.push({ kind: inZone ? 'markerOn' : 'markerOff' });
  state.markerLit = inZone;
  const course = context.ils.runway.headingTrue;
  if (inZone && Math.abs(angleDifference(state.heading, course)) <= 1 && state.rudder === 0) {
    state.phase = 'ils';
    state.markerLit = false;
    state.landingCourse = course;
    events.push({ kind: 'ilsCaptured' });
  }
}

function approachAndLanding(
  state: ProgramState,
  context: ProgramContext,
  dt: number,
  events: ProgramEvent[],
) {
  const strip = context.ils.runway;
  // Along the heading, drifting with the final's crosswind (RW) and no other wind (lines 1600–1699).
  const travel = state.airspeedKt * FPS_PER_KNOT * dt;
  const heading = sinCosDegrees(state.heading);
  const right = sinCosDegrees(strip.headingTrue + 90);
  const drift = state.phase === 'rollout' ? 0 : context.weather.finalDriftKt * 1.69 * dt;
  state.position = advance(
    state.position,
    heading.cos * travel + right.cos * drift,
    heading.sin * travel + right.sin * drift,
  );

  const geometry = ilsGeometry(context.ils, state.position, state.altitudeFt);
  const height = state.altitudeFt - strip.elevationFt;

  if (state.phase === 'rollout') {
    // Past the far end (XN < −9,750) or out through the side: off the runway.
    if (geometry.along > strip.landingLengthFt || Math.abs(geometry.across) > strip.widthFt / 2) {
      return end(state, 'rolledOff', events);
    }
    if (state.airspeedKt <= 0) end(state, 'landed', events);
    return;
  }

  if (height > 0) {
    if (state.missedApproach) {
      if (height < 20) return end(state, 'rolledOff', events);
      state.thrustIndex = 3;
      state.pitch = 0;
      return end(state, 'missedApproach', events);
    }
    if (state.pitch > 0) {
      if (!state.flared) {
        state.flared = true;
        state.flareHeightFt = height;
        events.push({ kind: 'flare' });
      }
      // A flare at idle settles at 300 fpm; with power on the jumbo sinks at 1,800.
      if (state.thrustIndex === 6) {
        state.pitch = 1;
        state.climbRateFpm = -300;
      } else {
        state.pitch = Math.min(state.pitch, 2);
        state.climbRateFpm = -1800;
      }
    } else if (state.pitch < 0) {
      state.flared = false;
    }
    return;
  }

  // Touchdown: the checks of lines 1034–1062, in their order.
  state.altitudeFt = strip.elevationFt;
  state.phase = 'rollout';
  state.touchdown = { short: -geometry.along, right: geometry.across };
  events.push({ kind: 'touchdown' });
  if (state.pitch > 1) return end(state, 'stallOnFinal', events);
  if (state.pitch < 0) return end(state, 'nosedIn', events);
  if (!state.flared) return end(state, 'noFlare', events);
  if (state.flareHeightFt > 100) return end(state, 'flaredTooHigh', events);
  if (state.flareHeightFt > 80) return end(state, 'hardLanding', events);
  if (!state.gearDown) return end(state, 'gearUp', events);
  const inside =
    geometry.along >= 0 &&
    geometry.along <= strip.landingLengthFt &&
    Math.abs(geometry.across) <= strip.widthFt / 2;
  if (!inside) end(state, 'missedRunway', events);
}
