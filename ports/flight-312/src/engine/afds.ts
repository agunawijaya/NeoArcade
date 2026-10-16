import type { AirframeState } from './airframe';
import { angleDifference, asin, clamp, DEGREES_PER_RADIAN, normaliseDegrees } from './exact-math';
import type { NavReading } from './radios';
import { FPS_PER_KNOT } from './units';

/**
 * The autopilot and flight director of the era, as the glareshield panel
 * offers them: a heading, VOR/LOC tracking, the ILS approach (localizer and
 * glideslope), altitude hold with an altitude to capture, vertical speed,
 * airspeed held with the pitch (for climbs), and an autothrottle that holds
 * the speed set on its window. The same
 * computation drives the flight director's bars when the autopilot is off.
 *
 * The glass deck adds two modes of its era: LNAV, which follows the track
 * the flight management computes along the route, and flight level change,
 * which holds the speed with the pitch while the autothrottle sets climb
 * thrust or idle, and levels off at the altitude in the window.
 *
 * Headings and courses here are true; the panel converts the magnetic
 * numbers the crew sets.
 */
export type RollMode = 'wings' | 'heading' | 'navigation' | 'localizer' | 'route';
export type PitchMode =
  | 'attitude'
  | 'speed'
  | 'altitudeHold'
  | 'verticalSpeed'
  | 'altitudeCapture'
  | 'glideslope'
  | 'takeoff';
/** What the autothrottle does: hold the speed, set climb thrust, or close the levers. */
export type ThrustMode = 'speed' | 'climb' | 'idle';

export interface AfdsState {
  autopilot: boolean;
  flightDirector: boolean;
  autothrottle: boolean;
  rollMode: RollMode;
  pitchMode: PitchMode;
  /** VOR/LOC or ILS armed, waiting for the beam. */
  armedNavigation: boolean;
  armedGlideslope: boolean;
  /** LNAV armed, waiting to be clear of the ground. */
  armedRoute: boolean;
  /** Flight level change: the speed on the pitch until the altitude in the window. */
  levelChange: boolean;
  thrustMode: ThrustMode;
  heading: number;
  course: number;
  /** The track LNAV asks for, true, while the flight management has a leg to fly. */
  routeTrack: number | null;
  altitude: number;
  verticalSpeed: number;
  speedKt: number;
  /** The pitch to hold in attitude mode, degrees. */
  pitchHold: number;
  /** The autothrottle's slow part: the lever it has learned holds the speed. */
  leverTrim: number;
  /** Airspeed a step ago, for the autothrottle's damping and the speed mode. */
  lastIas: number;
  /** How fast the airspeed is changing, knots a second, smoothed. */
  iasTrend: number;
}

export interface AfdsOutput {
  /** What the flight director's bars ask for. */
  pitchTarget: number;
  bankTarget: number;
  /** The autopilot's rate commands into the airframe, when engaged. */
  pitchRate: number;
  rollRate: number;
  /** The autothrottle's lever, when engaged. */
  lever: number | null;
}

export function startAfds(): AfdsState {
  return {
    autopilot: false,
    flightDirector: true,
    autothrottle: false,
    rollMode: 'wings',
    pitchMode: 'takeoff',
    armedNavigation: false,
    armedGlideslope: false,
    armedRoute: false,
    levelChange: false,
    thrustMode: 'speed',
    heading: 0,
    course: 0,
    routeTrack: null,
    altitude: 3000,
    verticalSpeed: 0,
    speedKt: 250,
    pitchHold: 0,
    leverTrim: 0.6,
    lastIas: 0,
    iasTrend: 0,
  };
}

/** Steepest bank the autopilot uses. */
const MAX_BANK = 25;
const MAX_VERTICAL_SPEED = 3000;
/** In the speed mode the path keeps at least this much climb toward a higher altitude in the window. */
const MIN_CLIMB_PATH_DEG = 1.5;
const LEVEL_BAND_FT = 200;
/** The levers the autothrottle sets for a climb: climb thrust, a little short of full. */
const CLIMB_LEVER = 0.93;

export function stepAfds(
  afds: AfdsState,
  aircraft: AirframeState,
  nav: NavReading,
  currentLever: number,
  dt: number,
): AfdsOutput {
  // A level change belongs to the speed mode: leaving it, the autothrottle goes back to the speed.
  if (afds.pitchMode !== 'speed' && afds.levelChange) {
    afds.levelChange = false;
    afds.thrustMode = 'speed';
  }
  captureBeams(afds, nav);
  if (afds.lastIas > 0) {
    afds.iasTrend += ((aircraft.iasKt - afds.lastIas) / dt - afds.iasTrend) * clamp(dt / 1.5, 0, 1);
  }
  afds.lastIas = aircraft.iasKt;
  const bankTarget = rollTarget(afds, aircraft, nav);
  const pitchTarget = pitchTargetFor(afds, aircraft, nav);
  return {
    pitchTarget,
    bankTarget,
    pitchRate: clamp(0.9 * (pitchTarget - aircraft.pitchDeg), -2.5, 2.5),
    rollRate: clamp(1.2 * (bankTarget - aircraft.bankDeg), -6, 6),
    lever: afds.autothrottle ? autothrottle(afds, aircraft, currentLever, dt) : null,
  };
}

function captureBeams(afds: AfdsState, nav: NavReading) {
  // The localizer is captured as soon as its needle comes off the stop; a VOR a little later.
  const captureShare = nav.kind === 'localizer' ? 0.95 : 0.8;
  if (
    afds.armedNavigation &&
    nav.kind !== 'none' &&
    Math.abs(nav.deviation) < nav.fullScale * captureShare
  ) {
    afds.rollMode = nav.kind === 'localizer' ? 'localizer' : 'navigation';
    afds.armedNavigation = false;
  }
  if (
    afds.armedGlideslope &&
    afds.rollMode === 'localizer' &&
    nav.glideslope !== null &&
    Math.abs(nav.glideslope) < 0.15
  ) {
    afds.pitchMode = 'glideslope';
    afds.armedGlideslope = false;
  }
}

/** The bank that turns onto a track, rolling out without overshoot. */
function bankForTrack(aircraft: AirframeState, track: number): number {
  return clamp(1.6 * angleDifference(track, aircraft.trackTrue), -MAX_BANK, MAX_BANK);
}

function rollTarget(afds: AfdsState, aircraft: AirframeState, nav: NavReading): number {
  if (aircraft.onGround) return 0;
  switch (afds.rollMode) {
    case 'heading':
      return clamp(1.6 * angleDifference(afds.heading, aircraft.headingTrue), -MAX_BANK, MAX_BANK);
    case 'navigation': {
      // Intercept at up to 45°, three degrees of intercept for every degree off the radial.
      const intercept = clamp(3 * nav.deviation, -45, 45);
      return bankForTrack(aircraft, normaliseDegrees(afds.course + intercept));
    }
    case 'localizer': {
      const intercept = clamp(12 * nav.deviation, -30, 30);
      return bankForTrack(aircraft, normaliseDegrees(afds.course + intercept));
    }
    case 'route':
      return afds.routeTrack === null
        ? clamp(1.6 * angleDifference(afds.heading, aircraft.headingTrue), -MAX_BANK, MAX_BANK)
        : bankForTrack(aircraft, afds.routeTrack);
    default:
      return 0;
  }
}

/** The pitch that gives a vertical speed at this speed and angle of attack. */
function pitchForVerticalSpeed(aircraft: AirframeState, fpm: number): number {
  const speed = (aircraft.tasKt > 60 ? aircraft.tasKt : 60) * FPS_PER_KNOT;
  const path = asin(clamp(fpm / 60 / speed, -0.5, 0.5)) * DEGREES_PER_RADIAN;
  const correction = clamp((fpm - aircraft.verticalSpeedFpm) * 0.0015, -3, 3);
  return path + aircraft.alphaDeg + correction;
}

function pitchTargetFor(afds: AfdsState, aircraft: AirframeState, nav: NavReading): number {
  switch (afds.pitchMode) {
    case 'takeoff':
      // On the runway the bars sit level; once flying they hold the speed set (V2 + 10) with the pitch.
      return aircraft.onGround ? 0 : clamp(speedOnPitch(afds, aircraft), 8, 18);
    case 'attitude':
      return afds.pitchHold;
    case 'speed': {
      if (afds.levelChange) captureFromLevelChange(afds, aircraft);
      // Climbing to the altitude in the window, the speed is never bought by descending.
      const climbing = afds.altitude - aircraft.altitudeFt > LEVEL_BAND_FT;
      const lowest = climbing ? aircraft.alphaDeg + MIN_CLIMB_PATH_DEG : -10;
      return clamp(speedOnPitch(afds, aircraft), lowest, 20);
    }
    case 'verticalSpeed': {
      const toGo = afds.altitude - aircraft.altitudeFt;
      // Capture the selected altitude: start levelling a tenth of the climb rate before it.
      if (
        Math.abs(toGo) < Math.abs(aircraft.verticalSpeedFpm) / 10 + 80 &&
        Math.sign(toGo) === Math.sign(afds.verticalSpeed)
      ) {
        afds.pitchMode = 'altitudeCapture';
      }
      return pitchForVerticalSpeed(aircraft, afds.verticalSpeed);
    }
    case 'altitudeCapture':
    case 'altitudeHold': {
      const toGo = afds.altitude - aircraft.altitudeFt;
      if (afds.pitchMode === 'altitudeCapture' && Math.abs(toGo) < 30)
        afds.pitchMode = 'altitudeHold';
      return pitchForVerticalSpeed(
        aircraft,
        clamp(toGo * 4, -MAX_VERTICAL_SPEED, MAX_VERTICAL_SPEED),
      );
    }
    case 'glideslope': {
      const slope = nav.glideslope ?? 0;
      // Above the slope fly down a little more, below it a little less: about −3° of path.
      const speed = aircraft.tasKt * FPS_PER_KNOT * 60;
      const descent = speed * 0.0524 + clamp(slope * 2000, -700, 700);
      return pitchForVerticalSpeed(aircraft, -descent);
    }
  }
}

/** Level change ends as the altitude in the window comes up: capture it, and the autothrottle holds the speed again. */
function captureFromLevelChange(afds: AfdsState, aircraft: AirframeState) {
  const toGo = afds.altitude - aircraft.altitudeFt;
  const climbing = afds.thrustMode === 'climb';
  if (
    (climbing ? toGo < 0 : toGo > 0) ||
    Math.abs(toGo) < Math.abs(aircraft.verticalSpeedFpm) / 10 + 80
  ) {
    afds.pitchMode = 'altitudeCapture';
    afds.levelChange = false;
    afds.thrustMode = 'speed';
  }
}

/**
 * Holds a speed with the pitch: trade the climb for the speed error, the
 * path that would bring the speed back over about ten seconds, from
 * dV/dt = g·((T − D)/W − sin γ), but never more than a few degrees at a
 * time, so a big error is flown out gently instead of with a dive.
 */
function speedOnPitch(afds: AfdsState, aircraft: AirframeState): number {
  const correction =
    ((afds.iasTrend + 0.1 * (aircraft.iasKt - afds.speedKt)) * FPS_PER_KNOT) / 32.174;
  return aircraft.pathDeg + clamp(correction * DEGREES_PER_RADIAN, -4, 4) + aircraft.alphaDeg;
}

/**
 * Proportional and integral on the speed error, damped by how fast the
 * speed is already changing, and moving the levers no faster than a hand
 * would: the engines lag the levers by seconds, so anything quicker hunts.
 */
function autothrottle(
  afds: AfdsState,
  aircraft: AirframeState,
  current: number,
  dt: number,
): number {
  const step = 0.1 * dt;
  if (afds.thrustMode !== 'speed') {
    // The speed loop follows the levers meanwhile, so it takes over from where they are.
    afds.leverTrim = current;
    const target = afds.thrustMode === 'climb' ? CLIMB_LEVER : 0;
    return clamp(target, current - step, current + step);
  }
  const error = afds.speedKt - aircraft.iasKt;
  afds.leverTrim = clamp(afds.leverTrim + error * 0.0015 * dt, 0, 1);
  const wanted = clamp(afds.leverTrim + 0.025 * error - 0.12 * afds.iasTrend, 0, 1);
  return clamp(wanted, current - step, current + step);
}
