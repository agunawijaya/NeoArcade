import { applyCommand, type CrewCommand } from './crew';
import { angleDifference, clamp, normaliseDegrees } from './exact-math';
import { magneticHeading, NO_INPUT, type Flight, type FlightInput } from './flight-state';
import { bearingTrue, distanceNm } from './geo';
import { currentTask, type LessonRun } from './lesson-monitor';
import type { LessonCheck, LessonTask } from './lesson';
import { toMagnetic, variationAt } from './magnetic';
import { STATIONS } from './navdata';
import { onRunway } from './runways';
import { FLAP_DETENTS } from './aircraft';
import { DECISION_HEIGHT_FT } from './warnings';
import { createTestPilot, testPilotInput, type TestPilot } from './test-pilot';

/**
 * The instructor flying a lesson's demonstration, and the proof in the
 * tests that every lesson can be flown: the scripted test pilot for the
 * takeoffs, the approaches and the whole flight, and for the air work the
 * autopilot, set the way the lesson asks — a heading, an altitude, a
 * radial intercepted and tracked, a descent planned to cross a fix. It
 * works the cockpit through the same commands as a player.
 */
export interface LessonPilot {
  run: LessonRun;
  testPilot: TestPilot;
  /** The task it has set the autopilot up for, so it sets it once. */
  setUpFor: number;
  wentAround: boolean;
}

/** The demonstration pauses this long on each cockpit item, so it can be followed. */
const SET_PAUSE_SECONDS = 2;

export function createLessonPilot(flight: Flight, run: LessonRun): LessonPilot {
  const testPilot = createTestPilot(flight);
  // A lesson that starts near the field is past the route's stations already.
  if (flight.setup.mode === 'approach') testPilot.legIndex = flight.plan.legs.length;
  return { run, testPilot, setUpFor: -1, wentAround: false };
}

export function lessonPilotInput(pilot: LessonPilot): FlightInput {
  const flight = pilot.testPilot.flight;
  const task = currentTask(pilot.run);
  if (!task) return pilot.run.status === 'briefing' ? holdStill(flight) : { ...NO_INPUT };
  const command = (value: CrewCommand) => applyCommand(flight, value);
  switch (task.kind) {
    case 'set':
      if (flight.time - pilot.run.taskStartedAt > SET_PAUSE_SECONDS && task.check)
        for (const value of commandsFor(task.check, flight)) command(value);
      return holdStill(flight);
    case 'heading':
    case 'altitude':
    case 'track':
    case 'dme':
    case 'crossAt':
      airWork(pilot, task, flight);
      return { ...NO_INPUT };
    case 'goAround': {
      const radio = flight.radioAltitudeFt;
      if (!pilot.wentAround && radio !== null && radio < DECISION_HEIGHT_FT + 10) {
        pilot.wentAround = true;
        return { ...NO_INPUT, missedApproach: true };
      }
      onTheAutopilot(flight);
      const input = testPilotInput(pilot.testPilot);
      // Go-around pitch and thrust until the climb is well established, as the TO/GA switch sets them.
      if (pilot.wentAround && flight.readout.heightFt < 1000) {
        flight.afds.pitchMode = 'takeoff';
        flight.afds.speedKt = flight.speeds.vref + 25;
      }
      return input;
    }
    case 'localizer':
    case 'glideslope':
    case 'glidepath':
    case 'land': {
      onTheAutopilot(flight);
      const input = testPilotInput(pilot.testPilot);
      // No controller gives vectors in a lesson: the instructor holds the intercept heading.
      if (flight.afds.rollMode === 'heading' && !flight.approach.goingAround)
        flight.panel.headingBug = interceptHeading(flight);
      return input;
    }
    default:
      return testPilotInput(pilot.testPilot);
  }
}

/** Thirty degrees onto the localizer from whichever side the aircraft is on. */
function interceptHeading(flight: Flight): number {
  const strip = flight.world.ils.runway;
  const side = onRunway(strip, flight.readout.position).across >= 0 ? 1 : -1;
  const course = toMagnetic(strip.headingTrue, variationAt(strip.threshold));
  return Math.round(normaliseDegrees(course - side * 30)) || 360;
}

/** On the ground the parking brake holds the jumbo; in the air the autopilot does. */
function holdStill(flight: Flight): FlightInput {
  if (!flight.readout.onGround) onTheAutopilot(flight);
  return { ...NO_INPUT };
}

/**
 * A lesson handed over in the air with the autopilot off: the instructor
 * puts it in to fly the approach, and takes it out again for the landing.
 */
function onTheAutopilot(flight: Flight) {
  const afds = flight.afds;
  if (afds.autopilot || flight.readout.onGround || flight.readout.heightFt < 200) return;
  afds.autopilot = true;
  afds.autothrottle = true;
  afds.leverTrim = flight.panel.levers[0] ?? 0.5;
  // Handed over on the final: established on both beams already.
  if (flight.setup.start?.place.kind === 'final') {
    afds.rollMode = 'localizer';
    afds.pitchMode = 'glideslope';
    afds.armedNavigation = false;
    afds.armedGlideslope = false;
  }
}

function commandsFor(check: LessonCheck, flight: Flight): CrewCommand[] {
  const panel = flight.panel;
  switch (check.check) {
    case 'flaps': {
      const index = FLAP_DETENTS.findIndex((detent) => detent.degrees === check.degrees);
      return index >= 0 ? [{ kind: 'flapLever', index }] : [];
    }
    case 'parkingBrake':
      return panel.parkingBrake === check.set ? [] : [{ kind: 'parkingBrake' }];
    case 'gear':
      return panel.gearDown === check.down ? [] : [{ kind: 'gear' }];
    case 'thrust':
      return [{ kind: 'levers', value: check.atLeast }];
    case 'nav1':
      return [
        { kind: 'tuneNav', radio: 0, frequency: check.frequency, course: panel.nav[0].course },
      ];
    case 'course1':
      return [
        {
          kind: 'tuneNav',
          radio: 0,
          frequency: panel.nav[0].frequency,
          course: check.course,
        },
      ];
    case 'headingBug':
      return [
        {
          kind: 'knob',
          knob: 'heading',
          clicks: Math.round(angleDifference(check.heading, panel.headingBug)),
        },
      ];
    case 'altitudeWindow':
      return [
        {
          kind: 'knob',
          knob: 'altitude',
          clicks: Math.round((check.altitudeFt - flight.afds.altitude) / 100),
        },
      ];
    case 'autopilot':
      return flight.afds.autopilot === check.engaged
        ? []
        : [{ kind: 'button', button: 'autopilot' }];
    case 'approachArmed':
      return flight.afds.armedGlideslope ? [] : [{ kind: 'button', button: 'approach' }];
  }
}

/**
 * Air work on the autopilot: the heading bug, the altitude window and the
 * vertical speed, as a crew sets them, and for a radial the VOR mode armed
 * from a heading that intercepts it.
 */
function airWork(pilot: LessonPilot, task: LessonTask, flight: Flight) {
  const afds = flight.afds;
  const panel = flight.panel;
  const r = flight.readout;
  afds.autopilot = true;
  if (!afds.autothrottle) {
    afds.autothrottle = true;
    afds.leverTrim = panel.levers[0] ?? 0.6;
  }
  const station = STATIONS.find((candidate) => candidate.ident === task.station);
  const firstLook = pilot.setUpFor !== pilot.run.task;
  pilot.setUpFor = pilot.run.task;
  switch (task.kind) {
    case 'heading':
      afds.rollMode = 'heading';
      panel.headingBug = Math.round(task.heading ?? magneticHeading(flight));
      holdAltitude(flight, pilot.run.holdAltitudeFt);
      return;
    case 'altitude': {
      afds.altitude = task.altitudeFt ?? afds.altitude;
      if (firstLook) {
        afds.pitchMode = 'verticalSpeed';
        afds.verticalSpeed = afds.altitude > r.altitudeFt ? 1500 : -1500;
      }
      return;
    }
    case 'track':
    case 'dme': {
      if (!station) return;
      if (firstLook) {
        panel.nav[0] = { frequency: station.frequency, course: task.radial ?? 0 };
        afds.armedNavigation = true;
        afds.rollMode = 'heading';
        // Out to the radial at forty-five degrees, on the side the needle points.
        const toTheRight = flight.nav[0].kind === 'vor' ? flight.nav[0].deviation > 0 : true;
        panel.headingBug = Math.round(
          normaliseDegrees((task.radial ?? 0) + (toTheRight ? 45 : -45)) || 360,
        );
      }
      holdAltitude(flight, pilot.run.holdAltitudeFt);
      return;
    }
    case 'crossAt': {
      if (!station) return;
      afds.rollMode = 'heading';
      panel.headingBug = Math.round(
        toMagnetic(bearingTrue(r.position, station.position), variationAt(r.position)),
      );
      // The rate that reaches the altitude just as the fix comes up.
      const toFixNm = distanceNm(r.position, station.position) - (task.dmeNm ?? 0);
      const minutes = Math.max(0.5, (toFixNm / Math.max(r.groundSpeedKt, 120)) * 60);
      const target = task.altitudeFt ?? r.altitudeFt;
      afds.altitude = target;
      if (r.altitudeFt - target > 150) {
        afds.pitchMode = 'verticalSpeed';
        afds.verticalSpeed =
          -Math.round(clamp((r.altitudeFt - target) / minutes, 500, 3000) / 100) * 100;
      } else if (afds.pitchMode === 'verticalSpeed') afds.pitchMode = 'altitudeCapture';
      return;
    }
    default:
      return;
  }
}

function holdAltitude(flight: Flight, altitudeFt: number) {
  const afds = flight.afds;
  afds.altitude = Math.round(altitudeFt / 100) * 100;
  if (afds.pitchMode !== 'altitudeHold' && afds.pitchMode !== 'altitudeCapture')
    afds.pitchMode = 'altitudeCapture';
}
