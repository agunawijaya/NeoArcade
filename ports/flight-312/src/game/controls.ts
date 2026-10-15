import type { CockpitAction, KnobId, McpButton } from '../cockpit/actions';
import { FLAP_DETENTS } from '../engine/aircraft';
import { clamp, normaliseDegrees } from '../engine/exact-math';
import type { Flight } from '../engine/flight';
import {
  COMM_BAND,
  moveFlapLever,
  moveSpeedbrake,
  NAV_BAND,
  setLevers,
  setReverse,
  swapComm,
  turnFrequency,
  type Panel,
} from '../engine/panel';
import { PROGRAM_LEVERS } from '../engine/readout';
import { programThrustIndex } from '../engine/fly-program';
import { STATIONS } from '../engine/navdata';
import { bearingTrue } from '../engine/geo';

/**
 * What the crew's hands do to the flight: one place for the cockpit's
 * clicks and drags, the keyboard and the gamepad, so they all move the
 * same levers the same way. Nothing here touches the flight's physics:
 * it sets switches, levers, bugs and modes, which the engine then reads.
 */
const DEGREES = (value: number) => normaliseDegrees(Math.round(value)) || 360;

function turnKnob(flight: Flight, knob: KnobId, clicks: number) {
  const panel = flight.panel;
  const afds = flight.afds;
  switch (knob) {
    case 'heading':
      panel.headingBug = DEGREES(panel.headingBug + clicks);
      return;
    case 'course1':
      panel.nav[0] = { ...panel.nav[0], course: DEGREES(panel.nav[0].course + clicks) };
      return;
    case 'course2':
      panel.nav[1] = { ...panel.nav[1], course: DEGREES(panel.nav[1].course + clicks) };
      return;
    case 'altitude':
      afds.altitude = clamp(afds.altitude + clicks * 100, 0, 45_000);
      return;
    case 'verticalSpeed':
      afds.verticalSpeed = clamp(afds.verticalSpeed + clicks * 100, -6000, 6000);
      return;
    case 'speed':
      afds.speedKt = clamp(afds.speedKt + clicks, 100, 400);
      return;
    case 'speedBug':
      panel.speedBugKt = clamp(panel.speedBugKt + clicks, 60, 400);
      return;
    case 'altimeter':
      panel.altimeterInHg =
        Math.round(clamp(panel.altimeterInHg + clicks * 0.01, 28.5, 31) * 100) / 100;
      return;
    case 'nav1Whole':
    case 'nav1Fraction':
    case 'nav2Whole':
    case 'nav2Fraction': {
      const radio = knob.startsWith('nav1') ? 0 : 1;
      const step = knob.endsWith('Whole') ? 1 : NAV_BAND.step;
      const tuning = panel.nav[radio];
      panel.nav[radio] = {
        ...tuning,
        frequency: turnFrequency(
          tuning.frequency,
          NAV_BAND.low,
          NAV_BAND.high,
          NAV_BAND.step,
          Math.round((clicks * step) / NAV_BAND.step),
        ),
      };
      return;
    }
    case 'commWhole':
    case 'commFraction': {
      const step = knob === 'commWhole' ? 1 : COMM_BAND.step;
      panel.commStandby = turnFrequency(
        panel.commStandby,
        COMM_BAND.low,
        COMM_BAND.high,
        COMM_BAND.step,
        Math.round((clicks * step) / COMM_BAND.step),
      );
      return;
    }
  }
}

/** The autopilot can only be engaged in the air, clear of the ground. */
const AUTOPILOT_FLOOR_FT = 400;

function pressButton(flight: Flight, button: McpButton) {
  if (flight.rules === 'program') return;
  const afds = flight.afds;
  const r = flight.readout;
  switch (button) {
    case 'autopilot':
      if (afds.autopilot) afds.autopilot = false;
      else if (!r.onGround && r.heightFt > AUTOPILOT_FLOOR_FT) afds.autopilot = true;
      return;
    case 'flightDirector':
      afds.flightDirector = !afds.flightDirector;
      return;
    case 'autothrottle':
      afds.autothrottle = !afds.autothrottle;
      if (afds.autothrottle) afds.leverTrim = flight.panel.levers[0] ?? 0.6;
      return;
    case 'heading':
      afds.rollMode = 'heading';
      afds.armedNavigation = false;
      afds.armedGlideslope = false;
      return;
    case 'navigation':
      afds.armedNavigation = !afds.armedNavigation;
      afds.armedGlideslope = false;
      return;
    case 'approach':
      afds.armedNavigation = !(afds.armedNavigation && afds.armedGlideslope);
      afds.armedGlideslope = afds.armedNavigation;
      return;
    case 'altitudeHold':
      afds.pitchMode = 'altitudeHold';
      afds.altitude = Math.round(r.altitudeFt / 100) * 100;
      return;
    case 'verticalSpeed':
      afds.pitchMode = 'verticalSpeed';
      if (Math.abs(r.verticalSpeedFpm) > 100)
        afds.verticalSpeed = Math.round(r.verticalSpeedFpm / 100) * 100;
      return;
    case 'speed':
      afds.pitchMode = 'speed';
      afds.speedKt = Math.round(r.iasKt);
      return;
  }
}

export function applyAction(flight: Flight, action: CockpitAction) {
  const panel = flight.panel;
  switch (action.kind) {
    case 'knob':
      turnKnob(flight, action.knob, action.clicks);
      return;
    case 'button':
      pressButton(flight, action.button);
      return;
    case 'gear':
      panel.gearDown = !panel.gearDown;
      return;
    case 'levers':
      // A hand on the levers takes them from the autothrottle.
      flight.afds.autothrottle = false;
      setLevers(panel, action.value);
      return;
    case 'reverse':
      setReverse(panel, action.value);
      return;
    case 'flapLever':
      panel.flapLever = clamp(action.index, 0, FLAP_DETENTS.length - 1);
      return;
    case 'speedbrake':
      panel.speedbrake = action.lever;
      return;
    case 'parkingBrake':
      panel.parkingBrake = !panel.parkingBrake;
      return;
    case 'swapComm':
      swapComm(panel);
      return;
    case 'crossfeed':
      panel.crossfeed = !panel.crossfeed;
      return;
    case 'wipers':
      panel.wipers = panel.wipers === 'off' ? 'low' : panel.wipers === 'low' ? 'high' : 'off';
      return;
    case 'landingLights':
      panel.landingLights = !panel.landingLights;
      return;
    case 'checklist':
    case 'view':
      return;
  }
}

/** Thrust a step: the program's detents under the 1982 rules, a twentieth of the travel otherwise. */
export function stepThrust(flight: Flight, direction: 1 | -1) {
  const panel = flight.panel;
  flight.afds.autothrottle = false;
  if (panel.reverse.some((lever) => lever > 0)) {
    if (direction < 0) setReverse(panel, 1);
    else setReverse(panel, 0);
    return;
  }
  if (flight.rules === 'program') {
    const program = flight.program;
    // On the runway the program's F gave full thrust at once.
    if (
      direction > 0 &&
      program &&
      (program.phase === 'parked' || program.phase === 'takeoffRoll')
    ) {
      setLevers(panel, 1);
      return;
    }
    const index = clamp(programThrustIndex(panel.levers) - direction, 1, 6);
    setLevers(panel, PROGRAM_LEVERS[index - 1] ?? 0);
    return;
  }
  setLevers(panel, (panel.levers[0] ?? 0) + direction * 0.05);
}

export function stepFlaps(flight: Flight, direction: 1 | -1) {
  moveFlapLever(flight.panel, direction);
}

/** The 1982 keys' flaps: one press down, one press up. */
export function toggleProgramFlaps(panel: Panel) {
  panel.flapLever = panel.flapLever >= 1 ? 0 : 3;
}

export function cycleSpeedbrake(flight: Flight, direction: 1 | -1) {
  moveSpeedbrake(flight.panel, direction);
}

/** V: the next of the program's stations on NAV 1. */
export function nextStation(flight: Flight) {
  const tuning = flight.panel.nav[0];
  const index = STATIONS.findIndex(
    (station) => Math.abs(station.frequency - tuning.frequency) < 0.005,
  );
  const next = STATIONS[(index + 1) % STATIONS.length];
  if (next) flight.panel.nav[0] = { ...tuning, frequency: next.frequency };
}

/** R: the course a degree at a time. */
export function turnCourse(flight: Flight, clicks: number) {
  turnKnob(flight, 'course1', clicks);
}

/** A: the auto-OBS: the course to the station tuned, so the needle centres with TO showing. */
export function autoCourse(flight: Flight) {
  const tuning = flight.panel.nav[0];
  const station = STATIONS.find(
    (candidate) => Math.abs(candidate.frequency - tuning.frequency) < 0.005,
  );
  if (!station) return;
  const reading = flight.nav[0];
  const course =
    reading.kind === 'vor'
      ? reading.bearingTo
      : bearingTrue(flight.readout.position, station.position);
  flight.panel.nav[0] = { ...tuning, course: DEGREES(course) };
}
