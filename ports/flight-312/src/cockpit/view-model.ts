import { JUMBO, referenceSpeeds } from '../engine/aircraft';
import { airAt, casFromTas, indicatedAltitude } from '../engine/atmosphere';
import { normaliseDegrees } from '../engine/exact-math';
import { referenceSpeedNow } from '../engine/finish';
import type { Flight } from '../engine/flight';
import { toMagnetic, variationAt } from '../engine/magnetic';
import { STATIONS } from '../engine/navdata';
import { flapLeverDegrees } from '../engine/panel';
import type { NavReading } from '../engine/radios';
import { nearestField, windAt } from '../engine/weather';
import type { AdiData, AirspeedData, HsiData } from './flight-instruments';

/**
 * What the instruments show, worked out once a frame from the flight:
 * magnetic headings, the altimeters with their settings, the deviation
 * dots, the bugs the engineer sets, the master lights. The drawing code
 * only reads this; it never computes flight numbers of its own.
 */
export interface CockpitModel {
  flight: Flight;
  headingMagnetic: number;
  trackMagnetic: number;
  altimeterFt: number;
  adi: AdiData;
  hsi: [HsiData, HsiData];
  airspeed: AirspeedData;
  rmiBearings: (number | null)[];
  radioAltitudeFt: number | null;
  clockSeconds: number;
  flapLeverDeg: number;
  masterWarning: boolean;
  masterCaution: boolean;
  /** The 1982 rules have no autopilot: the glareshield's panel is dark. */
  autopilotAvailable: boolean;
  ins: {
    lat: number;
    lon: number;
    groundSpeedKt: number;
    trackTrue: number;
    windFrom: number;
    windKt: number;
  };
  eprReference: number;
}

const dotsOf = (nav: NavReading): number | null =>
  nav.kind === 'none' ? null : nav.deviation / (nav.fullScale / 2);

function hsiFor(
  nav: NavReading,
  course: number,
  heading: number,
  headingBug: number,
  track: number,
): HsiData {
  return {
    heading,
    headingBug,
    course,
    deviationDots: dotsOf(nav),
    toFrom: nav.toFrom,
    glideslopeDots: nav.glideslope === null ? null : nav.glideslope / 0.35,
    dmeNm: nav.dmeNm,
    track,
  };
}

export function cockpitModel(flight: Flight): CockpitModel {
  const r = flight.readout;
  const variation = variationAt(r.position);
  const headingMagnetic = toMagnetic(r.headingTrue, variation);
  const trackMagnetic = toMagnetic(r.trackTrue, variation);
  const program = flight.rules === 'program';
  // The 1982 program flew true headings; its instruments read them.
  const heading = program ? r.headingTrue : headingMagnetic;
  const track = program ? r.trackTrue : trackMagnetic;
  const field = nearestField(flight.world.weather, r.position);
  const panel = flight.panel;
  const altimeterFt = indicatedAltitude(r.altitudeFt, field?.qnh ?? 29.92, panel.altimeterInHg);
  const [nav1, nav2] = flight.nav;
  const vmo = Math.min(
    JUMBO.vmoKt,
    casFromTas(JUMBO.mmo * airAt(r.altitudeFt).soundKt, airAt(r.altitudeFt)),
  );
  const takeoff = referenceSpeeds(r.weightLb, Math.max(10, flapLeverDegrees(panel)));
  const onTheWayOut = flight.touchdown === null && !flight.approach.active;
  const warnings = flight.warnings;
  const bearing = (nav: NavReading) => (nav.kind === 'vor' ? nav.bearingTo : null);
  const wind = windAt(flight.world.weather, r.position, r.altitudeFt);
  const reference = r.onGround && onTheWayOut ? 1.52 : r.altitudeFt > 20_000 ? 1.4 : 1.48;
  return {
    flight,
    headingMagnetic,
    trackMagnetic,
    altimeterFt,
    adi: {
      pitch: r.pitchDeg,
      bank: r.bankDeg,
      director: flight.director,
      glideslopeDots: nav1.glideslope === null ? null : nav1.glideslope / 0.35,
      localizerDots: nav1.kind === 'localizer' ? -(dotsOf(nav1) ?? 0) : null,
      speedError: r.iasKt - panel.speedBugKt,
      slip: r.slipDeg,
      radioAltitudeFt: flight.radioAltitudeFt,
    },
    hsi: [
      hsiFor(nav1, panel.nav[0].course, heading, panel.headingBug, track),
      hsiFor(nav2, panel.nav[1].course, heading, panel.headingBug, track),
    ],
    airspeed: {
      ias: r.iasKt,
      mach: r.mach,
      vmo,
      bug: panel.speedBugKt,
      referenceBugs: onTheWayOut
        ? [takeoff.v1, takeoff.vr, takeoff.v2]
        : [referenceSpeedNow(flight)],
    },
    rmiBearings: [bearing(nav1), bearing(nav2)],
    radioAltitudeFt: flight.radioAltitudeFt,
    clockSeconds: flight.clockStart + flight.time,
    flapLeverDeg: flapLeverDegrees(panel),
    masterWarning:
      warnings.stall ||
      warnings.overspeed ||
      warnings.gpws === 'pullUp' ||
      warnings.gpws === 'terrain' ||
      warnings.takeoffConfig,
    masterCaution: warnings.gearHorn || warnings.lowFuel || warnings.gpws !== null,
    autopilotAvailable: !program,
    ins: {
      lat: r.position.lat,
      lon: r.position.lon,
      groundSpeedKt: r.groundSpeedKt,
      trackTrue: normaliseDegrees(r.trackTrue),
      windFrom: normaliseDegrees(wind.direction),
      windKt: wind.speedKt,
    },
    eprReference: reference,
  };
}

/** The station a NAV radio is tuned to, for the radio heads and the chart. */
export function stationName(frequency: number): string {
  const station = STATIONS.find((candidate) => Math.abs(candidate.frequency - frequency) < 0.005);
  return station ? station.ident : '';
}
