import {
  flapAero,
  FLAP_DETENTS,
  GEAR_LIMIT_KT,
  JUMBO,
  stallSpeedKt,
  type TankId,
} from '../../engine/aircraft';
import { airAt, casFromTas, indicatedAltitude } from '../../engine/atmosphere';
import { normaliseDegrees } from '../../engine/exact-math';
import { referenceSpeedNow } from '../../engine/finish';
import type { Flight } from '../../engine/flight';
import { activeWaypoints, lnavGuidance, shownRoute, routeWaypoints } from '../../engine/fms';
import { bearingTrue, distanceNm, type LatLon } from '../../engine/geo';
import { toMagnetic, variationAt } from '../../engine/magnetic';
import { STATIONS } from '../../engine/navdata';
import { flapLeverDegrees } from '../../engine/panel';
import { nearestField, windAt } from '../../engine/weather';

/**
 * What the glass deck's six screens show, worked out once a frame from the
 * flight and the crew's display choices: the primary flight display's
 * tapes, bugs and flight mode annunciations, the navigation display's map,
 * the engine indication and crew alerting system's dials, messages and
 * pages. The drawing code only reads this.
 */
export type NdMode = 'map' | 'vor' | 'app';
export type LowerPage = 'eng' | 'fuel' | 'gear' | 'fctl';
export const ND_RANGES = [10, 20, 40, 80, 160, 320, 640] as const;

/** The crew's choices on the EFIS control panels and the display select panel. */
export interface GlassDisplays {
  ndRange: (typeof ND_RANGES)[number];
  ndMode: NdMode;
  lowerPage: LowerPage;
  /** Radio minimums, feet. */
  minimums: number;
}

export const defaultDisplays = (): GlassDisplays => ({
  ndRange: 40,
  ndMode: 'map',
  lowerPage: 'eng',
  minimums: 200,
});

export interface SpeedBug {
  label: string;
  kt: number;
}

export interface Fma {
  thrust: string;
  roll: string;
  pitch: string;
  armedRoll: string;
  armedPitch: string;
  /** CMD with the autopilot in, FD with only the flight director, or nothing. */
  status: string;
}

export interface PfdData {
  pitch: number;
  bank: number;
  slip: number;
  director: { pitch: number; bank: number } | null;
  ias: number;
  /** Where the speed will be in ten seconds at this rate. */
  trendKt: number;
  mach: number;
  selectedSpeed: number;
  bugs: SpeedBug[];
  /** The top of the barber pole: the fastest the jumbo may go now. */
  maxSpeed: number;
  /** The top of the amber band, and of the red one: manoeuvre margin and the stall. */
  minManoeuvre: number;
  stall: number;
  noVSpeeds: boolean;
  altitude: number;
  selectedAltitude: number;
  baroInHg: number;
  verticalSpeed: number;
  heading: number;
  track: number;
  selectedHeading: number;
  localizerDots: number | null;
  glideslopeDots: number | null;
  ils: { ident: string; course: number; dme: number | null } | null;
  radioAltitude: number | null;
  minimums: number;
  fma: Fma;
  marker: 'outer' | 'middle' | null;
  onGround: boolean;
}

export interface MapPoint {
  ident: string;
  /** Nautical miles east and north of the aircraft. */
  east: number;
  north: number;
}

export interface NdData {
  mode: NdMode;
  range: number;
  heading: number;
  track: number;
  selectedHeading: number;
  groundSpeed: number;
  tas: number;
  wind: { from: number; kt: number };
  /** Magnetic variation here: the map is drawn true, the card magnetic. */
  variation: number;
  route: (MapPoint & { active: boolean; approach: boolean; altitudeFt: number | null })[];
  /** Where the active leg starts. */
  legFrom: MapPoint | null;
  /** The edit waiting for EXEC, drawn dashed. */
  pending: MapPoint[] | null;
  active: { ident: string; distanceNm: number; etaSeconds: number } | null;
  stations: MapPoint[];
  runway: (MapPoint & { headingTrue: number; lengthNm: number }) | null;
  vor: {
    ident: string;
    course: number;
    deviationDots: number;
    toFrom: string;
    dme: number | null;
  } | null;
  ils: {
    ident: string;
    course: number;
    localizerDots: number | null;
    glideslopeDots: number | null;
    dme: number | null;
  } | null;
  crossTrackNm: number | null;
}

export interface EngineData {
  epr: number;
  n1: number;
  egt: number;
  n2: number;
  fuelFlow: number;
  reverser: number;
  running: boolean;
}

export interface EicasMessage {
  text: string;
  level: 'warning' | 'caution' | 'advisory' | 'memo';
}

export interface EicasData {
  engines: EngineData[];
  eprReference: number;
  thrustReference: string;
  tatC: number;
  gear: { position: number; leverDown: boolean };
  flapsDeg: number;
  flapLeverDeg: number;
  messages: EicasMessage[];
  fuel: Record<TankId, number>;
  totalFuelLb: number;
  grossWeightLb: number;
  crossfeed: boolean;
  /** −1 … 1 surface deflections for the flight controls page; spoilers 0 … 1. */
  controls: {
    aileron: number;
    elevator: number;
    rudder: number;
    spoilers: number;
    stabiliser: number;
  };
  brakeTempC: number;
  parkingBrake: boolean;
}

export interface GlassModel {
  flight: Flight;
  displays: GlassDisplays;
  pfd: PfdData;
  nd: NdData;
  eicas: EicasData;
  clockSeconds: number;
  masterWarning: boolean;
  masterCaution: boolean;
}

/** Flap manoeuvring speeds above Vref: UP, 1, 5, 10 and 20, as the -400's card has them. */
const FLAP_MARGINS: [string, number][] = [
  ['UP', 80],
  ['1', 60],
  ['5', 40],
  ['10', 30],
  ['20', 20],
];

function fmaOf(flight: Flight): Fma {
  const afds = flight.afds;
  const panel = flight.panel;
  const idle = Math.max(...panel.levers) < 0.02;
  const thrust = !afds.autothrottle
    ? ''
    : afds.thrustMode === 'climb'
      ? 'THR REF'
      : afds.thrustMode === 'idle'
        ? idle
          ? 'HOLD'
          : 'IDLE'
        : 'SPD';
  const goAround = flight.approach.goingAround && afds.pitchMode === 'takeoff';
  const roll = goAround
    ? 'TO/GA'
    : afds.pitchMode === 'takeoff' && flight.readout.onGround
      ? 'TO/GA'
      : {
          wings: afds.autopilot ? 'ATT' : '',
          heading: 'HDG SEL',
          navigation: 'VOR',
          localizer: 'LOC',
          route: 'LNAV',
        }[afds.rollMode];
  const pitch = {
    attitude: '',
    speed: 'FLCH SPD',
    altitudeHold: 'ALT',
    altitudeCapture: 'ALT',
    verticalSpeed: 'V/S',
    glideslope: 'G/S',
    takeoff: 'TO/GA',
  }[afds.pitchMode];
  const navTuned = flight.nav[0].kind === 'vor' ? 'VOR' : 'LOC';
  return {
    thrust,
    roll,
    pitch,
    armedRoll: afds.armedRoute ? 'LNAV' : afds.armedNavigation ? navTuned : '',
    armedPitch: afds.armedGlideslope ? 'G/S' : '',
    status: afds.autopilot ? 'CMD' : afds.flightDirector ? 'FD' : '',
  };
}

function speedsOf(flight: Flight) {
  const r = flight.readout;
  const flapsDeg = r.flapsDeg;
  const air = airAt(r.altitudeFt);
  const mmoSpeed = casFromTas(JUMBO.mmo * air.soundKt, air);
  const flapLimit = flapsDeg > 0.5 ? flapAero(flapsDeg).limitKt : Infinity;
  const gearLimit = r.gear > 0.01 ? GEAR_LIMIT_KT : Infinity;
  const maxSpeed = Math.min(JUMBO.vmoKt, mmoSpeed, flapLimit, gearLimit);
  const stall = stallSpeedKt(r.weightLb, flapsDeg) * Math.sqrt(Math.max(1, r.loadFactor));
  return { maxSpeed, stall, minManoeuvre: stall * 1.3 };
}

/** Polar to east and north, nautical miles. */
function relative(from: LatLon, to: LatLon, ident: string): MapPoint {
  const distance = distanceNm(from, to);
  const bearing = (bearingTrue(from, to) * Math.PI) / 180;
  return { ident, east: distance * Math.sin(bearing), north: distance * Math.cos(bearing) };
}

function pfdOf(flight: Flight, displays: GlassDisplays): PfdData {
  const r = flight.readout;
  const panel = flight.panel;
  const afds = flight.afds;
  const fms = flight.fms;
  const variation = variationAt(r.position);
  const field = nearestField(flight.world.weather, r.position);
  const nav = flight.nav[0];
  const onTheWayOut = flight.touchdown === null && !flight.approach.active;
  const bugs: SpeedBug[] = [];
  if (onTheWayOut && r.onGround && fms?.takeoffSpeeds) {
    bugs.push(
      { label: 'V1', kt: fms.takeoffSpeeds.v1 },
      { label: 'VR', kt: fms.takeoffSpeeds.vr },
      { label: 'V2', kt: fms.takeoffSpeeds.v2 },
    );
  }
  const vref = fms?.vref ?? null;
  if (!r.onGround) {
    const reference = vref ?? referenceSpeedNow(flight);
    const fitting = FLAP_DETENTS.findIndex((detent) => detent.degrees >= r.flapsDeg - 0.5);
    for (const [label, margin] of FLAP_MARGINS) {
      // Only the manoeuvring speeds of the settings around the flaps now.
      const index = FLAP_DETENTS.findIndex((detent) => detent.label === label);
      if (Math.abs(index - fitting) <= 1) bugs.push({ label, kt: reference + margin });
    }
  }
  if (vref !== null) bugs.push({ label: 'REF', kt: vref });
  return {
    pitch: r.pitchDeg,
    bank: r.bankDeg,
    slip: r.slipDeg,
    director: flight.director,
    ias: r.iasKt,
    trendKt: r.onGround ? 0 : afds.iasTrend * 10,
    mach: r.mach,
    selectedSpeed: afds.speedKt,
    bugs,
    ...speedsOf(flight),
    noVSpeeds: r.onGround && onTheWayOut && !fms?.takeoffSpeeds,
    altitude: indicatedAltitude(r.altitudeFt, field?.qnh ?? 29.92, panel.altimeterInHg),
    selectedAltitude: afds.altitude,
    baroInHg: panel.altimeterInHg,
    verticalSpeed: r.verticalSpeedFpm,
    heading: toMagnetic(r.headingTrue, variation),
    track: toMagnetic(r.trackTrue, variation),
    selectedHeading: panel.headingBug,
    localizerDots: nav.kind === 'localizer' ? -nav.deviation / (nav.fullScale / 2) : null,
    glideslopeDots: nav.glideslope === null ? null : nav.glideslope / 0.35,
    ils:
      nav.kind === 'localizer'
        ? { ident: nav.ident, course: panel.nav[0].course, dme: nav.dmeNm }
        : null,
    radioAltitude: flight.radioAltitudeFt,
    minimums: displays.minimums,
    fma: fmaOf(flight),
    marker: flight.marker,
    onGround: r.onGround,
  };
}

function ndOf(flight: Flight, displays: GlassDisplays): NdData {
  const r = flight.readout;
  const here = r.position;
  const variation = variationAt(here);
  const fms = flight.fms;
  const wind = windAt(flight.world.weather, here, r.altitudeFt);
  const waypoints = fms ? activeWaypoints(fms, flight.world) : [];
  const guidance = fms ? lnavGuidance(fms, waypoints, here) : null;
  const reach = displays.ndRange * 1.6;
  const route = waypoints.flatMap((waypoint, index) =>
    fms && index >= fms.active
      ? [
          {
            ...relative(here, waypoint.position, waypoint.ident),
            active: index === fms.active,
            approach: waypoint.kind !== 'vor',
            altitudeFt: waypoint.altitudeFt,
          },
        ]
      : [],
  );
  const shown = fms?.pending ? shownRoute(fms) : null;
  const strip = flight.world.ils.runway;
  const nav = flight.nav[0];
  return {
    mode: displays.ndMode,
    range: displays.ndRange,
    heading: toMagnetic(r.headingTrue, variation),
    track: toMagnetic(r.trackTrue, variation),
    selectedHeading: flight.panel.headingBug,
    groundSpeed: r.groundSpeedKt,
    tas: r.tasKt,
    wind: { from: normaliseDegrees(toMagnetic(wind.direction, variation)), kt: wind.speedKt },
    variation,
    route,
    legFrom: fms ? relative(here, fms.legFrom, '') : null,
    pending:
      shown && fms
        ? routeWaypoints(shown.route, shown.approach, flight.world).map((waypoint) =>
            relative(here, waypoint.position, waypoint.ident),
          )
        : null,
    active:
      guidance && fms
        ? {
            ident: guidance.waypoint.ident,
            distanceNm: guidance.toGoNm,
            etaSeconds:
              flight.clockStart +
              flight.time +
              (r.groundSpeedKt > 30 ? (guidance.toGoNm / r.groundSpeedKt) * 3600 : 0),
          }
        : null,
    stations: STATIONS.filter((station) => distanceNm(here, station.position) < reach).map(
      (station) => relative(here, station.position, station.ident),
    ),
    runway:
      distanceNm(here, strip.threshold) < reach
        ? {
            ...relative(here, strip.threshold, `${strip.airport}`),
            headingTrue: strip.headingTrue,
            lengthNm: strip.landingLengthFt / 6076.12,
          }
        : null,
    vor:
      nav.kind === 'vor'
        ? {
            ident: nav.ident,
            course: flight.panel.nav[0].course,
            deviationDots: nav.deviation / (nav.fullScale / 2),
            toFrom: nav.toFrom.toUpperCase(),
            dme: nav.dmeNm,
          }
        : null,
    ils:
      nav.kind === 'localizer'
        ? {
            ident: nav.ident,
            course: flight.panel.nav[0].course,
            localizerDots: nav.deviation / (nav.fullScale / 2),
            glideslopeDots: nav.glideslope === null ? null : nav.glideslope / 0.35,
            dme: nav.dmeNm,
          }
        : null,
    crossTrackNm: guidance?.crossTrackNm ?? null,
  };
}

function messagesOf(flight: Flight): EicasMessage[] {
  const w = flight.warnings;
  const panel = flight.panel;
  const r = flight.readout;
  const messages: EicasMessage[] = [];
  const add = (condition: boolean, text: string, level: EicasMessage['level']) => {
    if (condition) messages.push({ text, level });
  };
  add(w.takeoffConfig && flapLeverDegrees(panel) < 10, 'CONFIG FLAPS', 'warning');
  add(w.takeoffConfig && panel.parkingBrake, 'CONFIG PARK BRK', 'warning');
  add(
    w.takeoffConfig && panel.speedbrake !== 'down' && panel.speedbrake !== 'armed',
    'CONFIG SPOILERS',
    'warning',
  );
  add(w.gearHorn, 'CONFIG GEAR', 'warning');
  add(w.overspeed, 'OVERSPEED', 'warning');
  add(w.lowFuel, 'FUEL QTY LOW', 'caution');
  add(
    !flight.afds.autopilot && !r.onGround && flight.afds.flightDirector === false,
    'NO FLIGHT DIRECTOR',
    'advisory',
  );
  add(
    !r.onGround && r.speedbrake > 0.05 && Math.max(...panel.levers) > 0.3,
    'SPEEDBRAKE EXT',
    'advisory',
  );
  add(
    r.engines.some((engine) => !engine.running),
    'ENG FLAMEOUT',
    'caution',
  );
  add(panel.parkingBrake, 'PARKING BRAKE SET', 'memo');
  add(panel.speedbrake === 'armed', 'SPEEDBRAKE ARMED', 'memo');
  add(panel.crossfeed, 'FUEL BALANCE', 'memo');
  add(!panel.landingLights && !r.onGround && r.heightFt < 10_000, 'LANDING LIGHTS OFF', 'memo');
  return messages;
}

function eicasOf(flight: Flight): EicasData {
  const r = flight.readout;
  const panel = flight.panel;
  const airframe = flight.airframe;
  const field = nearestField(flight.world.weather, r.position);
  // Total air temperature: the outside air, warmed by the speed.
  const outside = airAt(r.altitudeFt, flight.world.weather.temperatureOffset).temperature - 273.15;
  const tat = outside + (r.tasKt * r.tasKt) / 7592;
  const climbing = !r.onGround && r.verticalSpeedFpm > 300;
  const thrustReference = r.onGround
    ? 'TO'
    : flight.approach.goingAround
      ? 'GA'
      : climbing
        ? 'CLB'
        : 'CRZ';
  const controls = flight.controls;
  return {
    engines: r.engines.map((engine) => ({
      epr: engine.epr,
      n1: engine.n1,
      egt: engine.egt,
      n2: engine.n2,
      fuelFlow: engine.fuelFlow,
      reverser: engine.reverser,
      running: engine.running,
    })),
    eprReference: r.onGround ? 1.52 : r.altitudeFt > 20_000 ? 1.4 : 1.48,
    thrustReference,
    tatC: r.heightFt < 2000 && field ? field.temperatureC + (r.tasKt * r.tasKt) / 7592 : tat,
    gear: { position: r.gear, leverDown: panel.gearDown },
    flapsDeg: r.flapsDeg,
    flapLeverDeg: flapLeverDegrees(panel),
    messages: messagesOf(flight),
    fuel: r.fuel,
    totalFuelLb: r.fuelLb,
    grossWeightLb: r.weightLb,
    crossfeed: panel.crossfeed,
    controls: {
      aileron: Math.max(-1, Math.min(1, controls.aileron + (airframe?.rollRate ?? 0) / 12)),
      elevator: Math.max(-1, Math.min(1, controls.elevator + (airframe?.pitchRate ?? 0) / 4)),
      rudder: controls.rudder,
      spoilers: r.speedbrake,
      stabiliser: airframe ? airframe.trimAlphaDeg : 0,
    },
    brakeTempC: field ? field.temperatureC + (flight.touchdown ? 120 : 0) : 5,
    parkingBrake: panel.parkingBrake,
  };
}

export function glassModel(flight: Flight, displays: GlassDisplays): GlassModel {
  const eicas = eicasOf(flight);
  const w = flight.warnings;
  return {
    flight,
    displays,
    pfd: pfdOf(flight, displays),
    nd: ndOf(flight, displays),
    eicas,
    clockSeconds: flight.clockStart + flight.time,
    masterWarning:
      eicas.messages.some((message) => message.level === 'warning') ||
      w.stall ||
      w.gpws === 'pullUp',
    masterCaution: eicas.messages.some((message) => message.level === 'caution'),
  };
}
