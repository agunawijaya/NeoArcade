import { stepAfds } from './afds';
import { FLAP_DETENTS, referenceSpeeds } from './aircraft';
import {
  stepAirframe,
  type AirframeControls,
  type AirframeEvent,
  type AirframeState,
} from './airframe';
import { approach, clamp } from './exact-math';
import { finish, referenceSpeedNow } from './finish';
import {
  STEP_SECONDS,
  RESERVE_FUEL_LB,
  type Flight,
  type FlightEvent,
  type FlightInput,
} from './flight-state';
import { toTrue, variationAt } from './magnetic';
import { STATIONS } from './navdata';
import { setLevers, speedbrakeDemand } from './panel';
import { judgeLanding } from './procedures';
import { readAirframe } from './readout';
import { onRunway } from './runways';
import { nearestField } from './weather';
import { airMotion, groundAt, runwayWind, surfaceAt } from './world';

/** Touchdown limits: the Arcade level forgives more. */
const LIMITS = {
  arcade: { hardFpm: 900, crashFpm: 1600, bankDeg: 12 },
  standard: { hardFpm: 600, crashFpm: 1200, bankDeg: 8 },
};

/** Stick or wheel moved this far takes the aircraft away from the autopilot. */
const OVERRIDE = 0.35;
/** How fast the autopilot runs the stabiliser trim, degrees of angle of attack a second. */
const AUTOPILOT_TRIM_RATE = 0.5;

/** The Arcade, Pilot and Captain levels: the panel, the stick and the autopilot fly the airframe. */
export function flyAirframe(flight: Flight, input: FlightInput, events: FlightEvent[]) {
  const aircraft = flight.airframe;
  if (!aircraft) return;
  const world = flight.world;
  const panel = flight.panel;
  const arcade = flight.setup.level === 'arcade';

  const groundFt = groundAt(world, aircraft.position);
  const field = nearestField(world.weather, aircraft.position);
  const environment = {
    wind: airMotion(world, aircraft.position, aircraft.altitudeFt, flight.time),
    groundFt,
    temperatureOffset: world.weather.temperatureOffset,
    qnh: field?.qnh ?? 29.92,
  };

  if (
    flight.afds.autopilot &&
    (Math.abs(input.elevator) > OVERRIDE || Math.abs(input.aileron) > OVERRIDE)
  ) {
    flight.afds.autopilot = false;
    events.push({ kind: 'autopilotOff' });
  }
  setAfdsTargets(flight);
  const lever = panel.levers.reduce((sum, value) => sum + value, 0) / panel.levers.length;
  const output = stepAfds(flight.afds, aircraft, flight.nav[0], lever, STEP_SECONDS);
  flight.director = flight.afds.flightDirector
    ? { pitch: output.pitchTarget, bank: output.bankTarget }
    : null;
  if (output.lever !== null && panel.reverse.every((value) => value === 0))
    setLevers(panel, output.lever);

  let aileron = input.aileron;
  if (arcade) {
    if (!flight.afds.autopilot && Math.abs(input.aileron) < 0.05 && !aircraft.onGround) {
      // Hands off, the Arcade jumbo rolls its wings level.
      aileron = clamp(-aircraft.bankDeg * 0.04, -0.3, 0.3);
    }
    autoFlaps(flight, aircraft);
  }
  if (panel.speedbrake === 'armed' && aircraft.onGround && flight.touchdown)
    panel.speedbrake = 'up';

  const controls: AirframeControls = {
    elevator: input.elevator,
    aileron,
    rudder: input.rudder,
    levers: panel.levers,
    reverse: panel.reverse,
    flapLever: panel.flapLever,
    gearDown: panel.gearDown,
    speedbrake: speedbrakeDemand(panel.speedbrake),
    brakes: panel.parkingBrake ? 1 : clamp(input.brakes, 0, 1),
    trim: input.trim,
    holdAttitude: arcade,
    autopilot: flight.afds.autopilot
      ? { pitchRate: output.pitchRate, rollRate: output.rollRate }
      : null,
    crossfeed: panel.crossfeed,
  };
  // The autopilot trims as it flies, so it hands back an aircraft in trim.
  if (flight.afds.autopilot && !aircraft.onGround) {
    aircraft.trimAlphaDeg = approach(
      aircraft.trimAlphaDeg,
      aircraft.alphaDeg,
      AUTOPILOT_TRIM_RATE * STEP_SECONDS,
    );
  }
  const wasOnGround = aircraft.onGround;
  const airEvents = stepAirframe(aircraft, controls, environment, STEP_SECONDS);
  flight.readout = readAirframe(aircraft, groundAt(world, aircraft.position));
  if (aircraft.onGround) flight.maxRollSpeedKt = Math.max(flight.maxRollSpeedKt, aircraft.iasKt);

  if (
    flight.brakesReleasedAt === null &&
    !panel.parkingBrake &&
    wasOnGround &&
    aircraft.rollFps > 0.5
  ) {
    flight.brakesReleasedAt = flight.time;
    events.push({ kind: 'brakesReleased' });
  }
  for (const event of airEvents) handleEvent(flight, event, events);
  if (!flight.outcome && aircraft.onGround) checkGroundRoll(flight, aircraft, events);
}

/** The panel's magnetic heading bug and course become the autopilot's true ones. */
function setAfdsTargets(flight: Flight) {
  const afds = flight.afds;
  const panel = flight.panel;
  const position = flight.readout.position;
  afds.heading = toTrue(panel.headingBug, variationAt(position));
  const tuned = STATIONS.find(
    (station) => Math.abs(station.frequency - panel.nav[0].frequency) < 0.005,
  );
  afds.course = toTrue(panel.nav[0].course, tuned ? tuned.variation : variationAt(position));
}

/**
 * The Arcade level's flaps follow the speed: they come in as the jumbo
 * accelerates after takeoff, and go out as it slows for the approach, each
 * detent at the speed a crew would call for it.
 */
function autoFlaps(flight: Flight, aircraft: AirframeState) {
  if (aircraft.onGround) return;
  const vref = referenceSpeedNow(flight);
  // Manoeuvring speeds above Vref for UP, 1, 5, 10, 20, 25 and 30.
  const margins = [80, 60, 40, 30, 20, 10, 0];
  const wanted = margins.findIndex((margin) => aircraft.iasKt >= vref + margin);
  const fitting = wanted < 0 ? FLAP_DETENTS.length - 1 : wanted;
  const panel = flight.panel;
  if (flight.approach.active && !flight.approach.goingAround) {
    const established = flight.nav[0].glideslope !== null && flight.nav[0].kind === 'localizer';
    panel.flapLever = Math.max(
      panel.flapLever,
      established && aircraft.iasKt < 178 ? FLAP_DETENTS.length - 1 : fitting,
    );
  } else if (aircraft.verticalSpeedFpm > 0) {
    panel.flapLever = Math.min(panel.flapLever, fitting);
  }
}

function handleEvent(flight: Flight, event: AirframeEvent, events: FlightEvent[]) {
  switch (event.kind) {
    case 'liftoff':
      if (flight.liftoffAt === null) flight.liftoffAt = flight.time;
      events.push({ kind: 'liftoff' });
      return;
    case 'tailStrike':
      finish(flight, 'tailStrike', events);
      return;
    case 'touchdown':
      judgeTouchdown(flight, event, events);
      return;
    case 'stopped':
      stopped(flight, events);
      return;
    case 'fuelExhausted':
      events.push({ kind: 'engineFlameout', engine: event.engine });
      return;
  }
}

function judgeTouchdown(
  flight: Flight,
  event: Extract<AirframeEvent, { kind: 'touchdown' }>,
  events: FlightEvent[],
) {
  const aircraft = flight.airframe as AirframeState;
  const limits = flight.setup.level === 'arcade' ? LIMITS.arcade : LIMITS.standard;
  const surface = surfaceAt(flight.world, aircraft.position, aircraft.headingTrue);
  events.push({ kind: 'touchdown', sinkFpm: event.sinkFpm });
  if (surface.kind === 'water') return finish(flight, 'ditched', events);
  if (surface.kind === 'ground') {
    const approachLike = event.gearDown && event.sinkFpm < limits.crashFpm && event.pitchDeg > -2;
    return finish(flight, approachLike ? 'offRunway' : 'flewIntoGround', events);
  }
  if (event.sinkFpm > limits.crashFpm)
    return finish(flight, 'impact', events, { sinkFpm: event.sinkFpm });
  if (!event.gearDown) return finish(flight, 'gearUp', events);
  if (Math.abs(event.bankDeg) > limits.bankDeg)
    return finish(flight, 'wingStrike', events, { bankDeg: event.bankDeg });
  if (event.pitchDeg < -1) return finish(flight, 'nosedIn', events);
  if (flight.touchdown) return;

  const field = nearestField(flight.world.weather, aircraft.position);
  const wind = field
    ? {
        direction: field.wind.direction,
        speedKt: field.gustKt > field.wind.speedKt ? field.gustKt : field.wind.speedKt,
      }
    : null;
  const crosswindKt = wind ? runwayWind(surface.runway, wind).crosswindKt : 0;
  flight.touchdown = {
    at: flight.time,
    sinkFpm: event.sinkFpm,
    along: surface.along,
    across: surface.across,
    speedKt: event.speedKt,
    crabDeg: event.crabDeg,
    runway: surface.runway,
    hard: event.sinkFpm > limits.hardFpm,
    crosswindKt,
  };
  if (flight.setup.level === 'captain') {
    const before = flight.procedures.violations.length;
    judgeLanding(flight.procedures, {
      time: flight.time,
      cleared: flight.atc.cleared,
      crosswindKt,
      fuelLb: flight.readout.fuelLb,
      reserveLb: RESERVE_FUEL_LB,
    });
    for (const violation of flight.procedures.violations.slice(before))
      events.push({ kind: 'violation', violation });
  }
}

function stopped(flight: Flight, events: FlightEvent[]) {
  const touchdown = flight.touchdown;
  const aircraft = flight.airframe as AirframeState;
  if (touchdown) {
    const { along, across } = onRunway(touchdown.runway, aircraft.position);
    finish(flight, touchdown.hard ? 'hardLanding' : 'landed', events, {
      restingPlace: { along, across },
    });
    return;
  }
  // Stopped on the runway after the takeoff roll had begun: a rejected takeoff.
  if (flight.brakesReleasedAt !== null && flight.maxRollSpeedKt > 40 && flight.liftoffAt === null) {
    finish(flight, 'rejectedTakeoff', events);
  }
}

/** On the ground: still on the concrete, or off its side or its end. */
function checkGroundRoll(flight: Flight, aircraft: AirframeState, events: FlightEvent[]) {
  if (aircraft.rollFps < 0.5) return;
  const surface = surfaceAt(flight.world, aircraft.position, aircraft.headingTrue);
  if (surface.kind === 'runway') return;
  const strip = flight.touchdown?.runway ?? flight.world.departure;
  const { along, across } = onRunway(strip, aircraft.position);
  const pastEnd = along - strip.landingLengthFt;
  const landing = flight.touchdown !== null;
  if (pastEnd > 0 && Math.abs(across) < strip.widthFt) {
    const intoMarshes = !landing || strip.airport === flight.world.departure.airport;
    finish(flight, intoMarshes ? 'marshes' : 'overrun', events, { pastEndFt: pastEnd });
    return;
  }
  finish(flight, landing ? 'rolledOff' : 'runwayLights', events);
}

/** V-speeds for the weight and the flaps set now, for the bugs and the hints. */
export function takeoffSpeedsNow(flight: Flight) {
  const flaps = FLAP_DETENTS[flight.panel.flapLever]?.degrees ?? 10;
  return referenceSpeeds(flight.readout.weightLb, flaps >= 10 ? flaps : 10);
}
