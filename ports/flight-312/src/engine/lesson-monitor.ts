import { beamDots } from './approach-log';
import { angleDifference } from './exact-math';
import { magneticHeading, type Deck, type Flight, type FlightEvent } from './flight-state';
import { destination, distanceNm } from './geo';
import { scoreLanding } from './landing-score';
import {
  HIGHER_IS_BETTER,
  type Lesson,
  type LessonCheck,
  type LessonCue,
  type LessonTask,
  type Measure,
} from './lesson';
import { toTrue } from './magnetic';
import { STATIONS } from './navdata';
import { flapLeverDegrees } from './panel';
import { SEVERITY } from './outcome';
import { onRunway } from './runways';
import { DECISION_HEIGHT_FT } from './warnings';

/**
 * A lesson being flown: the instructor's briefing, then each task in turn,
 * the cues that coach it, the one measure the lesson is graded on, and the
 * verdict, from one star to three, or a try-again. It steps alongside the
 * flight and only reads it, so a lesson replays as exactly as any flight,
 * and the same monitor marks the scripted demonstration and the player.
 */
export type LessonEvent =
  | { kind: 'say'; text: string }
  | { kind: 'task'; index: number }
  | { kind: 'passed'; stars: 1 | 2 | 3; measure: number }
  | { kind: 'failed'; reason: string };

export interface LessonRun {
  lesson: Lesson;
  deck: Deck;
  status: 'briefing' | 'flying' | 'passed' | 'failed';
  /** The briefing's lines and when each is said. */
  script: { at: number; text: string }[];
  task: number;
  taskStartedAt: number;
  /** Since when the task's condition has held, for the tasks that must be held. */
  holdingSince: number | null;
  /** The task's target has been met once: from then on its excursions count. */
  settled: boolean;
  /** The altitude to keep when a task does not name one: where the lesson began. */
  holdAltitudeFt: number;
  measure: number | null;
  stars: 0 | 1 | 2 | 3;
  reason: string | null;
  cueSaidAt: Record<string, number>;
  firstTaskAt: number;
}

/** Seconds between the briefing's lines, and before the first. */
const BRIEFING_GAP = 6;
const BRIEFING_START = 1.5;
/** The beams are lost past this many dots: the approach is over. */
const LOST_DOTS = 3;
/** The initial climb's speed counts from this high above the runway, once the nose is up, to the acceleration height. */
const CLIMB_SPEED_FROM_FT = 400;
const CLIMB_SPEED_TO_FT = 1000;

export function startLesson(lesson: Lesson, flight: Flight): LessonRun {
  const script = lesson.briefing.map((text, index) => ({
    at: BRIEFING_START + index * BRIEFING_GAP,
    text,
  }));
  return {
    lesson,
    deck: flight.deck,
    status: 'briefing',
    script,
    task: -1,
    taskStartedAt: 0,
    holdingSince: null,
    settled: false,
    holdAltitudeFt: flight.readout.altitudeFt,
    measure: null,
    stars: 0,
    reason: null,
    cueSaidAt: {},
    firstTaskAt: BRIEFING_START + script.length * BRIEFING_GAP,
  };
}

export const currentTask = (run: LessonRun): LessonTask | null =>
  run.lesson.tasks[run.task] ?? null;

export function taskWords(run: LessonRun, task: LessonTask): string {
  return run.deck === 'glass' && task.sayGlass ? task.sayGlass : task.say;
}

export function stepLesson(run: LessonRun, flight: Flight, events: FlightEvent[]): LessonEvent[] {
  const out: LessonEvent[] = [];
  if (run.status === 'passed' || run.status === 'failed') return out;
  while (run.script[0] && flight.time >= run.script[0].at) {
    out.push({ kind: 'say', text: (run.script.shift() as { text: string }).text });
  }
  if (run.status === 'briefing') {
    if (flight.outcome) return fail(run, out, 'The flight ended before the lesson began.');
    if (run.script.length > 0 || flight.time < run.firstTaskAt) return out;
    run.status = 'flying';
    run.firstTaskAt = flight.time;
    beginTask(run, 0, flight, out);
  }
  const task = currentTask(run);
  if (!task) return out;
  const verdict = judgeTask(run, task, flight, events);
  if (verdict.failed) return fail(run, out, verdict.failed);
  if (verdict.done) {
    if (task.done) out.push({ kind: 'say', text: task.done });
    if (run.task + 1 < run.lesson.tasks.length) beginTask(run, run.task + 1, flight, out);
    else pass(run, flight, out);
    return out;
  }
  if (flight.outcome) return fail(run, out, endingReason(flight));
  if (task.limitSeconds !== null && flight.time - run.taskStartedAt > task.limitSeconds)
    return fail(run, out, 'That took too long: the clock ran out on the task.');
  for (const [index, cue] of task.cues.entries()) {
    const key = `${run.task}:${index}`;
    const said = run.cueSaidAt[key];
    if (said !== undefined && flight.time - said < cue.every) continue;
    if (cueHolds(cue, task, run, flight)) {
      run.cueSaidAt[key] = flight.time;
      out.push({ kind: 'say', text: cue.say });
    }
  }
  return out;
}

function beginTask(run: LessonRun, index: number, flight: Flight, out: LessonEvent[]) {
  run.task = index;
  run.taskStartedAt = flight.time;
  run.holdingSince = null;
  run.settled = false;
  const task = run.lesson.tasks[index] as LessonTask;
  if (task.altitudeFt !== null && task.kind === 'altitude') run.holdAltitudeFt = task.altitudeFt;
  out.push({ kind: 'task', index }, { kind: 'say', text: taskWords(run, task) });
}

function fail(run: LessonRun, out: LessonEvent[], reason: string): LessonEvent[] {
  run.status = 'failed';
  run.reason = reason;
  out.push({ kind: 'failed', reason }, { kind: 'say', text: run.lesson.debrief.failed });
  return out;
}

function pass(run: LessonRun, flight: Flight, out: LessonEvent[]) {
  const { grade, debrief } = run.lesson;
  if (grade.measure === 'landingPoints') run.measure = scoreLanding(flight).points;
  if (grade.measure === 'seconds') run.measure = flight.time - run.firstTaskAt;
  const value = run.measure ?? (HIGHER_IS_BETTER.includes(grade.measure) ? 0 : Infinity);
  const better = (limit: number) =>
    HIGHER_IS_BETTER.includes(grade.measure) ? value >= limit : value <= limit;
  const stars = better(grade.three) ? 3 : better(grade.two) ? 2 : 1;
  run.status = 'passed';
  run.stars = stars;
  out.push(
    { kind: 'passed', stars, measure: value },
    { kind: 'say', text: stars === 3 ? debrief.three : stars === 2 ? debrief.two : debrief.one },
  );
}

function endingReason(flight: Flight): string {
  const outcome = flight.outcome;
  if (!outcome) return 'The flight ended.';
  return SEVERITY[outcome.ending] === 'success'
    ? 'The flight ended before the lesson was done.'
    : `${outcome.report.headline}.`;
}

/** Keeps the worst value seen of the lesson's measure; the points are worked out at the end. */
function note(run: LessonRun, measure: Measure, value: number) {
  if (run.lesson.grade.measure !== measure) return;
  run.measure = run.measure === null ? value : Math.max(run.measure, value);
}

/** Holds for `seconds` before it counts. */
function held(run: LessonRun, holding: boolean, seconds: number, time: number): boolean {
  if (!holding) {
    run.holdingSince = null;
    return false;
  }
  run.holdingSince ??= time;
  return time - run.holdingSince >= seconds;
}

function checkMet(check: LessonCheck, flight: Flight): boolean {
  const panel = flight.panel;
  const afds = flight.afds;
  switch (check.check) {
    case 'flaps':
      return flapLeverDegrees(panel) === check.degrees;
    case 'parkingBrake':
      return panel.parkingBrake === check.set;
    case 'gear':
      return panel.gearDown === check.down;
    case 'thrust':
      return Math.min(...panel.levers) >= check.atLeast;
    case 'nav1':
      return Math.abs(panel.nav[0].frequency - check.frequency) < 0.005;
    case 'course1':
      return Math.abs(angleDifference(panel.nav[0].course, check.course)) < 1.5;
    case 'headingBug':
      return Math.abs(angleDifference(panel.headingBug, check.heading)) < 1.5;
    case 'altitudeWindow':
      return Math.abs(afds.altitude - check.altitudeFt) < 50;
    case 'autopilot':
      return afds.autopilot === check.engaged;
    case 'approachArmed':
      return (
        (afds.armedNavigation && afds.armedGlideslope) ||
        afds.rollMode === 'localizer' ||
        afds.pitchMode === 'glideslope'
      );
  }
}

const stationOf = (ident: string | null) => STATIONS.find((station) => station.ident === ident);

/** The VOR on NAV 1, if it is the task's station: its reading in dots. */
function vorDots(flight: Flight, task: LessonTask): number | null {
  const nav = flight.nav[0];
  if (nav.kind !== 'vor' || nav.ident !== task.station) return null;
  return nav.deviation / (nav.fullScale / 2);
}

function judgeTask(
  run: LessonRun,
  task: LessonTask,
  flight: Flight,
  events: FlightEvent[],
): { done: boolean; failed: string | null } {
  const r = flight.readout;
  const time = flight.time;
  const outcome = flight.outcome;
  const pending = { done: false, failed: null };
  const altitudeTarget = task.altitudeFt ?? run.holdAltitudeFt;
  const keepsAltitude = () => note(run, 'altitudeErrorFt', Math.abs(r.altitudeFt - altitudeTarget));
  switch (task.kind) {
    case 'set':
      return { done: task.check !== null && checkMet(task.check, flight), failed: null };
    case 'roll': {
      if (r.onGround) {
        const across = Math.abs(onRunway(flight.world.departure, r.position).across);
        note(run, 'centrelineFt', across);
        if (task.withinFt !== null && across > task.withinFt)
          return { done: false, failed: 'The jumbo wandered off the centreline.' };
      }
      return { done: r.iasKt >= (task.speedKt ?? 0), failed: null };
    }
    case 'liftoff':
      if (r.onGround && flight.brakesReleasedAt !== null)
        note(run, 'centrelineFt', Math.abs(onRunway(flight.world.departure, r.position).across));
      return { done: flight.liftoffAt !== null, failed: null };
    case 'climb': {
      const above = r.altitudeFt - flight.world.departure.elevationFt;
      // The initial climb holds V2 + 10 with the pitch.
      if (above > CLIMB_SPEED_FROM_FT && above < CLIMB_SPEED_TO_FT)
        note(run, 'speedErrorKt', Math.abs(r.iasKt - (flight.speeds.v2 + 10)));
      const climbedOut = outcome?.ending === 'climbOut';
      return {
        done: climbedOut || (above >= (task.heightFt ?? 0) && !flight.panel.gearDown),
        failed: null,
      };
    }
    case 'heading': {
      const error = Math.abs(angleDifference(magneticHeading(flight), task.heading ?? 0));
      const within = error <= (task.withinDeg ?? 5);
      if (within) run.settled = true;
      if (run.settled) note(run, 'headingErrorDeg', error);
      keepsAltitude();
      return { done: held(run, within, task.holdSeconds ?? 0, time), failed: null };
    }
    case 'altitude': {
      const error = Math.abs(r.altitudeFt - altitudeTarget);
      const within = error <= (task.withinFt ?? 100);
      if (within) run.settled = true;
      if (run.settled) note(run, 'altitudeErrorFt', error);
      return { done: held(run, within, task.holdSeconds ?? 0, time), failed: null };
    }
    case 'track': {
      const dots = vorDots(flight, task);
      const onCourse =
        Math.abs(angleDifference(flight.panel.nav[0].course, task.radial ?? 0)) < 2.5;
      const within =
        dots !== null &&
        onCourse &&
        flight.nav[0].toFrom === 'from' &&
        Math.abs(dots) <= (task.withinDots ?? 1);
      if (within) run.settled = true;
      if (run.settled && dots !== null) note(run, 'needleDots', Math.abs(dots));
      keepsAltitude();
      return { done: held(run, within, task.holdSeconds ?? 0, time), failed: null };
    }
    case 'dme': {
      const station = stationOf(task.station);
      if (!station) return { done: false, failed: 'The lesson names a station that is not there.' };
      keepsAltitude();
      const out = distanceNm(station.position, r.position);
      if (Math.abs(out - (task.dmeNm ?? 0)) > (task.withinNm ?? 1)) return pending;
      const fix = destination(
        station.position,
        toTrue(task.radial ?? 0, station.variation),
        task.dmeNm ?? 0,
      );
      const miss = distanceNm(fix, r.position);
      note(run, 'fixErrorNm', miss);
      return { done: true, failed: null };
    }
    case 'crossAt': {
      const station = stationOf(task.station);
      if (!station) return { done: false, failed: 'The lesson names a station that is not there.' };
      if (distanceNm(station.position, r.position) > (task.dmeNm ?? 0)) return pending;
      note(run, 'crossingErrorFt', Math.abs(r.altitudeFt - altitudeTarget));
      return { done: true, failed: null };
    }
    case 'localizer':
    case 'glideslope': {
      const dots = beamDots(flight);
      const limit = task.withinDots ?? 1;
      const aligned =
        Math.abs(angleDifference(r.headingTrue, flight.world.ils.runway.headingTrue)) < 30;
      const within =
        aligned &&
        Math.abs(dots.localizer) <= limit &&
        (task.kind === 'localizer' || Math.abs(dots.glideslope) <= limit);
      if (within) run.settled = true;
      if (run.settled)
        note(
          run,
          'beamDots',
          task.kind === 'localizer'
            ? Math.abs(dots.localizer)
            : Math.max(Math.abs(dots.localizer), Math.abs(dots.glideslope)),
        );
      return { done: held(run, within, 5, time), failed: null };
    }
    case 'glidepath': {
      const dots = beamDots(flight);
      const height = r.altitudeFt - flight.world.ils.runway.elevationFt;
      const worst = Math.max(Math.abs(dots.localizer), Math.abs(dots.glideslope));
      if (worst <= (task.withinDots ?? 1)) run.settled = true;
      // Counted once established on both beams: the intercept is not the approach.
      if (run.settled) note(run, 'beamDots', worst);
      if (run.settled && worst > LOST_DOTS && !r.onGround)
        return { done: false, failed: 'The approach drifted far off the beams.' };
      return { done: height <= (task.downToFt ?? 0), failed: null };
    }
    case 'land': {
      if (flight.touchdown) note(run, 'sinkFpm', flight.touchdown.sinkFpm);
      if (!outcome) return pending;
      if (outcome.ending === 'landed') return { done: true, failed: null };
      return {
        done: false,
        failed:
          outcome.ending === 'hardLanding'
            ? 'That touchdown was too hard for the gear.'
            : `${outcome.report.headline}.`,
      };
    }
    case 'goAround': {
      if (flight.touchdown)
        return { done: false, failed: 'You landed without the runway in sight at minimums.' };
      const radio = flight.radioAltitudeFt;
      if (radio !== null && !r.onGround)
        note(run, 'belowMinimumsFt', Math.max(0, DECISION_HEIGHT_FT - radio));
      const climbedAway = events.some((event) => event.kind === 'goAroundComplete' && event.proper);
      return { done: climbedAway, failed: null };
    }
    case 'flight': {
      if (flight.touchdown) note(run, 'sinkFpm', flight.touchdown.sinkFpm);
      if (!outcome) return pending;
      if (outcome.fullFlight) return { done: true, failed: null };
      return { done: false, failed: endingReason(flight) };
    }
  }
}

function cueHolds(cue: LessonCue, task: LessonTask, run: LessonRun, flight: Flight): boolean {
  const r = flight.readout;
  const radio = flight.radioAltitudeFt;
  switch (cue.when) {
    case 'offCentreline':
      return (
        r.onGround && Math.abs(onRunway(flight.world.departure, r.position).across) > cue.value
      );
    case 'altitudeOff':
      return Math.abs(r.altitudeFt - (task.altitudeFt ?? run.holdAltitudeFt)) > cue.value;
    case 'headingOff':
      return (
        task.heading !== null &&
        Math.abs(angleDifference(magneticHeading(flight), task.heading)) > cue.value
      );
    case 'bankOver':
      return Math.abs(r.bankDeg) > cue.value;
    case 'speedBelow':
      return !r.onGround && r.iasKt < cue.value;
    case 'speedAbove':
      return r.iasKt > cue.value;
    case 'aboveGlideslope':
      return beamDots(flight).glideslope > cue.value;
    case 'belowGlideslope':
      return beamDots(flight).glideslope < -cue.value;
    case 'courseLeft':
    case 'courseRight': {
      // Positive: the course lies to the right of the aircraft.
      const vor = vorDots(flight, task);
      const toTheRight = vor !== null ? vor : -beamDots(flight).localizer;
      return cue.when === 'courseRight' ? toTheRight > cue.value : toTheRight < -cue.value;
    }
    case 'sinkOver':
      return radio !== null && radio < 1000 && -r.verticalSpeedFpm > cue.value;
    case 'pitchOver':
      return r.pitchDeg > cue.value;
    case 'gearUpLow':
      return !flight.panel.gearDown && radio !== null && radio < cue.value;
  }
}
