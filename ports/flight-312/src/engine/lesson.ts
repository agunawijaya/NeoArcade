import type { AirStart, FlightSetup, Level, Mode, TimeOfDay } from './flight-state';
import { DESTINATIONS, STATIONS, type DestinationId } from './navdata';
import type { DestinationSky } from './weather';

/**
 * A flight-school lesson, as its data file has it: where it starts, what
 * the instructor says, the tasks in order, the coaching cues while each is
 * flown, how it is graded and what is said at the end. Lessons live as
 * JSON in src/lessons; `parseLesson` checks one and says exactly what is
 * wrong with it, so a broken lesson fails the tests rather than a player.
 */
export type LessonCheck =
  | { check: 'flaps'; degrees: number }
  | { check: 'parkingBrake'; set: boolean }
  | { check: 'gear'; down: boolean }
  | { check: 'thrust'; atLeast: number }
  | { check: 'nav1'; frequency: number }
  | { check: 'course1'; course: number }
  | { check: 'headingBug'; heading: number }
  | { check: 'altitudeWindow'; altitudeFt: number }
  | { check: 'autopilot'; engaged: boolean }
  | { check: 'approachArmed' };

export type LessonTaskKind =
  | 'set'
  | 'roll'
  | 'liftoff'
  | 'climb'
  | 'heading'
  | 'altitude'
  | 'track'
  | 'dme'
  | 'crossAt'
  | 'localizer'
  | 'glideslope'
  | 'glidepath'
  | 'land'
  | 'goAround'
  | 'flight';

export type CueWhen =
  | 'offCentreline'
  | 'altitudeOff'
  | 'headingOff'
  | 'bankOver'
  | 'speedBelow'
  | 'speedAbove'
  | 'aboveGlideslope'
  | 'belowGlideslope'
  | 'courseLeft'
  | 'courseRight'
  | 'sinkOver'
  | 'pitchOver'
  | 'gearUpLow';

export interface LessonCue {
  when: CueWhen;
  value: number;
  say: string;
  /** Seconds before the same cue may be said again. */
  every: number;
}

export interface LessonTask {
  kind: LessonTaskKind;
  /** What the instructor says as the task begins, and on the glass deck if it differs. */
  say: string;
  sayGlass: string | null;
  /** What the lesson card shows while the task is on. */
  goal: string;
  done: string | null;
  cues: LessonCue[];
  limitSeconds: number | null;
  check: LessonCheck | null;
  speedKt: number | null;
  withinFt: number | null;
  heightFt: number | null;
  heading: number | null;
  withinDeg: number | null;
  altitudeFt: number | null;
  holdSeconds: number | null;
  station: string | null;
  radial: number | null;
  withinDots: number | null;
  dmeNm: number | null;
  withinNm: number | null;
  downToFt: number | null;
}

export type Measure =
  | 'centrelineFt'
  | 'altitudeErrorFt'
  | 'headingErrorDeg'
  | 'needleDots'
  | 'fixErrorNm'
  | 'crossingErrorFt'
  | 'beamDots'
  | 'speedErrorKt'
  | 'belowMinimumsFt'
  | 'sinkFpm'
  | 'landingPoints'
  | 'seconds';

export const MEASURES: readonly Measure[] = [
  'centrelineFt',
  'altitudeErrorFt',
  'headingErrorDeg',
  'needleDots',
  'fixErrorNm',
  'crossingErrorFt',
  'beamDots',
  'speedErrorKt',
  'belowMinimumsFt',
  'sinkFpm',
  'landingPoints',
  'seconds',
];

/** Lower is better for every measure but the landing's points. */
export const HIGHER_IS_BETTER: readonly Measure[] = ['landingPoints'];

export interface Lesson {
  id: string;
  number: number;
  title: string;
  summary: string;
  /** The flight model the lesson is flown at; the radio and the hints are the lesson's own. */
  level: Level;
  setup: FlightSetup;
  briefing: string[];
  tasks: LessonTask[];
  grade: { measure: Measure; three: number; two: number };
  debrief: { three: string; two: string; one: string; failed: string };
}

export class LessonError extends Error {}

type Raw = Record<string, unknown>;

const TASK_KINDS: readonly LessonTaskKind[] = [
  'set',
  'roll',
  'liftoff',
  'climb',
  'heading',
  'altitude',
  'track',
  'dme',
  'crossAt',
  'localizer',
  'glideslope',
  'glidepath',
  'land',
  'goAround',
  'flight',
];
const CUES: readonly CueWhen[] = [
  'offCentreline',
  'altitudeOff',
  'headingOff',
  'bankOver',
  'speedBelow',
  'speedAbove',
  'aboveGlideslope',
  'belowGlideslope',
  'courseLeft',
  'courseRight',
  'sinkOver',
  'pitchOver',
  'gearUpLow',
];
const CHECKS = [
  'flaps',
  'parkingBrake',
  'gear',
  'thrust',
  'nav1',
  'course1',
  'headingBug',
  'altitudeWindow',
  'autopilot',
  'approachArmed',
] as const;

/** What each task kind needs from its data, beyond what every task has. */
const TASK_FIELDS: Record<LessonTaskKind, (keyof LessonTask)[]> = {
  set: ['check'],
  roll: ['speedKt', 'withinFt'],
  liftoff: [],
  climb: ['heightFt'],
  heading: ['heading', 'withinDeg', 'holdSeconds'],
  altitude: ['altitudeFt', 'withinFt', 'holdSeconds'],
  track: ['station', 'radial', 'withinDots', 'holdSeconds'],
  dme: ['station', 'radial', 'dmeNm', 'withinNm'],
  crossAt: ['station', 'dmeNm', 'altitudeFt', 'withinFt'],
  localizer: ['withinDots'],
  glideslope: ['withinDots'],
  glidepath: ['downToFt', 'withinDots'],
  land: [],
  goAround: [],
  flight: [],
};

const isObject = (value: unknown): value is Raw =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function text(raw: Raw, key: string, where: string): string {
  const value = raw[key];
  if (typeof value !== 'string' || value.trim() === '')
    throw new LessonError(`${where}: "${key}" must be some text.`);
  return value;
}

function optionalText(raw: Raw, key: string, where: string): string | null {
  return raw[key] === undefined ? null : text(raw, key, where);
}

function number(raw: Raw, key: string, where: string): number {
  const value = raw[key];
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new LessonError(`${where}: "${key}" must be a number.`);
  return value;
}

function optionalNumber(raw: Raw, key: string, where: string): number | null {
  return raw[key] === undefined ? null : number(raw, key, where);
}

function oneOf<T extends string>(raw: Raw, key: string, choices: readonly T[], where: string): T {
  const value = raw[key];
  if (!choices.includes(value as T))
    throw new LessonError(`${where}: "${key}" must be one of ${choices.join(', ')}.`);
  return value as T;
}

function parseCheck(raw: unknown, where: string): LessonCheck {
  if (!isObject(raw)) throw new LessonError(`${where}: "check" must be an object.`);
  const kind = oneOf(raw, 'check', CHECKS, where);
  switch (kind) {
    case 'flaps':
      return { check: kind, degrees: number(raw, 'degrees', where) };
    case 'parkingBrake':
      return { check: kind, set: raw.set === true };
    case 'gear':
      return { check: kind, down: raw.down === true };
    case 'thrust':
      return { check: kind, atLeast: number(raw, 'atLeast', where) };
    case 'nav1':
      return { check: kind, frequency: number(raw, 'frequency', where) };
    case 'course1':
      return { check: kind, course: number(raw, 'course', where) };
    case 'headingBug':
      return { check: kind, heading: number(raw, 'heading', where) };
    case 'altitudeWindow':
      return { check: kind, altitudeFt: number(raw, 'altitudeFt', where) };
    case 'autopilot':
      return { check: kind, engaged: raw.engaged === true };
    case 'approachArmed':
      return { check: kind };
  }
}

function parseCue(raw: unknown, where: string): LessonCue {
  if (!isObject(raw)) throw new LessonError(`${where}: a cue must be an object.`);
  return {
    when: oneOf(raw, 'when', CUES, where),
    value: number(raw, 'value', where),
    say: text(raw, 'say', where),
    every: optionalNumber(raw, 'every', where) ?? 12,
  };
}

function parseTask(raw: unknown, where: string): LessonTask {
  if (!isObject(raw)) throw new LessonError(`${where} must be an object.`);
  const kind = oneOf(raw, 'kind', TASK_KINDS, where);
  const cues = raw.cues === undefined ? [] : raw.cues;
  if (!Array.isArray(cues)) throw new LessonError(`${where}: "cues" must be a list.`);
  const task: LessonTask = {
    kind,
    say: text(raw, 'say', where),
    sayGlass: optionalText(raw, 'sayGlass', where),
    goal: text(raw, 'goal', where),
    done: optionalText(raw, 'done', where),
    cues: cues.map((cue, index) => parseCue(cue, `${where}, cue ${index + 1}`)),
    limitSeconds: optionalNumber(raw, 'limitSeconds', where),
    check: raw.check === undefined ? null : parseCheck(raw.check, where),
    speedKt: optionalNumber(raw, 'speedKt', where),
    withinFt: optionalNumber(raw, 'withinFt', where),
    heightFt: optionalNumber(raw, 'heightFt', where),
    heading: optionalNumber(raw, 'heading', where),
    withinDeg: optionalNumber(raw, 'withinDeg', where),
    altitudeFt: optionalNumber(raw, 'altitudeFt', where),
    holdSeconds: optionalNumber(raw, 'holdSeconds', where),
    station: optionalText(raw, 'station', where),
    radial: optionalNumber(raw, 'radial', where),
    withinDots: optionalNumber(raw, 'withinDots', where),
    dmeNm: optionalNumber(raw, 'dmeNm', where),
    withinNm: optionalNumber(raw, 'withinNm', where),
    downToFt: optionalNumber(raw, 'downToFt', where),
  };
  for (const field of TASK_FIELDS[kind]) {
    if (task[field] === null) throw new LessonError(`${where}: a "${kind}" task needs "${field}".`);
  }
  if (task.station !== null && !STATIONS.some((station) => station.ident === task.station))
    throw new LessonError(`${where}: there is no station "${task.station}".`);
  return task;
}

const MODES: readonly Mode[] = ['flight', 'takeoff', 'approach'];
const LEVELS: readonly Level[] = ['rules1982', 'arcade', 'pilot', 'captain'];
const SKIES: readonly DestinationSky[] = ['clear', 'low', 'minimums', 'fog'];
const TIMES: readonly TimeOfDay[] = ['morning', 'dusk', 'night'];

function parseStart(raw: unknown, where: string): AirStart {
  if (!isObject(raw) || !isObject(raw.place))
    throw new LessonError(`${where}: "start" needs a "place".`);
  const place = raw.place;
  const kind = oneOf(place, 'kind', ['radial', 'final'] as const, where);
  const start: AirStart = {
    place:
      kind === 'radial'
        ? {
            kind,
            station: text(place, 'station', where),
            radial: number(place, 'radial', where),
            dmeNm: number(place, 'dmeNm', where),
          }
        : {
            kind,
            outNm: number(place, 'outNm', where),
            offsetNm: number(place, 'offsetNm', where),
          },
    speedKt: number(raw, 'speedKt', where),
    flaps: number(raw, 'flaps', where),
    gearDown: raw.gearDown === true,
    autopilot: raw.autopilot === true,
  };
  if (start.place.kind === 'radial' && !STATIONS.some((s) => s.ident === place.station))
    throw new LessonError(`${where}: the start is on an unknown station.`);
  const altitudeFt = optionalNumber(raw, 'altitudeFt', where);
  const heading = optionalNumber(raw, 'heading', where);
  const fuelLb = optionalNumber(raw, 'fuelLb', where);
  if (altitudeFt !== null) start.altitudeFt = altitudeFt;
  if (heading !== null) start.heading = heading;
  if (fuelLb !== null) start.fuelLb = fuelLb;
  if (start.place.kind === 'radial' && start.altitudeFt === undefined)
    throw new LessonError(`${where}: a start on a radial needs "altitudeFt".`);
  return start;
}

function parseSetup(raw: unknown, level: Level, where: string): FlightSetup {
  if (!isObject(raw)) throw new LessonError(`${where}: "setup" must be an object.`);
  const destination = oneOf(
    raw,
    'destination',
    DESTINATIONS.map((candidate) => candidate.id) as DestinationId[],
    where,
  );
  const setup: FlightSetup = {
    mode: oneOf(raw, 'mode', MODES, where),
    level,
    destination,
    seed: number(raw, 'seed', where),
  };
  if (raw.radio !== undefined)
    setup.radio = oneOf(raw, 'radio', ['quiet', 'firstOfficer'] as const, where);
  if (raw.sky !== undefined) setup.sky = oneOf(raw, 'sky', SKIES, where);
  if (raw.timeOfDay !== undefined) setup.timeOfDay = oneOf(raw, 'timeOfDay', TIMES, where);
  if (raw.wind !== undefined) {
    if (!isObject(raw.wind)) throw new LessonError(`${where}: "wind" must be an object.`);
    setup.wind = {
      direction: number(raw.wind, 'direction', where),
      speedKt: number(raw.wind, 'speedKt', where),
      gustKt: optionalNumber(raw.wind, 'gustKt', where) ?? 0,
    };
  }
  if (raw.start !== undefined) setup.start = parseStart(raw.start, where);
  return setup;
}

export function parseLesson(raw: unknown): Lesson {
  if (!isObject(raw)) throw new LessonError('A lesson must be an object.');
  const id = text(raw, 'id', 'A lesson');
  const where = `Lesson "${id}"`;
  const level = oneOf(raw, 'level', LEVELS, where);
  const briefing = raw.briefing;
  const tasks = raw.tasks;
  if (!Array.isArray(briefing) || briefing.some((line) => typeof line !== 'string'))
    throw new LessonError(`${where}: "briefing" must be a list of lines.`);
  if (!Array.isArray(tasks) || tasks.length === 0)
    throw new LessonError(`${where}: "tasks" must be a list with at least one task.`);
  if (!isObject(raw.grade)) throw new LessonError(`${where}: "grade" must be an object.`);
  if (!isObject(raw.debrief)) throw new LessonError(`${where}: "debrief" must be an object.`);
  const grade = {
    measure: oneOf(raw.grade, 'measure', MEASURES, where),
    three: number(raw.grade, 'three', where),
    two: number(raw.grade, 'two', where),
  };
  const better = HIGHER_IS_BETTER.includes(grade.measure);
  if (better ? grade.three < grade.two : grade.three > grade.two)
    throw new LessonError(`${where}: three stars must be harder to earn than two.`);
  return {
    id,
    number: number(raw, 'number', where),
    title: text(raw, 'title', where),
    summary: text(raw, 'summary', where),
    level,
    setup: parseSetup(raw.setup, level, where),
    briefing: briefing as string[],
    tasks: tasks.map((task, index) => parseTask(task, `${where}, task ${index + 1}`)),
    grade,
    debrief: {
      three: text(raw.debrief, 'three', where),
      two: text(raw.debrief, 'two', where),
      one: text(raw.debrief, 'one', where),
      failed: text(raw.debrief, 'failed', where),
    },
  };
}
