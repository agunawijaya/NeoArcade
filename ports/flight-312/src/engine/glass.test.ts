import { beforeAll, describe, expect, it } from 'vitest';
import { loadTerrainSource } from '../data/unpack';
import { startAfds, stepAfds } from './afds';
import { loadFuel } from './aircraft';
import { startInFlight, stepAirframe } from './airframe';
import { applyCommand } from './crew';
import { createFlight, NO_INPUT, stepFlight, type Flight, type FlightSetup } from './flight';
import {
  activeWaypoints,
  editFms,
  lnavGuidance,
  routeWaypoints,
  shownRoute,
  stepFms,
  type FmsState,
} from './fms';
import { bearingTrue, destination, distanceNm } from './geo';
import { STATIONS } from './navdata';
import { NO_READING } from './radios';
import { createTerrain, type Terrain } from './terrain';
import { flyWithTestPilot } from './test-pilot';

/**
 * The glass deck's engine: the flight management's route and its edits,
 * LNAV's guidance and leg changes, the ILS tuned as the field comes near,
 * flight level change, and whole flights flown on LNAV.
 */
let terrain: Terrain;

beforeAll(async () => {
  terrain = createTerrain(await loadTerrainSource());
});

const station = (ident: string) => STATIONS.findIndex((one) => one.ident === ident);
const glass = (over: Partial<FlightSetup> = {}): FlightSetup => ({
  mode: 'flight',
  level: 'pilot',
  destination: 'bos',
  seed: 312,
  deck: 'glass',
  ...over,
});

describe('the flight management', () => {
  it('starts with the briefing’s route and the destination’s approach loaded', () => {
    const flight = createFlight(glass(), terrain);
    const fms = flight.fms as FmsState;
    expect(fms.route).toEqual(flight.plan.legs.map((leg) => leg.station.index));
    const idents = activeWaypoints(fms, flight.world).map((waypoint) => waypoint.ident);
    expect(idents.slice(-3)).toEqual(['CF04R', 'FF04R', 'RW04R']);
  });

  it('is only on the glass deck, and never under the 1982 Rules', () => {
    expect(createFlight(glass({ deck: 'classic' }), terrain).fms).toBeNull();
    const program = createFlight(glass({ level: 'rules1982' }), terrain);
    expect(program.deck).toBe('classic');
    expect(program.fms).toBeNull();
  });

  it('collects edits as a modification until they are executed', () => {
    const flight = createFlight(glass(), terrain);
    const fms = flight.fms as FmsState;
    const before = [...fms.route];
    const edit = (value: Parameters<typeof editFms>[1]) =>
      editFms(fms, value, flight.readout.position, flight.readout.weightLb);
    edit({ op: 'insert', index: 0, station: station('OOD') });
    expect(fms.route).toEqual(before);
    expect(shownRoute(fms).route[0]).toBe(station('OOD'));
    edit({ op: 'erase' });
    expect(fms.pending).toBeNull();
    edit({ op: 'insert', index: 0, station: station('OOD') });
    edit({ op: 'delete', index: 1 });
    edit({ op: 'execute' });
    expect(fms.route[0]).toBe(station('OOD'));
    expect(fms.route).toHaveLength(before.length);
    expect(fms.pending).toBeNull();
  });

  it('works out the takeoff and approach speeds from the weight, as accepted', () => {
    const flight = createFlight(glass(), terrain);
    const fms = flight.fms as FmsState;
    editFms(fms, { op: 'takeoffFlaps', flaps: 20 }, flight.readout.position, 600_000);
    editFms(fms, { op: 'acceptTakeoffSpeeds' }, flight.readout.position, 600_000);
    editFms(fms, { op: 'acceptVref' }, flight.readout.position, 600_000);
    const { v1, vr, v2 } = fms.takeoffSpeeds ?? { v1: 0, vr: 0, v2: 0 };
    expect(v1).toBeLessThan(vr);
    expect(vr).toBeLessThan(v2);
    expect(fms.vref).toBeGreaterThan(130);
    expect(fms.vref).toBeLessThan(150);
  });
});

describe('LNAV', () => {
  const flight = () => createFlight(glass({ destination: 'buf' }), terrain);

  it('flies along the leg, and back onto it when off to one side', () => {
    const f = flight();
    const fms = f.fms as FmsState;
    const waypoints = activeWaypoints(fms, f.world);
    const target = waypoints[0];
    if (!target) throw new Error('No waypoint.');
    const course = bearingTrue(fms.legFrom, target.position);
    const midway = destination(fms.legFrom, course, distanceNm(fms.legFrom, target.position) / 2);
    const right = destination(midway, course + 90, 3);
    const left = destination(midway, course - 90, 3);
    expect(guidanceAt(f, fms, right)?.crossTrackNm).toBeCloseTo(3, 0);
    expect(guidanceAt(f, fms, left)?.crossTrackNm).toBeCloseTo(-3, 0);
    // Right of the leg, the track asked for turns left of the course, and the reverse.
    const turnFromRight =
      (guidanceAt(f, fms, right)?.desiredTrack ?? 0) - (guidanceAt(f, fms, right)?.legCourse ?? 0);
    expect(turnFromRight).toBeLessThan(-30);
    expect(Math.abs(guidanceAt(f, fms, midway)?.crossTrackNm ?? 9)).toBeLessThan(0.05);
  });

  it('turns onto the next leg as the waypoint comes up, and tunes the ILS near the field', () => {
    const f = flight();
    const fms = f.fms as FmsState;
    const first = activeWaypoints(fms, f.world)[0];
    if (!first) throw new Error('No waypoint.');
    stepFms(fms, f.world, destination(first.position, 0, 1), f.panel);
    expect(fms.active).toBe(1);
    const threshold = f.world.ils.runway.threshold;
    stepFms(fms, f.world, destination(threshold, 200, 30), f.panel);
    expect(f.panel.nav[0].frequency).toBe(f.world.destination.localizer);
  });

  it('arms on the ground and engages once airborne', () => {
    const f = flight();
    applyCommand(f, { kind: 'button', button: 'lnav' });
    expect(f.afds.armedRoute).toBe(true);
    for (let step = 0; step < 120; step++) stepFlight(f, NO_INPUT);
    expect(f.afds.rollMode).not.toBe('route');
  });
});

function guidanceAt(flight: Flight, fms: FmsState, position: Flight['readout']['position']) {
  return lnavGuidance(fms, routeWaypoints(fms.route, fms.approach, flight.world), position);
}

describe('flight level change', () => {
  it('climbs on climb thrust holding the speed, then levels off and holds it', () => {
    const state = startInFlight({ lat: 40, lon: -75 }, 6000, 90, 280, loadFuel(100_000), 0, false);
    const afds = {
      ...startAfds(),
      autopilot: true,
      autothrottle: true,
      pitchMode: 'speed' as const,
      levelChange: true,
      thrustMode: 'climb' as const,
      speedKt: 250,
      altitude: 9000,
    };
    let lever = 0.6;
    const DT = 1 / 60;
    let climbing = 0;
    for (let time = 0; time < 240; time += DT) {
      const output = stepAfds(afds, state, NO_READING, lever, DT);
      lever = output.lever ?? lever;
      stepAirframe(
        state,
        {
          elevator: 0,
          aileron: 0,
          rudder: 0,
          levers: [lever, lever, lever, lever],
          reverse: [0, 0, 0, 0],
          flapLever: 0,
          gearDown: false,
          speedbrake: 0,
          brakes: 0,
          trim: 0,
          holdAttitude: false,
          autopilot: { pitchRate: output.pitchRate, rollRate: output.rollRate },
          crossfeed: false,
        },
        { wind: { north: 0, east: 0, up: 0 }, groundFt: 0, temperatureOffset: 0, qnh: 29.92 },
        DT,
      );
      if (time > 20 && time < 40) climbing = Math.max(climbing, state.verticalSpeedFpm);
    }
    expect(climbing).toBeGreaterThan(1500);
    expect(afds.levelChange).toBe(false);
    expect(afds.thrustMode).toBe('speed');
    expect(Math.abs(state.altitudeFt - 9000)).toBeLessThan(100);
    expect(Math.abs(state.iasKt - 250)).toBeLessThan(8);
  });
});

describe('whole flights on the glass deck', { timeout: 60_000 }, () => {
  it.each(['jfk', 'bos', 'buf'] as const)('flies to %s on LNAV and lands', (id) => {
    const flight = createFlight(glass({ destination: id, level: 'captain' }), terrain);
    const outcome = flyWithTestPilot(flight);
    expect(outcome?.ending).toBe('landed');
    expect(outcome?.fullFlight).toBe(true);
    expect(outcome?.violations).toEqual([]);
  });
});
