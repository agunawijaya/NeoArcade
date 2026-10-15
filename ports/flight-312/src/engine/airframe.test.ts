import { describe, expect, it } from 'vitest';
import { startAfds, stepAfds, type AfdsState } from './afds';
import { FLAP_DETENTS, loadFuel, referenceSpeeds, stallSpeedKt } from './aircraft';
import {
  startInFlight,
  startOnRunway,
  stepAirframe,
  type AirframeControls,
  type AirframeEnvironment,
  type AirframeEvent,
  type AirframeState,
} from './airframe';
import { airAt, casFromTas } from './atmosphere';
import { clamp } from './exact-math';
import { distanceNm } from './geo';
import { runway } from './runways';
import { FEET_PER_NM } from './units';

/**
 * The jumbo against the type's public numbers (sources and tolerances in
 * docs/games/flight-312.md): field lengths and speeds at a heavy weight,
 * climb, cruise at Mach 0.84, the approach at Vref, the stall and the
 * landing roll.
 */
const DT = 1 / 30;
const still: AirframeEnvironment = {
  wind: { north: 0, east: 0, up: 0 },
  groundFt: 0,
  temperatureOffset: 0,
  qnh: 29.92,
};
const NO_NAV = {
  kind: 'none',
  ident: '',
  radial: 0,
  bearingTo: 0,
  toFrom: 'off',
  deviation: 0,
  fullScale: 10,
  dmeNm: null,
  glideslope: null,
} as const;

function controls(over: Partial<AirframeControls> = {}): AirframeControls {
  return {
    elevator: 0,
    aileron: 0,
    rudder: 0,
    levers: [0, 0, 0, 0],
    reverse: [0, 0, 0, 0],
    flapLever: 0,
    gearDown: true,
    speedbrake: 0,
    brakes: 0,
    trim: 0,
    holdAttitude: true,
    autopilot: null,
    crossfeed: false,
    ...over,
  };
}

const levers = (value: number) => [value, value, value, value];
const detent = (degrees: number) => FLAP_DETENTS.findIndex((flap) => flap.degrees === degrees);

/** Flies the airframe with the autopilot and autothrottle for a while. */
function cruiseWith(
  state: AirframeState,
  afds: AfdsState,
  seconds: number,
  over: Partial<AirframeControls> = {},
) {
  let lever = 0.7;
  for (let time = 0; time < seconds; time += DT) {
    const output = stepAfds(afds, state, NO_NAV, lever, DT);
    lever = output.lever ?? lever;
    stepAirframe(
      state,
      controls({
        levers: levers(lever),
        autopilot: { pitchRate: output.pitchRate, rollRate: output.rollRate },
        ...over,
      }),
      still,
      DT,
    );
  }
  return lever;
}

describe('the jumbo on the runway', () => {
  // A field length near 8,000 ft at this weight, less its margins and the climb to 35 ft,
  // leaves a liftoff near 5,800 ft (docs/games/flight-312.md, "Performance").
  it('lifts off at about 165 kt after 5,000–8,000 ft at 650,000 lb with flaps 10', () => {
    const strip = runway('KPHL', '09R');
    const state = startOnRunway(strip.start, 0, strip.headingTrue, loadFuel(200_000));
    state.flaps = 10;
    expect(state.weightLb).toBe(650_000);
    const { vr } = referenceSpeeds(state.weightLb, 10);
    let liftoff: { speed: number; distance: number; time: number } | null = null;
    for (let time = 0; time < 120 && !liftoff; time += DT) {
      const rotate = state.iasKt >= vr;
      const elevator = rotate ? clamp((12 - state.pitchDeg) * 0.25, -0.5, 0.6) : 0;
      const events: AirframeEvent[] = stepAirframe(
        state,
        controls({ levers: levers(1), flapLever: detent(10), elevator }),
        still,
        DT,
      );
      expect(events.some((event) => event.kind === 'tailStrike')).toBe(false);
      if (events.some((event) => event.kind === 'liftoff')) {
        liftoff = {
          speed: state.iasKt,
          distance: distanceNm(strip.start, state.position) * FEET_PER_NM,
          time,
        };
      }
    }
    expect(liftoff).not.toBeNull();
    expect(liftoff?.speed).toBeGreaterThan(155);
    expect(liftoff?.speed).toBeLessThan(185);
    expect(liftoff?.distance).toBeGreaterThan(5000);
    expect(liftoff?.distance).toBeLessThan(8000);
  });

  it('stops from 140 kt in 2,500–5,000 ft with full reverse and firm braking', () => {
    const strip = runway('KPHL', '09R');
    const state = startOnRunway(strip.start, 0, strip.headingTrue, loadFuel(60_000));
    state.flaps = 30;
    state.rollFps = 140 * 1.6878;
    state.speedbrake = 1;
    let stopped = false;
    for (let time = 0; time < 90 && !stopped; time += DT) {
      const events = stepAirframe(
        state,
        controls({
          flapLever: detent(30),
          reverse: levers(time > 2 ? 1 : 0),
          brakes: 0.8,
          speedbrake: 1,
        }),
        still,
        DT,
      );
      stopped = events.some((event) => event.kind === 'stopped');
    }
    expect(stopped).toBe(true);
    const distance = distanceNm(strip.start, state.position) * FEET_PER_NM;
    expect(distance).toBeGreaterThan(2500);
    expect(distance).toBeLessThan(5000);
  });
});

describe('the jumbo in the air', () => {
  it('climbs at 2,000–4,000 fpm at 250 kt with climb thrust, clean, at 600,000 lb', () => {
    const state = startInFlight({ lat: 40, lon: -75 }, 5000, 76, 268, loadFuel(150_000), 0, false);
    // Hold 250 kt with the pitch at climb thrust, the way a crew climbs.
    const afds = { ...startAfds(), autopilot: true, pitchMode: 'speed' as const, speedKt: 250 };
    for (let time = 0; time < 120; time += DT) {
      const output = stepAfds(afds, state, NO_NAV, 0.93, DT);
      stepAirframe(
        state,
        controls({
          levers: levers(0.93),
          gearDown: false,
          autopilot: { pitchRate: output.pitchRate, rollRate: 0 },
        }),
        still,
        DT,
      );
    }
    expect(state.iasKt).toBeGreaterThan(240);
    expect(state.iasKt).toBeLessThan(260);
    expect(state.verticalSpeedFpm).toBeGreaterThan(2000);
    expect(state.verticalSpeedFpm).toBeLessThan(4000);
  });

  it('cruises at Mach 0.84 at 35,000 ft on about 25,000 lb an hour, N1 in the high eighties', () => {
    const tas = 0.84 * airAt(35_000).soundKt;
    const state = startInFlight(
      { lat: 41, lon: -78 },
      35_000,
      60,
      tas,
      loadFuel(150_000),
      0,
      false,
    );
    const afds = {
      ...startAfds(),
      autopilot: true,
      autothrottle: true,
      pitchMode: 'altitudeHold' as const,
      rollMode: 'heading' as const,
      heading: 60,
      altitude: 35_000,
      speedKt: casFromTas(tas, airAt(35_000)),
    };
    cruiseWith(state, afds, 300, { gearDown: false });
    expect(Math.abs(state.altitudeFt - 35_000)).toBeLessThan(80);
    expect(state.mach).toBeGreaterThan(0.82);
    expect(state.mach).toBeLessThan(0.86);
    const fuelFlow = state.engines.reduce((sum, engine) => sum + engine.fuelFlow, 0);
    expect(fuelFlow).toBeGreaterThan(18_000);
    expect(fuelFlow).toBeLessThan(30_000);
    const n1 = state.engines[0]?.n1 ?? 0;
    expect(n1).toBeGreaterThan(80);
    expect(n1).toBeLessThan(95);
  });

  it('flies a three-degree descent at Vref with flaps 30 and gear down on part power', () => {
    const fuel = loadFuel(40_000);
    const weight = 380_000 + 70_000 + 40_000;
    const vref = referenceSpeeds(weight, 10).vref;
    const state = startInFlight({ lat: 40.5, lon: -73.9 }, 2000, 31, vref + 5, fuel, 30, true);
    const afds = {
      ...startAfds(),
      autopilot: true,
      autothrottle: true,
      pitchMode: 'verticalSpeed' as const,
      verticalSpeed: -750,
      altitude: -10_000,
      speedKt: vref + 5,
    };
    const lever = cruiseWith(state, afds, 60, { flapLever: detent(30) });
    expect(Math.abs(state.verticalSpeedFpm + 750)).toBeLessThan(120);
    expect(Math.abs(state.iasKt - (vref + 5))).toBeLessThan(6);
    expect(lever).toBeGreaterThan(0.25);
    expect(lever).toBeLessThan(0.8);
    expect(state.alphaDeg).toBeLessThan(8);
  });

  it('stalls close to the speed its wing predicts', () => {
    const state = startInFlight(
      { lat: 41, lon: -77 },
      10_000,
      90,
      230,
      loadFuel(100_000),
      0,
      false,
    );
    const afds = {
      ...startAfds(),
      autopilot: true,
      pitchMode: 'altitudeHold' as const,
      altitude: 10_000,
    };
    let stalledAt = 0;
    for (let time = 0; time < 240 && !stalledAt; time += DT) {
      const output = stepAfds(afds, state, NO_NAV, 0, DT);
      stepAirframe(
        state,
        controls({ gearDown: false, autopilot: { pitchRate: output.pitchRate, rollRate: 0 } }),
        still,
        DT,
      );
      if (state.alphaDeg > 11.7) stalledAt = state.iasKt;
    }
    const predicted = stallSpeedKt(state.weightLb, 0);
    expect(stalledAt).toBeGreaterThan(predicted * 0.93);
    expect(stalledAt).toBeLessThan(predicted * 1.1);
  });
});
