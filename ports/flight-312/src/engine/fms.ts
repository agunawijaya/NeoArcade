import { referenceSpeeds } from './aircraft';
import {
  acos,
  angleDifference,
  asin,
  clamp,
  normaliseDegrees,
  sinCos,
  sinCosDegrees,
} from './exact-math';
import { bearingTrue, destination, distanceNm, type LatLon } from './geo';
import { toMagnetic, variationAt } from './magnetic';
import { STATIONS } from './navdata';
import type { Panel } from './panel';
import { onRunway, runwayPoint } from './runways';
import { EARTH_RADIUS_NM, FEET_PER_NM } from './units';
import type { FlightWorld } from './world';

/**
 * The glass deck's flight management, kept deliberately small: a route of
 * the program's VOR stations, the destination's ILS loaded after it, the
 * takeoff and approach speeds worked out from the weight, and the lateral
 * guidance (LNAV) that flies the legs between them. Changes to the route
 * wait as a modification until the crew executes them, as on the real
 * thing. There is no vertical navigation: climbs and descents are flown
 * with the mode control panel.
 */
export interface FmsState {
  /** Indices into STATIONS, from the departure to the arrival. */
  route: number[];
  /** The destination's ILS fixes follow the route. */
  approach: boolean;
  /** An edit waiting for EXEC, or null. */
  pending: FmsPending | null;
  /** The waypoint LNAV flies to, an index into the route's waypoints. */
  active: number;
  /** Where the active leg starts: the previous waypoint, or where a direct-to was executed. */
  legFrom: LatLon;
  takeoffFlaps: 10 | 20;
  /** The takeoff speeds the crew accepted, shown as bugs. */
  takeoffSpeeds: { v1: number; vr: number; v2: number } | null;
  landingFlaps: 25 | 30;
  /** The landing speed the crew accepted, shown as the REF bug. */
  vref: number | null;
}

export interface FmsPending {
  route: number[];
  approach: boolean;
  /** A direct-to: the waypoint to fly straight to once executed. */
  direct: number | null;
}

export type FmsEdit =
  | { op: 'insert'; index: number; station: number }
  | { op: 'delete'; index: number }
  | { op: 'direct'; index: number }
  | { op: 'approach'; loaded: boolean }
  | { op: 'execute' }
  | { op: 'erase' }
  | { op: 'takeoffFlaps'; flaps: 10 | 20 }
  | { op: 'acceptTakeoffSpeeds' }
  | { op: 'landingFlaps'; flaps: 25 | 30 }
  | { op: 'acceptVref' };

export interface Waypoint {
  ident: string;
  position: LatLon;
  kind: 'vor' | 'approach' | 'runway';
  /** For a VOR, its index in STATIONS. */
  station: number | null;
  /** The altitude an approach fix is crossed at, feet: for the legs page and the map. */
  altitudeFt: number | null;
}

/** The approach fixes: on the final course this far out from the threshold. */
const COURSE_FIX_NM = 15;
const FINAL_FIX_NM = 6;
/** LNAV turns onto the next leg this far before the waypoint. */
const TURN_ANTICIPATION_NM = 1.5;
/** The ILS is tuned automatically inside this distance once an approach is loaded. */
const AUTOTUNE_NM = 50;
/** Degrees of intercept for every nautical mile off the leg, up to a 45° intercept. */
const INTERCEPT_PER_NM = 15;
const MAX_INTERCEPT = 45;

export function startFms(route: number[], from: LatLon): FmsState {
  return {
    route: [...route],
    approach: true,
    pending: null,
    active: 0,
    legFrom: from,
    takeoffFlaps: 10,
    takeoffSpeeds: null,
    landingFlaps: 30,
    vref: null,
  };
}

/** The route as the map and LNAV see it: the stations, then the approach to the runway. */
export function routeWaypoints(
  route: readonly number[],
  approach: boolean,
  world: FlightWorld,
): Waypoint[] {
  const waypoints: Waypoint[] = route.flatMap((index) => {
    const station = STATIONS[index];
    return station
      ? [
          {
            ident: station.ident,
            position: station.position,
            kind: 'vor' as const,
            station: index,
            altitudeFt: null,
          },
        ]
      : [];
  });
  if (!approach) return waypoints;
  const strip = world.ils.runway;
  const fieldFt = strip.elevationFt;
  const fix = (prefix: string, outNm: number, altitudeFt: number): Waypoint => ({
    ident: `${prefix}${strip.ident}`,
    position: runwayPoint(strip, -outNm * FEET_PER_NM, 0),
    kind: 'approach',
    station: null,
    altitudeFt,
  });
  return [
    ...waypoints,
    fix('CF', COURSE_FIX_NM, Math.round((fieldFt + 4500) / 100) * 100),
    fix('FF', FINAL_FIX_NM, Math.round((fieldFt + 1900) / 100) * 100),
    { ...fix('RW', 0, fieldFt), kind: 'runway' },
  ];
}

/**
 * A flight that starts near the field, on an approach or a lesson's final,
 * has already passed the approach fixes behind it: LNAV starts at the first
 * one still ahead along the final.
 */
export function skipPassedFixes(fms: FmsState, world: FlightWorld, position: LatLon) {
  const strip = world.ils.runway;
  const here = onRunway(strip, position).along;
  const waypoints = activeWaypoints(fms, world);
  const ahead = waypoints.findIndex(
    (waypoint) =>
      waypoint.kind === 'vor' || onRunway(strip, waypoint.position).along > here + FEET_PER_NM,
  );
  if (ahead > 0) fms.active = ahead;
}

export const activeWaypoints = (fms: FmsState, world: FlightWorld) =>
  routeWaypoints(fms.route, fms.approach, world);

/** What the CDU shows: the edit waiting for EXEC, or the active route. */
export function shownRoute(fms: FmsState): { route: number[]; approach: boolean } {
  return fms.pending ?? { route: fms.route, approach: fms.approach };
}

/** Applies one of the CDU's edits. Route changes collect in a modification until executed. */
export function editFms(fms: FmsState, edit: FmsEdit, position: LatLon, weightLb: number) {
  const modify = (change: (pending: FmsPending) => void) => {
    const pending = fms.pending ?? { route: [...fms.route], approach: fms.approach, direct: null };
    change(pending);
    fms.pending = pending;
  };
  switch (edit.op) {
    case 'insert':
      if (!STATIONS[edit.station]) return;
      modify((pending) => {
        const index = clamp(edit.index, 0, pending.route.length);
        if (pending.route[index - 1] === edit.station || pending.route[index] === edit.station)
          return;
        pending.route.splice(index, 0, edit.station);
      });
      return;
    case 'delete':
      modify((pending) => {
        if (edit.index >= 0 && edit.index < pending.route.length)
          pending.route.splice(edit.index, 1);
      });
      return;
    case 'direct':
      modify((pending) => {
        pending.direct = edit.index;
      });
      return;
    case 'approach':
      modify((pending) => {
        pending.approach = edit.loaded;
      });
      return;
    case 'execute':
      execute(fms, position);
      return;
    case 'erase':
      fms.pending = null;
      return;
    case 'takeoffFlaps':
      fms.takeoffFlaps = edit.flaps;
      fms.takeoffSpeeds = null;
      return;
    case 'acceptTakeoffSpeeds': {
      const { v1, vr, v2 } = referenceSpeeds(weightLb, fms.takeoffFlaps);
      fms.takeoffSpeeds = { v1, vr, v2 };
      return;
    }
    case 'landingFlaps':
      fms.landingFlaps = edit.flaps;
      fms.vref = null;
      return;
    case 'acceptVref':
      fms.vref = referenceSpeeds(weightLb, 10, fms.landingFlaps).vref;
      return;
  }
}

/** EXEC: the modification becomes the route; LNAV keeps flying to the same waypoint if it is still there. */
function execute(fms: FmsState, position: LatLon) {
  const pending = fms.pending;
  if (!pending) return;
  const oldStation = fms.route[fms.active];
  fms.route = pending.route;
  fms.approach = pending.approach;
  fms.pending = null;
  if (pending.direct !== null) {
    fms.active = pending.direct;
    fms.legFrom = position;
    return;
  }
  const kept = oldStation === undefined ? -1 : fms.route.indexOf(oldStation);
  if (kept >= 0) fms.active = kept;
}

export interface LnavGuidance {
  waypoint: Waypoint;
  /** The track to fly now, true: the leg's course plus an intercept back onto it. */
  desiredTrack: number;
  /** The leg's own course here, true. */
  legCourse: number;
  /** Nautical miles right (+) or left (−) of the leg. */
  crossTrackNm: number;
  toGoNm: number;
}

/**
 * Lateral guidance along the great circle from the leg's start to the
 * active waypoint. Off the leg, the intercept grows with the distance off,
 * up to 45°, so the aircraft joins the leg instead of chasing the waypoint.
 */
export function lnavGuidance(
  fms: FmsState,
  waypoints: readonly Waypoint[],
  position: LatLon,
): LnavGuidance | null {
  const waypoint = waypoints[fms.active];
  if (!waypoint) return null;
  const toGoNm = distanceNm(position, waypoint.position);
  const legLength = distanceNm(fms.legFrom, waypoint.position);
  if (legLength < 0.1) {
    const track = bearingTrue(position, waypoint.position);
    return { waypoint, desiredTrack: track, legCourse: track, crossTrackNm: 0, toGoNm };
  }
  const startCourse = bearingTrue(fms.legFrom, waypoint.position);
  const fromStart = distanceNm(fms.legFrom, position);
  const offAngle = bearingTrue(fms.legFrom, position) - startCourse;
  const angularFromStart = fromStart / EARTH_RADIUS_NM;
  const crossTrack = asin(sinCos(angularFromStart).sin * sinCosDegrees(offAngle).sin);
  const crossTrackNm = crossTrack * EARTH_RADIUS_NM;
  const cosCross = sinCos(crossTrack).cos;
  const alongNm =
    acos(clamp(sinCos(angularFromStart).cos / (cosCross > 1e-9 ? cosCross : 1e-9), -1, 1)) *
    EARTH_RADIUS_NM;
  const abeam = destination(fms.legFrom, startCourse, Math.min(alongNm, legLength));
  const legCourse = bearingTrue(abeam, waypoint.position);
  const intercept = clamp(-crossTrackNm * INTERCEPT_PER_NM, -MAX_INTERCEPT, MAX_INTERCEPT);
  return {
    waypoint,
    desiredTrack: normaliseDegrees(legCourse + intercept),
    legCourse,
    crossTrackNm,
    toGoNm,
  };
}

/**
 * Each step on the glass deck: the next leg once the waypoint is reached or
 * passed, and the ILS tuned on NAV 1 as the destination comes within reach.
 */
export function stepFms(fms: FmsState, world: FlightWorld, position: LatLon, panel: Panel) {
  const waypoints = activeWaypoints(fms, world);
  const guidance = lnavGuidance(fms, waypoints, position);
  if (guidance && fms.active < waypoints.length - 1) {
    const passed =
      Math.abs(
        angleDifference(bearingTrue(position, guidance.waypoint.position), guidance.legCourse),
      ) > 90;
    if (guidance.toGoNm < TURN_ANTICIPATION_NM || (passed && guidance.toGoNm < 10)) {
      fms.legFrom = guidance.waypoint.position;
      fms.active++;
    }
  }
  if (!fms.approach) return;
  const strip = world.ils.runway;
  const localizer = world.destination.localizer;
  if (
    distanceNm(position, strip.threshold) < AUTOTUNE_NM &&
    Math.abs(panel.nav[0].frequency - localizer) > 0.005
  ) {
    panel.nav[0] = {
      frequency: localizer,
      course: Math.round(toMagnetic(strip.headingTrue, variationAt(strip.threshold))),
    };
  }
}
