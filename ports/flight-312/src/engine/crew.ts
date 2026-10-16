import { FLAP_DETENTS } from './aircraft';
import { answerReadback, type ReadbackChoice } from './atc';
import type { ChecklistId } from './checklists';
import { clamp, normaliseDegrees } from './exact-math';
import { completeChecklist, type Flight } from './flight';
import { programThrustIndex } from './fly-program';
import { editFms, type FmsEdit } from './fms';
import { bearingTrue } from './geo';
import { STATIONS } from './navdata';
import {
  COMM_BAND,
  moveFlapLever,
  moveSpeedbrake,
  NAV_BAND,
  setLevers,
  setReverse,
  swapComm,
  turnFrequency,
  type SpeedbrakeLever,
} from './panel';
import { PROGRAM_LEVERS } from './readout';

/**
 * Everything the crew's hands do to a flight between two steps, as plain
 * values: the cockpit's clicks and drags, the keyboard, the gamepad, the
 * radio answers, the checklists and the CDU all become commands, and
 * `applyCommand` is the one place that carries them out. A flight is its
 * setup, its stick inputs and these commands at the steps they came, which
 * is what a replay keeps. Nothing here touches the physics: commands set
 * switches, levers, bugs and modes that the next step then reads.
 */
export type KnobId =
  | 'heading'
  | 'course1'
  | 'course2'
  | 'altitude'
  | 'verticalSpeed'
  | 'speed'
  | 'speedBug'
  | 'altimeter'
  | 'nav1Whole'
  | 'nav1Fraction'
  | 'nav2Whole'
  | 'nav2Fraction'
  | 'commWhole'
  | 'commFraction';

export type McpButton =
  | 'autopilot'
  | 'flightDirector'
  | 'autothrottle'
  | 'heading'
  | 'navigation'
  | 'approach'
  | 'altitudeHold'
  | 'verticalSpeed'
  | 'speed'
  /** The glass deck's LNAV, flight level change and autothrottle speed mode. */
  | 'lnav'
  | 'levelChange'
  | 'speedHold';

export type CrewCommand =
  | { kind: 'knob'; knob: KnobId; clicks: number }
  | { kind: 'button'; button: McpButton }
  | { kind: 'gear' }
  | { kind: 'levers'; value: number }
  | { kind: 'reverse'; value: number }
  | { kind: 'flapLever'; index: number }
  | { kind: 'speedbrake'; lever: SpeedbrakeLever }
  | { kind: 'parkingBrake' }
  | { kind: 'swapComm' }
  | { kind: 'crossfeed' }
  | { kind: 'wipers' }
  | { kind: 'landingLights' }
  | { kind: 'thrustStep'; direction: 1 | -1 }
  | { kind: 'flapStep'; direction: 1 | -1 }
  /** The 1982 keys' flaps: one press down, one press up. */
  | { kind: 'programFlaps' }
  | { kind: 'speedbrakeStep'; direction: 1 | -1 }
  | { kind: 'reverseToggle' }
  | { kind: 'nextStation' }
  | { kind: 'autoCourse' }
  | { kind: 'tuneNav'; radio: 0 | 1; frequency: number; course: number }
  | { kind: 'readback'; choice: ReadbackChoice['id'] }
  | { kind: 'completeChecklist'; id: ChecklistId }
  | { kind: 'fms'; edit: FmsEdit };

/** Levers are set in steps of 1/1024 of their travel: fine for a hand, exact for a replay. */
export const quantiseLever = (value: number) => Math.round(clamp(value, 0, 1) * 1024) / 1024;

const DEGREES = (value: number) => normaliseDegrees(Math.round(value)) || 360;

/** The autopilot can only be engaged in the air, clear of the ground. */
const AUTOPILOT_FLOOR_FT = 400;

export function applyCommand(flight: Flight, command: CrewCommand) {
  const panel = flight.panel;
  switch (command.kind) {
    case 'knob':
      turnKnob(flight, command.knob, Math.round(command.clicks));
      return;
    case 'button':
      pressButton(flight, command.button);
      return;
    case 'gear':
      panel.gearDown = !panel.gearDown;
      return;
    case 'levers':
      // A hand on the levers takes them from the autothrottle.
      flight.afds.autothrottle = false;
      setLevers(panel, quantiseLever(command.value));
      return;
    case 'reverse':
      setReverse(panel, quantiseLever(command.value));
      return;
    case 'flapLever':
      panel.flapLever = clamp(Math.round(command.index), 0, FLAP_DETENTS.length - 1);
      return;
    case 'speedbrake':
      panel.speedbrake = command.lever;
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
    case 'thrustStep':
      stepThrust(flight, command.direction);
      return;
    case 'flapStep':
      moveFlapLever(panel, command.direction);
      return;
    case 'programFlaps':
      panel.flapLever = panel.flapLever >= 1 ? 0 : 3;
      return;
    case 'speedbrakeStep':
      moveSpeedbrake(panel, command.direction);
      return;
    case 'reverseToggle':
      setReverse(panel, panel.reverse.some((lever) => lever > 0) ? 0 : 1);
      return;
    case 'nextStation':
      nextStation(flight);
      return;
    case 'autoCourse':
      autoCourse(flight);
      return;
    case 'tuneNav':
      panel.nav[command.radio] = {
        frequency: Math.round(clamp(command.frequency, NAV_BAND.low, NAV_BAND.high) * 100) / 100,
        course: DEGREES(command.course),
      };
      return;
    case 'readback':
      if (flight.atc.pending)
        answerReadback(flight.atc, flight.atcContext, command.choice, flight.time);
      return;
    case 'completeChecklist':
      completeChecklist(flight, command.id);
      return;
    case 'fms':
      if (flight.fms)
        editFms(flight.fms, command.edit, flight.readout.position, flight.readout.weightLb);
      return;
  }
}

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

function pressButton(flight: Flight, button: McpButton) {
  if (flight.rules === 'program') return;
  const afds = flight.afds;
  const r = flight.readout;
  // Any other vertical mode ends a level change; the autothrottle goes back to the speed.
  const endLevelChange = () => {
    afds.levelChange = false;
    afds.thrustMode = 'speed';
  };
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
      afds.armedRoute = false;
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
      endLevelChange();
      afds.pitchMode = 'altitudeHold';
      afds.altitude = Math.round(r.altitudeFt / 100) * 100;
      return;
    case 'verticalSpeed':
      endLevelChange();
      afds.pitchMode = 'verticalSpeed';
      if (Math.abs(r.verticalSpeedFpm) > 100)
        afds.verticalSpeed = Math.round(r.verticalSpeedFpm / 100) * 100;
      return;
    case 'speed':
      endLevelChange();
      afds.pitchMode = 'speed';
      afds.speedKt = Math.round(r.iasKt);
      return;
    case 'lnav':
      if (flight.fms && afds.rollMode !== 'route') afds.armedRoute = !afds.armedRoute;
      return;
    case 'levelChange':
      if (r.onGround) return;
      afds.pitchMode = 'speed';
      afds.levelChange = true;
      afds.thrustMode = afds.altitude > r.altitudeFt ? 'climb' : 'idle';
      afds.autothrottle = true;
      return;
    case 'speedHold':
      // In a level change the autothrottle is setting the thrust; the speed is on the pitch.
      if (afds.levelChange) return;
      if (!afds.autothrottle) afds.leverTrim = flight.panel.levers[0] ?? 0.6;
      afds.autothrottle = true;
      afds.thrustMode = 'speed';
      return;
  }
}

/** Thrust a step: the program's detents under the 1982 rules, a twentieth of the travel otherwise. */
function stepThrust(flight: Flight, direction: 1 | -1) {
  const panel = flight.panel;
  flight.afds.autothrottle = false;
  if (panel.reverse.some((lever) => lever > 0)) {
    setReverse(panel, direction < 0 ? 1 : 0);
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
  setLevers(panel, quantiseLever((panel.levers[0] ?? 0) + direction * 0.05));
}

/** V: the next of the program's stations on NAV 1. */
function nextStation(flight: Flight) {
  const tuning = flight.panel.nav[0];
  const index = STATIONS.findIndex(
    (station) => Math.abs(station.frequency - tuning.frequency) < 0.005,
  );
  const next = STATIONS[(index + 1) % STATIONS.length];
  if (next) flight.panel.nav[0] = { ...tuning, frequency: next.frequency };
}

/** A: the auto-OBS: the course to the station tuned, so the needle centres with TO showing. */
function autoCourse(flight: Flight) {
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
