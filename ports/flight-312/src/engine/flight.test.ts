import { beforeAll, describe, expect, it } from 'vitest';
import { loadTerrainSource } from '../data/unpack';
import { answerReadback, frequencyOf } from './atc';
import { checklistById } from './checklists';
import {
  allowedTimeScale,
  completeChecklist,
  createFlight,
  NO_INPUT,
  stepFlight,
  type Flight,
  type FlightSetup,
} from './flight';
import { DESTINATIONS } from './navdata';
import { setFlapDegrees, setLevers } from './panel';
import { createTerrain, type Terrain } from './terrain';
import { createTestPilot, flyWithTestPilot, testPilotInput } from './test-pilot';

/**
 * Whole flights, flown by the scripted test pilot through the same panel,
 * keys and radio a player has, over the real terrain. The full matrix of
 * levels and destinations is in scripts/balance.ts; these are the ones fast
 * enough to run on every change.
 */
let terrain: Terrain;

beforeAll(async () => {
  terrain = createTerrain(await loadTerrainSource());
});

const setup = (over: Partial<FlightSetup>): FlightSetup => ({
  mode: 'flight',
  level: 'pilot',
  destination: 'jfk',
  seed: 312,
  ...over,
});

function fly(flight: Flight, seconds: number) {
  for (let elapsed = 0; elapsed < seconds && !flight.outcome; elapsed += 1 / 60)
    stepFlight(flight, NO_INPUT);
}

// Whole flights take seconds of computing each, not milliseconds.
describe('the test pilot', { timeout: 60_000 }, () => {
  it('flies the 1982 rules from Philadelphia to Kennedy and lands', () => {
    const flight = createFlight(setup({ level: 'rules1982' }), terrain);
    const outcome = flyWithTestPilot(flight, 3600);
    expect(outcome?.ending).toBe('landed');
    expect(outcome?.fullFlight).toBe(true);
  });

  it.each(DESTINATIONS.map((destination) => destination.id))(
    'flies the ILS practice at %s at the Pilot level and under the 1982 rules',
    (destination) => {
      for (const level of ['pilot', 'rules1982'] as const) {
        const flight = createFlight(
          setup({ mode: 'approach', level, destination, sky: 'minimums' }),
          terrain,
        );
        const outcome = flyWithTestPilot(flight, 1200);
        expect(outcome?.ending, `${level} at ${destination}`).toBe('landed');
        expect(outcome?.touchdown?.runway.airport).toBe(flight.world.ils.runway.airport);
      }
    },
  );

  it('flies the takeoff practice up to 3,000 ft at every level', () => {
    for (const level of ['rules1982', 'arcade', 'pilot', 'captain'] as const) {
      const flight = createFlight(setup({ mode: 'takeoff', level }), terrain);
      expect(flyWithTestPilot(flight, 900)?.ending, level).toBe('climbOut');
    }
  });

  it(
    'flies the whole flight to Kennedy at the Captain level without a single violation',
    { timeout: 60_000 },
    () => {
      const flight = createFlight(setup({ level: 'captain' }), terrain);
      const outcome = flyWithTestPilot(flight, 3600);
      expect(outcome?.ending).toBe('landed');
      expect(outcome?.violations.map((violation) => violation.id)).toEqual([]);
      expect(outcome?.touchdown?.sinkFpm).toBeLessThan(600);
    },
  );

  it('flies the same flight twice to the same foot', () => {
    const first = createFlight(setup({ mode: 'approach', destination: 'bos' }), terrain);
    const second = createFlight(setup({ mode: 'approach', destination: 'bos' }), terrain);
    flyWithTestPilot(first, 1200);
    flyWithTestPilot(second, 1200);
    expect(second.readout.position).toEqual(first.readout.position);
    expect(second.touchdown).toEqual(first.touchdown);
    expect(second.atc.log.map((call) => call.at)).toEqual(first.atc.log.map((call) => call.at));
  });
});

describe('the flight on its own', { timeout: 30_000 }, () => {
  it('waits on the runway, brakes set, and is cleared for takeoff at 08:00', () => {
    const flight = createFlight(setup({ level: 'arcade' }), terrain);
    fly(flight, 59);
    expect(flight.atc.cleared.takeoff).toBe(false);
    expect(flight.readout.groundSpeedKt).toBe(0);
    fly(flight, 30);
    expect(flight.atc.cleared.takeoff).toBe(true);
  });

  it('gives each mode its own weather seed, and the 1982 sky when asked', () => {
    const one = createFlight(setup({ seed: 1 }), terrain);
    const two = createFlight(setup({ seed: 2 }), terrain);
    expect(one.world.weather.bands).not.toEqual(two.world.weather.bands);
    const purist = createFlight(setup({ level: 'rules1982', seed: 1, programSky: true }), terrain);
    const another = createFlight(setup({ level: 'rules1982', seed: 2, programSky: true }), terrain);
    expect(purist.world.weather.bands).toEqual(another.world.weather.bands);
  });

  it('allows time acceleration in the cruise only', () => {
    const onRunway = createFlight(setup({}), terrain);
    expect(allowedTimeScale(onRunway, 16)).toBe(1);
    const approach = createFlight(setup({ mode: 'approach' }), terrain);
    expect(allowedTimeScale(approach, 16)).toBe(1);
    const cruising = createFlight(setup({}), terrain);
    flyWithTestPilot(cruising, 330);
    expect(cruising.readout.heightFt).toBeGreaterThan(2000);
    // Once the radio is quiet, the cruise may run fast.
    for (let wait = 0; wait < 600 && allowedTimeScale(cruising, 16) === 1; wait++)
      stepFlight(cruising, NO_INPUT);
    expect(allowedTimeScale(cruising, 16)).toBe(16);
    expect(allowedTimeScale(cruising, 4)).toBe(4);
  });

  it('sounds the takeoff configuration horn with the flaps up and the levers forward', () => {
    const flight = createFlight(setup({}), terrain);
    flight.panel.parkingBrake = false;
    setLevers(flight.panel, 0.9);
    fly(flight, 1);
    expect(flight.warnings.takeoffConfig).toBe(true);
    setFlapDegrees(flight.panel, 10);
    fly(flight, 1);
    expect(flight.warnings.takeoffConfig).toBe(false);
  });

  it('counts a checklist only when every item is set', () => {
    const flight = createFlight(setup({ level: 'captain' }), terrain);
    expect(completeChecklist(flight, 'beforeTakeoff')).toBe(false);
    setFlapDegrees(flight.panel, 10);
    flight.panel.altimeterInHg = flight.world.weather.departure.qnh;
    // The Captain works the radio: reads back what is asked and dials the tower.
    for (let elapsed = 0; elapsed < 90; elapsed += 1 / 60) {
      if (flight.atc.pending) answerReadback(flight.atc, flight.atcContext, 'correct', flight.time);
      if (flight.atc.handedTo)
        flight.panel.comm = frequencyOf(flight.facilities, flight.atc.handedTo);
      stepFlight(flight, NO_INPUT);
    }
    expect(flight.atc.cleared.takeoff).toBe(true);
    expect(completeChecklist(flight, 'beforeTakeoff')).toBe(true);
    expect(flight.procedures.completed.beforeTakeoff).not.toBeNull();
    expect(checklistById('beforeTakeoff').items.length).toBeGreaterThan(3);
  });

  it('writes down a Captain who overspeeds the flaps', () => {
    const flight = createFlight(setup({ level: 'captain', mode: 'approach' }), terrain);
    setFlapDegrees(flight.panel, 30);
    flight.afds.speedKt = 230;
    fly(flight, 40);
    expect(flight.procedures.violations.some((violation) => violation.id === 'flapSpeed')).toBe(
      true,
    );
  });

  // Under the 1982 rules: at the real levels the test pilot sees the approach is not stable and goes around.
  it('ends a landing with the gear handle taped up in a belly landing', () => {
    const flight = createFlight(setup({ mode: 'approach', level: 'rules1982' }), terrain);
    const ending = flyWithTamperedPilot(
      flight,
      (tampered) => (tampered.panel.gearDown = false),
      1200,
    );
    expect(ending).toBe('gearUp');
  });

  it('rolls a takeoff without flaps into the marshes under the 1982 rules', () => {
    const flight = createFlight(setup({ level: 'rules1982', mode: 'takeoff' }), terrain);
    const ending = flyWithTamperedPilot(flight, (tampered) => (tampered.panel.flapLever = 0), 600);
    expect(ending).toBe('marshes');
  });
});

/** The test pilot, with something done to the aircraft before every step. */
function flyWithTamperedPilot(flight: Flight, tamper: (flight: Flight) => void, seconds: number) {
  const pilot = createTestPilot(flight);
  for (let elapsed = 0; elapsed < seconds && !flight.outcome; elapsed += 1 / 60) {
    const input = testPilotInput(pilot);
    tamper(flight);
    stepFlight(flight, input);
  }
  return flight.outcome?.ending ?? null;
}
