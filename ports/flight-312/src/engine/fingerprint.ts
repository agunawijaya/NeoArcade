import { addDays, dailyChallenge } from '@shared/daily';
import { loadTerrainSource } from '../data/unpack';
import { lessonById } from '../lessons';
import { DAILY_APPROACH_LAUNCH, dailyApproach, dailySetup } from './daily-approach';
import { createFlight, stepFlight, type Flight, type FlightSetup } from './flight';
import { createLessonPilot, lessonPilotInput } from './lesson-pilot';
import { startLesson, stepLesson } from './lesson-monitor';
import { createPracticePlayer, stepPracticePlayer } from './practice-player';
import { FlightRecorder, replayRecording } from './recording';
import { encodeRecording } from './recording-codec';
import type { Terrain } from './terrain';
import { createTerrain } from './terrain';
import { createTestPilot, testPilotInput } from './test-pilot';
import { generateWeather } from './weather';

/**
 * The engine's fingerprint: the weather of many seeds, and flights flown by
 * the scripted test pilot at every level and on both decks, written down
 * every half minute to the last bit with the radio's transcript and the
 * report at the end; two lessons as the instructor flies them; two months
 * of Daily Approaches, the first of them flown; and an approach recorded
 * command by command, its bytes and its replay. A replay, a shared seed or
 * a daily flight is the same flight everywhere only if Node and every
 * browser write exactly these lines.
 */
const FLIGHTS: FlightSetup[] = [
  { mode: 'takeoff', level: 'arcade', destination: 'jfk', seed: 1 },
  { mode: 'takeoff', level: 'captain', destination: 'bos', seed: 2 },
  { mode: 'approach', level: 'pilot', destination: 'jfk', seed: 3, sky: 'minimums' },
  { mode: 'approach', level: 'captain', destination: 'ssm', seed: 5, sky: 'low' },
  { mode: 'approach', level: 'rules1982', destination: 'buf', seed: 4 },
  { mode: 'flight', level: 'rules1982', destination: 'jfk', seed: 312, programSky: true },
  { mode: 'flight', level: 'captain', destination: 'jfk', seed: 312, deck: 'glass' },
];
const LESSON_IDS = ['vor-radial', 'crosswind-landing'];

const DAILY_DAYS = 60;
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
  for (const id of LESSON_IDS) lines.push(...traceLesson(id, terrain));
  lines.push(...traceDailies(terrain));
  lines.push(...traceRecording(terrain));
  return lines;
}

/** Every player's Daily Approach is the same field, weather and wind: the days as they come, and the first flown. */
function traceDailies(terrain: Terrain): string[] {
  const lines: string[] = [];
  const days = dailyChallenge({ game: 'flight-312', launch: DAILY_APPROACH_LAUNCH });
  for (let index = 0; index < DAILY_DAYS; index++) {
    const daily = dailyApproach(days.forKey(addDays(DAILY_APPROACH_LAUNCH, index)));
    const flight = createFlight(dailySetup(daily, 'pilot', 'glass'), terrain);
    lines.push(
      `daily ${JSON.stringify(daily)} ${JSON.stringify(flight.world.weather.destination)}`,
    );
    if (index === 0) lines.push(...traceFlight(flight, 'daily 1'));
  }
  return lines;
}

function traceLesson(id: string, terrain: Terrain): string[] {
  const lesson = lessonById(id);
  if (!lesson) return [`lesson ${id} missing`];
  const flight = createFlight({ ...lesson.setup, deck: 'glass' }, terrain);
  const run = startLesson(lesson, flight);
  const pilot = createLessonPilot(flight, run);
  const lines: string[] = [];
  while (run.status !== 'passed' && run.status !== 'failed' && flight.time < LIMIT_SECONDS) {
    for (const event of stepLesson(run, flight, stepFlight(flight, lessonPilotInput(pilot))))
      lines.push(`lesson ${id} ${flight.time} ${JSON.stringify(event)}`);
    if (flight.outcome && run.status === 'flying') break;
  }
  lines.push(`lesson ${id} end ${run.status} ${run.stars} ${run.measure} ${sample(flight)}`);
  return lines;
}

/** An approach flown by commands, its bytes, and the same approach flown again from them. */
function traceRecording(terrain: Terrain): string[] {
  const flight = createFlight(
    { mode: 'approach', level: 'pilot', destination: 'bos', seed: 77, sky: 'low' },
    terrain,
  );
  const recorder = new FlightRecorder(flight);
  const player = createPracticePlayer(recorder);
  while (!flight.outcome && flight.time < LIMIT_SECONDS) stepPracticePlayer(player);
  const bytes = encodeRecording(recorder.recording());
  const again = replayRecording(recorder.recording(), terrain);
  return [
    `recording bytes ${bytes.length} ${Array.from(bytes.subarray(-8)).join(',')}`,
    `recording flown ${sample(flight)}`,
    `recording again ${sample(again)}`,
  ];
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
