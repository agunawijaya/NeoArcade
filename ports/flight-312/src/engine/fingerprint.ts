import { loadTerrainSource } from '../data/unpack';
import { createFlight, stepFlight, type Flight, type FlightSetup } from './flight';
import { createTerrain } from './terrain';
import { createTestPilot, testPilotInput } from './test-pilot';
import { generateWeather } from './weather';

/**
 * The engine's fingerprint: the weather of many seeds, and flights flown by
 * the scripted test pilot at every level, written down every half minute to
 * the last bit with the radio's transcript and the report at the end. A
 * replay, a shared seed or a daily flight is the same flight everywhere
 * only if Node and every browser write exactly these lines.
 */
const FLIGHTS: FlightSetup[] = [
  { mode: 'takeoff', level: 'arcade', destination: 'jfk', seed: 1 },
  { mode: 'takeoff', level: 'captain', destination: 'bos', seed: 2 },
  { mode: 'approach', level: 'pilot', destination: 'jfk', seed: 3, sky: 'minimums' },
  { mode: 'approach', level: 'captain', destination: 'ssm', seed: 5, sky: 'low' },
  { mode: 'approach', level: 'rules1982', destination: 'buf', seed: 4 },
  { mode: 'flight', level: 'rules1982', destination: 'jfk', seed: 312, programSky: true },
];

const WEATHER_SEEDS = 40;
const SAMPLE_SECONDS = 30;
/** Long enough for the 1982 flight to Kennedy; the others end sooner. */
const LIMIT_SECONDS = 2 * 3600;

export async function determinismTrace(): Promise<string[]> {
  const lines: string[] = [];
  const terrain = createTerrain(await loadTerrainSource());
  for (let seed = 1; seed <= WEATHER_SEEDS; seed++) {
    const flight = createFlight(
      { mode: 'flight', level: 'pilot', destination: 'bos', seed },
      terrain,
    );
    const { departure, destination } = flight.world.weather;
    const weather = generateWeather({
      seed,
      style: seed % 2 === 0 ? 'program' : 'realistic',
      departure: { position: departure.position, elevationFt: departure.elevationFt },
      destination: { position: destination.position, elevationFt: destination.elevationFt },
    });
    lines.push(`weather ${seed} ${JSON.stringify(weather)}`);
  }
  FLIGHTS.forEach((setup, index) => {
    lines.push(
      ...traceFlight(createFlight(setup, terrain), `${index} ${setup.mode} ${setup.level}`),
    );
  });
  return lines;
}

function traceFlight(flight: Flight, name: string): string[] {
  const lines: string[] = [];
  const pilot = createTestPilot(flight);
  let nextSample = 0;
  while (!flight.outcome && flight.time < LIMIT_SECONDS) {
    if (flight.time >= nextSample) {
      lines.push(`${name} ${sample(flight)}`);
      nextSample += SAMPLE_SECONDS;
    }
    stepFlight(flight, testPilotInput(pilot));
  }
  lines.push(`${name} end ${sample(flight)}`);
  for (const call of flight.atc.log)
    lines.push(`${name} radio ${call.at} ${call.speaker} ${call.text.written}`);
  lines.push(`${name} report ${JSON.stringify(flight.outcome?.report ?? null)}`);
  return lines;
}

function sample(flight: Flight): string {
  const r = flight.readout;
  return [
    `t=${flight.time}`,
    `lat=${r.position.lat}`,
    `lon=${r.position.lon}`,
    `alt=${r.altitudeFt}`,
    `ias=${r.iasKt}`,
    `hdg=${r.headingTrue}`,
    `vs=${r.verticalSpeedFpm}`,
    `fuel=${r.fuelLb}`,
  ].join(' ');
}
