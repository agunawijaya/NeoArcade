import { FLAP_DETENTS } from './aircraft';
import { answerReadback, frequencyOf } from './atc';
import { airAt, casFromTas } from './atmosphere';
import { checklistReady, type ChecklistId } from './checklists';
import {
  angleDifference,
  asin,
  clamp,
  DEGREES_PER_RADIAN,
  normaliseDegrees,
  sinCosDegrees,
} from './exact-math';
import { referenceSpeedNow } from './finish';
import {
  checklistView,
  completeChecklist,
  NO_INPUT,
  stepFlight,
  type Flight,
  type FlightInput,
  type Outcome,
} from './flight';
import { takeoffSpeedsNow } from './fly-airframe';
import { bearingTrue, distanceNm, type LatLon } from './geo';
import { toMagnetic, variationAt } from './magnetic';
import { STATIONS } from './navdata';
import { setFlapDegrees, setLevers, setReverse } from './panel';
import { ilsGeometry } from './radios';
import { PROGRAM_LEVERS } from './readout';
import { onRunway, runwayPoint } from './runways';
import { FEET_PER_NM, FPS_PER_KNOT } from './units';
import { windAt } from './weather';

/**
 * A scripted crew that flies a whole flight through the same panel, keys
 * and radio the player has: it answers the controllers, works the
 * checklists, flies the takeoff and the landing by hand and lets the
 * autopilot do the rest. It proves every destination can be flown at every
 * level, gives the balance numbers in docs/games/flight-312.md, and makes
 * the replays that the determinism tests compare across browsers.
 */
export interface TestPilot {
  flight: Flight;
  legIndex: number;
  /** When the crew last acted on the radio, so it answers like a person, not instantly. */
  radioBusyUntil: number;
  rotation: number;
  flaring: boolean;
  /** Under the 1982 rules: past the point twenty miles out, turned onto the final. */
  linedUp: boolean;
  /** The go-around in progress has been flown into the climb: flaps 20, modes reset. */
  goAroundSetUp: boolean;
}

export function createTestPilot(flight: Flight): TestPilot {
  return {
    flight,
    legIndex: 0,
    radioBusyUntil: 0,
    rotation: 0,
    flaring: false,
    linedUp: false,
    goAroundSetUp: false,
  };
}

/** Flies until the flight ends or the time runs out. */
export function flyWithTestPilot(flight: Flight, maxSeconds = 4 * 3600): Outcome | null {
  const pilot = createTestPilot(flight);
  while (!flight.outcome && flight.time < maxSeconds) stepFlight(flight, testPilotInput(pilot));
  return flight.outcome;
}

export function testPilotInput(pilot: TestPilot): FlightInput {
  workTheRadio(pilot);
  return pilot.flight.program ? programPilot(pilot) : airframePilot(pilot);
}

// ——— The radio ———

/** Two seconds to answer, three to dial a new frequency: never instant, never late. */
function workTheRadio(pilot: TestPilot) {
  const { flight } = pilot;
  const atc = flight.atc;
  if (flight.atcContext.crew === 'firstOfficer' || flight.time < pilot.radioBusyUntil) return;
  if (atc.pending && flight.time > atc.busyUntil + 1.5) {
    answerReadback(atc, flight.atcContext, 'correct', flight.time);
    pilot.radioBusyUntil = flight.time + 2;
    return;
  }
  if (atc.handedTo && !atc.pending && atc.queue.length === 0 && flight.time > atc.busyUntil + 2) {
    flight.panel.commStandby = flight.panel.comm;
    flight.panel.comm = frequencyOf(flight.facilities, atc.handedTo);
    pilot.radioBusyUntil = flight.time + 3;
  }
}

function tryChecklist(flight: Flight, id: ChecklistId) {
  if (flight.procedures.completed[id] === null && checklistReady(id, checklistView(flight))) {
    completeChecklist(flight, id);
  }
}

// ——— The Arcade, Pilot and Captain levels ———

const magnetic = (flight: Flight, trueBearing: number) =>
  Math.round(toMagnetic(trueBearing, variationAt(flight.readout.position)));

function airframePilot(pilot: TestPilot): FlightInput {
  const { flight } = pilot;
  const r = flight.readout;
  if (r.onGround && flight.touchdown === null) return takeoffRoll(pilot);
  if (r.onGround) return rollout(flight);
  const aboveField = r.altitudeFt - flight.world.ils.runway.elevationFt;
  if (
    flight.approach.active &&
    !flight.approach.goingAround &&
    aboveField < 1000 &&
    aboveField > 200 &&
    !stable(flight)
  ) {
    // Not stable at 1,000 ft: around again, as the procedures say.
    pilot.flaring = false;
    return { ...NO_INPUT, missedApproach: true };
  }
  if (
    flight.approach.active &&
    closeIn(flight) &&
    r.heightFt < 160 &&
    !flight.approach.goingAround
  ) {
    return landByHand(pilot);
  }
  climbCruiseDescend(pilot);
  // Until the autopilot is in, the initial climb is flown by hand at about 13° nose up.
  if (!flight.afds.autopilot) {
    pilot.rotation = Math.min(pilot.rotation + 1 / 60, 13);
    return { ...NO_INPUT, elevator: pitchTo(flight, pilot.rotation) };
  }
  return { ...NO_INPUT };
}

/** In the landing shape, on speed, sinking sanely and within a dot of both beams. */
function stable(flight: Flight): boolean {
  const r = flight.readout;
  const nav = flight.nav[0];
  const vref = referenceSpeedNow(flight);
  return (
    r.gear > 0.99 &&
    r.flapsDeg >= 24 &&
    r.iasKt >= vref - 5 &&
    r.iasKt <= vref + 20 &&
    r.verticalSpeedFpm > -1000 &&
    nav.kind === 'localizer' &&
    Math.abs(nav.deviation) <= nav.fullScale / 2 &&
    nav.glideslope !== null &&
    Math.abs(nav.glideslope) <= 0.35
  );
}

/** Within four miles of the threshold, on the approach side or over the runway. */
function closeIn(flight: Flight): boolean {
  const strip = flight.world.ils.runway;
  const { along, across } = onRunway(strip, flight.readout.position);
  return along > -4 * FEET_PER_NM && along < strip.landingLengthFt && Math.abs(across) < 3000;
}

function takeoffRoll(pilot: TestPilot): FlightInput {
  const { flight } = pilot;
  const panel = flight.panel;
  const r = flight.readout;
  const strip = flight.world.departure;
  setFlapDegrees(panel, 10);
  panel.altimeterInHg = flight.world.weather.departure.qnh;
  tryChecklist(flight, 'beforeTakeoff');
  const input = { ...NO_INPUT };
  if (!flight.atc.cleared.takeoff) return input;
  panel.parkingBrake = false;
  setLevers(panel, 1);
  // Rudder on the centreline: against the heading error and the drift from it.
  const { across } = onRunway(strip, r.position);
  input.rudder = clamp(
    angleDifference(strip.headingTrue, r.headingTrue) * 0.25 - across * 0.004,
    -1,
    1,
  );
  if (r.iasKt >= takeoffSpeedsNow(flight).vr) {
    pilot.rotation = Math.min(pilot.rotation + 2.5 / 60, 9.5);
    input.elevator = pitchTo(flight, pilot.rotation);
  }
  return input;
}

/** Elevator toward a pitch, damped by the pitch rate. */
function pitchTo(flight: Flight, pitch: number): number {
  const aircraft = flight.airframe;
  const rate = aircraft ? aircraft.pitchRate : 0;
  return clamp((pitch - flight.readout.pitchDeg) * 0.35 - rate * 0.25, -1, 1);
}

function climbCruiseDescend(pilot: TestPilot) {
  const { flight } = pilot;
  const panel = flight.panel;
  const afds = flight.afds;
  const r = flight.readout;
  const cleared = flight.atc.cleared;

  const goingAround = flight.approach.goingAround;
  if (goingAround && !pilot.goAroundSetUp) {
    // Around again: off the beams, flaps 20, and up to the altitude the tower gave.
    pilot.goAroundSetUp = true;
    afds.autopilot = true;
    afds.pitchMode = 'speed';
    afds.rollMode = 'heading';
    afds.armedNavigation = false;
    afds.armedGlideslope = false;
    setFlapDegrees(panel, 20);
    setLevers(panel, 0.95);
  }
  if (!goingAround) pilot.goAroundSetUp = false;
  // Gear up with a positive climb, the autopilot in at 400 ft, climb thrust at 1,000 ft.
  if (r.verticalSpeedFpm > 300 && r.heightFt > 60 && (!flight.approach.active || goingAround))
    panel.gearDown = false;
  if (!afds.autopilot && r.heightFt > 400 && (!flight.approach.active || goingAround)) {
    afds.autopilot = true;
    afds.pitchMode = 'speed';
    afds.rollMode = 'heading';
  }
  if (!afds.autopilot) return;
  if (r.heightFt > 1000 && afds.pitchMode === 'speed') setLevers(panel, 0.93);
  retractOrExtendFlaps(flight);
  if (r.altitudeFt > 10_000) tryChecklist(flight, 'afterTakeoff');
  else if (!panel.gearDown && FLAP_DETENTS[panel.flapLever]?.degrees === 0)
    tryChecklist(flight, 'afterTakeoff');

  if (flight.approach.active || flight.atc.stage === 'vectors' || flight.atc.stage === 'approach') {
    approachSetup(pilot);
  } else {
    panel.headingBug =
      cleared.heading ?? magnetic(flight, bearingTrue(r.position, nextWaypoint(pilot)));
  }
  verticalPath(flight, cleared.altitudeFt);
}

/** The plan's stations one after another, then the field. */
function nextWaypoint(pilot: TestPilot): LatLon {
  const { flight } = pilot;
  const legs = flight.plan.legs;
  const here = flight.readout.position;
  let leg = legs[pilot.legIndex];
  while (
    leg &&
    (distanceNm(here, leg.station.position) < 3 || passed(flight, leg.station.position))
  ) {
    pilot.legIndex++;
    leg = legs[pilot.legIndex];
  }
  if (leg) {
    flight.panel.nav[0] = { frequency: leg.station.frequency, course: Math.round(leg.course) };
    return leg.station.position;
  }
  const strip = flight.world.ils.runway;
  const { across } = onRunway(strip, here);
  return runwayPoint(strip, -16 * FEET_PER_NM, (across >= 0 ? 1 : -1) * 4 * FEET_PER_NM);
}

/** A station abeam or behind, close enough to count as passed. */
function passed(flight: Flight, point: LatLon): boolean {
  const off = angleDifference(
    bearingTrue(flight.readout.position, point),
    flight.readout.trackTrue,
  );
  return Math.abs(off) > 100 && distanceNm(flight.readout.position, point) < 20;
}

/** The speed for the altitude: 250 below 10,000 ft, 300 above, then Mach 0.84 up high. */
function cruiseSpeed(altitudeFt: number): number {
  if (altitudeFt < 10_500) return 250;
  return Math.min(300, casFromTas(0.84 * airAt(altitudeFt).soundKt, airAt(altitudeFt)));
}

function verticalPath(flight: Flight, targetFt: number) {
  const afds = flight.afds;
  const r = flight.readout;
  const panel = flight.panel;
  afds.altitude = targetFt;
  const toGo = targetFt - r.altitudeFt;
  const approaching =
    flight.atc.stage === 'vectors' || flight.atc.stage === 'approach' || flight.approach.active;
  const speed = approaching ? approachSpeed(flight) : cruiseSpeed(Math.max(r.altitudeFt, targetFt));
  if (afds.pitchMode === 'glideslope') {
    engageAutothrottle(flight, speed);
    return;
  }
  const slope = flight.nav[0].glideslope;
  if (afds.rollMode === 'localizer' && afds.armedGlideslope && slope !== null && slope > 0.2) {
    // Established but high: descend to meet the glideslope from above, as a crew would.
    afds.pitchMode = 'verticalSpeed';
    afds.verticalSpeed = -1200;
    afds.altitude = flight.world.ils.runway.elevationFt + 500;
    engageAutothrottle(flight, speed);
    return;
  }
  if (toGo > 600) {
    afds.pitchMode = 'speed';
    // V2 + 15 to 1,000 ft, then the nose comes down a little to accelerate and clean up.
    const initial = flight.readout.heightFt < 1000 && !approaching ? flight.speeds.v2 + 15 : speed;
    afds.speedKt = Math.min(initial, cruiseSpeed(r.altitudeFt));
    afds.autothrottle = false;
    if (flight.readout.heightFt > 1000) setLevers(panel, 0.93);
  } else if (toGo < -600) {
    if (afds.pitchMode !== 'verticalSpeed') {
      afds.pitchMode = 'verticalSpeed';
    }
    const wanted = Math.min(speed, cruiseSpeed(targetFt + 500));
    // Too fast for what comes next: shallow the descent and let the speed bleed off.
    afds.verticalSpeed = r.iasKt > wanted + 5 ? -800 : r.altitudeFt > 12_000 ? -2200 : -1600;
    engageAutothrottle(flight, wanted);
  } else {
    if (afds.pitchMode === 'speed' || afds.pitchMode === 'takeoff')
      afds.pitchMode = 'altitudeCapture';
    engageAutothrottle(flight, speed);
  }
  panel.speedbrake =
    r.iasKt > afds.speedKt + 15 && afds.pitchMode === 'verticalSpeed'
      ? 'flight'
      : panel.gearDown
        ? 'armed'
        : 'down';
}

function engageAutothrottle(flight: Flight, speedKt: number) {
  const afds = flight.afds;
  if (!afds.autothrottle) {
    afds.autothrottle = true;
    afds.leverTrim = Math.min(flight.panel.levers[0] ?? 0.6, 0.6);
  }
  afds.speedKt = speedKt;
}

/** 210 on the vectors, slower once cleared, Vref + 15 on the localizer, Vref + 5 down the glideslope. */
function approachSpeed(flight: Flight): number {
  const vref = referenceSpeedNow(flight);
  if (flight.afds.pitchMode === 'glideslope') return vref + 5;
  if (flight.afds.rollMode === 'localizer') return vref + 15;
  if (flight.atc.cleared.approach) return Math.max(vref + 30, 170);
  return 210;
}

/** Flaps by the speed: in as it builds after takeoff, out as it falls for the approach. */
function retractOrExtendFlaps(flight: Flight) {
  const r = flight.readout;
  const vref = referenceSpeedNow(flight);
  const margins = [80, 60, 40, 30, 20, 10, 0];
  const fitting = margins.findIndex((margin) => r.iasKt >= vref + margin + 5);
  const index = fitting < 0 ? FLAP_DETENTS.length - 1 : fitting;
  const panel = flight.panel;
  const descendingToLand = flight.approach.active || flight.atc.cleared.approach;
  if (descendingToLand) {
    const landing = flight.afds.pitchMode === 'glideslope' ? FLAP_DETENTS.length - 1 : index;
    const limited = FLAP_DETENTS.findLastIndex((detent) => detent.limitKt > r.iasKt + 3);
    panel.flapLever = Math.max(panel.flapLever, Math.min(landing, limited));
  } else if (r.verticalSpeedFpm > 0) {
    panel.flapLever = Math.min(panel.flapLever, index);
  }
}

function approachSetup(pilot: TestPilot) {
  const { flight } = pilot;
  const panel = flight.panel;
  const afds = flight.afds;
  const r = flight.readout;
  const strip = flight.world.ils.runway;
  const destination = flight.world.destination;
  const cleared = flight.atc.cleared;
  const courseMagnetic = magnetic(flight, strip.headingTrue);
  panel.nav[0] = { frequency: destination.localizer, course: courseMagnetic };
  panel.speedBugKt = referenceSpeedNow(flight);
  if (r.altitudeFt < 18_000) panel.altimeterInHg = flight.world.weather.destination.qnh;
  tryChecklist(flight, 'approach');
  if (cleared.heading !== null && afds.rollMode === 'heading') panel.headingBug = cleared.heading;
  else if (afds.rollMode === 'heading')
    panel.headingBug = magnetic(flight, bearingTrue(r.position, nextWaypoint(pilot)));
  if (
    cleared.approach &&
    !flight.approach.goingAround &&
    !afds.armedNavigation &&
    afds.rollMode !== 'localizer'
  ) {
    afds.armedNavigation = true;
    afds.armedGlideslope = true;
  }
  if (!cleared.approach && (afds.rollMode === 'localizer' || afds.armedNavigation)) {
    // No approach clearance any more (a go-around): back to flying the controller's headings.
    afds.rollMode = 'heading';
    afds.armedNavigation = false;
    afds.armedGlideslope = false;
    if (afds.pitchMode === 'glideslope') afds.pitchMode = 'speed';
  }
  if (
    afds.pitchMode === 'glideslope' ||
    (flight.nav[0].glideslope !== null && flight.nav[0].glideslope > -0.5)
  ) {
    panel.gearDown = true;
  }
  if (panel.gearDown) panel.speedbrake = 'armed';
  tryChecklist(flight, 'landing');
}

/** From 160 ft: the autopilot out, the descent held by hand, a flare at 35 ft, the levers closed. */
function landByHand(pilot: TestPilot): FlightInput {
  const { flight } = pilot;
  const r = flight.readout;
  const afds = flight.afds;
  const panel = flight.panel;
  afds.autopilot = false;
  tryChecklist(flight, 'landing');
  const input = { ...NO_INPUT };
  const radio = flight.radioAltitudeFt ?? r.heightFt;
  if (radio < 30) pilot.flaring = true;
  const wanted = pilot.flaring ? -260 : -Math.max(600, r.groundSpeedKt * FPS_PER_KNOT * 60 * 0.052);
  const pitch = r.pitchDeg + clamp((wanted - r.verticalSpeedFpm) * 0.004, -2, 2.5);
  input.elevator = pitchTo(flight, clamp(pitch, -2, 7));
  if (radio < 25 || pilot.flaring) {
    afds.autothrottle = false;
    setLevers(panel, 0);
  }
  // Wings level on the localizer: a track a little toward the centreline, never much bank.
  const nav = flight.nav[0];
  const toward = nav.kind === 'localizer' ? clamp(12 * nav.deviation, -10, 10) : 0;
  const track = normaliseDegrees(flight.world.ils.runway.headingTrue + toward);
  const bank = clamp(
    1.6 * angleDifference(track, r.trackTrue),
    radio < 30 ? -2 : -6,
    radio < 30 ? 2 : 6,
  );
  const rollRate = flight.airframe?.rollRate ?? 0;
  input.aileron = clamp((bank - r.bankDeg) * 0.08 - rollRate * 0.05, -1, 1);
  // Kick out the crab just before the wheels touch.
  if (radio < 15)
    input.rudder = clamp(
      angleDifference(flight.world.ils.runway.headingTrue, r.headingTrue) * 0.15,
      -1,
      1,
    );
  return input;
}

function rollout(flight: Flight): FlightInput {
  const r = flight.readout;
  const strip = flight.touchdown?.runway ?? flight.world.ils.runway;
  const panel = flight.panel;
  setLevers(panel, 0);
  setReverse(panel, r.iasKt > 70 ? 1 : 0);
  const { across } = onRunway(strip, r.position);
  return {
    ...NO_INPUT,
    elevator: -0.2,
    brakes: flight.touchdown && flight.time - flight.touchdown.at > 2 ? 0.8 : 0,
    rudder: clamp(angleDifference(strip.headingTrue, r.headingTrue) * 0.3 - across * 0.006, -1, 1),
  };
}

// ——— The 1982 rules ———

const PROGRAM_CRUISE_FT = 6000;

function programPilot(pilot: TestPilot): FlightInput {
  const { flight } = pilot;
  const program = flight.program;
  if (!program) return { ...NO_INPUT };
  const panel = flight.panel;
  const input = { ...NO_INPUT };
  const strip = flight.world.ils.runway;
  switch (program.phase) {
    case 'parked':
    case 'takeoffRoll': {
      panel.flapLever = 1;
      if (!flight.atc.cleared.takeoff) return input;
      panel.parkingBrake = false;
      setLevers(panel, 1);
      const error = angleDifference(flight.world.departure.headingTrue, program.heading);
      if (program.airspeedKt > 50 && Math.abs(error) >= 1) input.rudderSteps = Math.sign(error);
      if (program.airspeedKt >= 152 && program.pitch === 0) input.pitchSteps = 1;
      return input;
    }
    case 'departure':
      panel.gearDown = false;
      if (!program.gearDown) panel.flapLever = 0;
      if (!program.flapsDown) setLevers(panel, PROGRAM_LEVERS[3]);
      return input;
    case 'cruise':
      return programCruise(pilot, input);
    case 'ils': {
      const { elevationDeg, across } = ilsGeometry(
        flight.world.ils,
        program.position,
        program.altitudeFt,
      );
      const height = program.altitudeFt - strip.elevationFt;
      const wantedPitch = elevationDeg > flight.world.ils.glideslopeDeg ? -3 : -2;
      if (!program.flared && wantedPitch !== program.pitch)
        input.pitchSteps = Math.sign(wantedPitch - program.pitch);
      // Crab into the drift and steer back toward the centreline, a degree a press.
      const drift = flight.world.weather.finalDriftKt;
      const crab =
        asin(clamp(drift / Math.max(program.airspeedKt, 60), -0.5, 0.5)) * DEGREES_PER_RADIAN;
      const wanted = normaliseDegrees(strip.headingTrue - crab - clamp(across / 150, -6, 6));
      const error = angleDifference(wanted, program.heading);
      if (Math.abs(error) >= 1) input.rudderSteps = Math.sign(error);
      if (height < 45 && !program.flared) {
        input.flare = true;
        setLevers(panel, 0);
      }
      return input;
    }
    case 'rollout':
      setReverse(panel, 1);
      return input;
    default:
      return input;
  }
}

/** Low and fast to a point twenty miles out on the centreline, then down, slowed and lined up for the gate. */
function programCruise(pilot: TestPilot, input: FlightInput): FlightInput {
  const { flight } = pilot;
  const program = flight.program;
  if (!program) return input;
  const panel = flight.panel;
  const strip = flight.world.ils.runway;
  const station = STATIONS[flight.world.destination.station];
  const { along, across } = onRunway(strip, program.position);
  const lineUpOut = 22 * FEET_PER_NM;
  const lineUp = runwayPoint(strip, -lineUpOut, 0);
  if (!pilot.linedUp && distanceNm(program.position, lineUp) < 3) pilot.linedUp = true;
  const onFinal = pilot.linedUp && along < 0;
  const target = onFinal ? runwayPoint(strip, -2 * FEET_PER_NM, 0) : lineUp;
  const toTarget = distanceNm(program.position, target);
  if (station && toTarget < 80)
    panel.nav[0] = { frequency: station.frequency, course: Math.round(strip.headingTrue) };

  const height = program.altitudeFt - strip.elevationFt;
  const wantedHeight = onFinal ? 1800 : toTarget < 25 ? 2500 : PROGRAM_CRUISE_FT;
  panel.flapLever = onFinal ? 1 : 0;
  panel.gearDown = onFinal;
  setLevers(panel, PROGRAM_LEVERS[3]);
  const step = program.flapsDown ? 1 : 5;
  const wantedPitch = clamp(Math.round((wantedHeight - height) / 150 / step) * step, -5, 5);
  if (wantedPitch !== program.pitch) input.pitchSteps = Math.sign(wantedPitch - program.pitch);

  // Heading into the wind for the track wanted; on the final, onto the centreline.
  let course = bearingTrue(program.position, target);
  if (onFinal) course = normaliseDegrees(strip.headingTrue - clamp(across / 300, -20, 20));
  const wind = windAt(flight.world.weather, program.position, program.altitudeFt);
  const crossKt = wind.speedKt * sinCosDegrees(wind.direction - course).sin;
  const heading = normaliseDegrees(
    course + asin(clamp(crossKt / program.airspeedKt, -0.5, 0.5)) * DEGREES_PER_RADIAN,
  );
  const error = angleDifference(heading, program.heading);
  const turn = Math.abs(error) > 12 ? 2 : Math.abs(error) >= 0.5 ? 1 : 0;
  const rudder = Math.sign(error) * turn;
  if (rudder === 0 && program.rudder !== 0) input.rudderCentre = true;
  else if (rudder !== program.rudder) input.rudderSteps = rudder - program.rudder;
  return input;
}
