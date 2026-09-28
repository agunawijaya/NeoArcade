import { GRACE_SECONDS, STEP_SECONDS } from './constants';
import { createDrive, pruneHazards, stepDrive, type Drive, type DriveEvent } from './drive';
import type { Hazard } from './hazards';
import { RoadPlanner, type PlanConfig } from './planner';
import { createRoad, pruneRoad, type SignKind } from './road';
import { CARROT_POINTS, comboMultiplier, RHYTHM_POINTS, type NearMissTierInfo } from './scoring';
import { revealGap } from './sight';

/**
 * The runs: Endless, a Road Trip leg and the Daily Road. The car keeps
 * driving up a planned road, faster and faster; each crash costs a life and
 * a few beats of standstill; points come from distance, near misses,
 * carrots and switching on the beat.
 */
export interface RunConfig {
  plan: PlanConfig;
  lives: number;
  /** A small bonus for lane switches on the beat. */
  rhythm: boolean;
  /** Road Trip: the near-miss points that earn a leg's third star. */
  nearMissTarget: number | null;
}

/** A crash holds the road still for whole beats, so the music is still in step afterwards. */
export const CRASH_BEATS = 4;
/** Runs with an end are split into this many stretches for the Daily Road's share line. */
export const SEGMENTS = 10;
const MILESTONE_METRES = 500;

export type RunPhase =
  | { kind: 'drive' }
  | { kind: 'crash'; steps: number; length: number; hazard: Hazard }
  | { kind: 'over'; reason: 'crashes' | 'finish' };

export interface RunStats {
  crashes: number;
  /** Donkeys left behind without a crash. */
  passed: number;
  /** Near misses per tier: [Close shave, Whisker, Hee-haw-some]. */
  nearMisses: [number, number, number];
  nearMissPoints: number;
  carrots: number;
  carrotPoints: number;
  onBeat: number;
  rhythmPoints: number;
  bestCombo: number;
}

export interface Segment {
  crashes: number;
  nearMisses: number;
}

export interface RunState {
  config: RunConfig;
  drive: Drive;
  planner: RoadPlanner;
  phase: RunPhase;
  lives: number;
  /** Near misses in a row. */
  combo: number;
  stats: RunStats;
  segments: Segment[];
  signsSeen: SignKind[];
}

export type RunEvent =
  | DriveEvent
  | {
      type: 'near-miss';
      tier: NearMissTierInfo;
      combo: number;
      multiplier: number;
      points: number;
      hazard: Hazard;
    }
  | { type: 'combo-broken'; combo: number }
  | { type: 'rhythm'; points: number }
  | { type: 'carrot-points'; points: number }
  | { type: 'life-lost'; lives: number }
  | { type: 'resume' }
  | { type: 'sign'; kind: SignKind; first: boolean }
  | { type: 'milestone'; metres: number }
  | { type: 'finish' }
  | { type: 'run-over'; reason: 'crashes' | 'finish' };

export function createRun(config: RunConfig): RunState {
  const planner = new RoadPlanner(config.plan);
  const drive = createDrive(createRoad(planner.finishPosition()), planner.speedAtBeat(0));
  drive.beatSeconds = planner.beatSeconds;
  drive.route = (roadTime) => planner.positionAtTime(roadTime);
  planner.fill(drive);
  return {
    config,
    drive,
    planner,
    phase: { kind: 'drive' },
    lives: config.lives,
    combo: 0,
    stats: {
      crashes: 0,
      passed: 0,
      nearMisses: [0, 0, 0],
      nearMissPoints: 0,
      carrots: 0,
      carrotPoints: 0,
      onBeat: 0,
      rhythmPoints: 0,
      bestCombo: 0,
    },
    segments: Array.from({ length: SEGMENTS }, () => ({ crashes: 0, nearMisses: 0 })),
    signsSeen: [],
  };
}

export function stepRun(state: RunState, input: { driver: boolean }): RunEvent[] {
  const events: RunEvent[] = [];
  const { phase, drive, planner } = state;
  if (phase.kind === 'over') return events;
  if (phase.kind === 'crash') {
    phase.steps += 1;
    if (phase.steps >= phase.length) {
      state.phase = { kind: 'drive' };
      drive.car.graceUntil = drive.roadTime + GRACE_SECONDS;
      events.push({ type: 'resume' });
    }
    return events;
  }

  planner.fill(drive);
  drive.speed = planner.speedAtBeat(drive.roadTime / planner.beatSeconds);
  const metresBefore = drive.car.nose;
  const driveEvents = stepDrive(drive, input.driver);
  events.push(...driveEvents);

  for (const event of driveEvents) {
    if (event.type === 'crash') crash(state, event.hazard, events);
    else if (event.type === 'pass') pass(state, event, events);
    else if (event.type === 'carrot') {
      state.stats.carrots += 1;
      state.stats.carrotPoints += CARROT_POINTS;
      events.push({ type: 'carrot-points', points: CARROT_POINTS });
    } else if (event.type === 'switch' && event.onBeat && state.config.rhythm) {
      const points = RHYTHM_POINTS * comboMultiplier(state.combo);
      state.stats.onBeat += 1;
      state.stats.rhythmPoints += points;
      events.push({ type: 'rhythm', points });
    }
    if (state.phase.kind === 'over') return events;
  }

  noticeSigns(state, events);
  const milestone = Math.floor(drive.car.nose / MILESTONE_METRES);
  if (milestone > Math.floor(metresBefore / MILESTONE_METRES)) {
    events.push({ type: 'milestone', metres: milestone * MILESTONE_METRES });
  }
  const finish = drive.road.finish;
  if (finish !== null && drive.car.nose >= finish && state.phase.kind === 'drive') {
    state.phase = { kind: 'over', reason: 'finish' };
    events.push({ type: 'finish' }, { type: 'run-over', reason: 'finish' });
  }
  if (drive.steps % 60 === 0) {
    pruneHazards(drive);
    pruneRoad(drive.road, drive.car.nose - 60);
  }
  return events;
}

function crash(state: RunState, hazard: Hazard, events: RunEvent[]) {
  const { stats, drive } = state;
  stats.crashes += 1;
  state.lives -= 1;
  breakCombo(state, events);
  const segment = segmentAt(state);
  if (segment) segment.crashes += 1;
  events.push({ type: 'life-lost', lives: state.lives });
  if (state.lives <= 0) {
    state.phase = { kind: 'over', reason: 'crashes' };
    events.push({ type: 'run-over', reason: 'crashes' });
    return;
  }
  const beatSteps = Math.round((CRASH_BEATS * (drive.beatSeconds ?? 0.5)) / STEP_SECONDS);
  state.phase = { kind: 'crash', steps: 0, length: beatSteps, hazard };
}

function pass(state: RunState, event: Extract<DriveEvent, { type: 'pass' }>, events: RunEvent[]) {
  const { stats } = state;
  stats.passed += 1;
  if (!event.threatened || event.neutral) return;
  if (!event.nearMiss) {
    breakCombo(state, events);
    return;
  }
  state.combo += 1;
  stats.bestCombo = Math.max(stats.bestCombo, state.combo);
  const multiplier = comboMultiplier(state.combo);
  const points = event.nearMiss.points * multiplier;
  stats.nearMisses[(event.nearMiss.tier - 1) as 0 | 1 | 2] += 1;
  stats.nearMissPoints += points;
  const segment = segmentAt(state);
  if (segment) segment.nearMisses += 1;
  events.push({
    type: 'near-miss',
    tier: event.nearMiss,
    combo: state.combo,
    multiplier,
    points,
    hazard: event.hazard,
  });
}

function breakCombo(state: RunState, events: RunEvent[]) {
  if (state.combo > 0) events.push({ type: 'combo-broken', combo: state.combo });
  state.combo = 0;
}

function noticeSigns(state: RunState, events: RunEvent[]) {
  const { drive } = state;
  const sight = drive.car.nose + revealGap();
  for (const sign of drive.road.signs) {
    if (sign.at > sight || state.signsSeen.includes(sign.kind)) continue;
    state.signsSeen.push(sign.kind);
    events.push({ type: 'sign', kind: sign.kind, first: true });
  }
}

/** The stretch of the road the car is on, for runs with an end. */
function segmentAt(state: RunState): Segment | undefined {
  const finish = state.drive.road.finish;
  if (finish === null) return undefined;
  const index = Math.min(SEGMENTS - 1, Math.floor((state.drive.car.nose / finish) * SEGMENTS));
  return state.segments[index];
}

/** Everything a run scores: a point a metre, plus its bonuses. */
export function runScore(state: RunState): number {
  const { stats } = state;
  return metresDriven(state) + stats.nearMissPoints + stats.carrotPoints + stats.rhythmPoints;
}

export function metresDriven(state: RunState): number {
  const finish = state.drive.road.finish;
  const nose = Math.max(0, state.drive.car.nose);
  return Math.floor(finish === null ? nose : Math.min(nose, finish));
}

export interface LegStars {
  finished: boolean;
  clean: boolean;
  target: boolean;
  count: number;
}

/** Road Trip stars: finish; finish without a crash; reach the near-miss target. */
export function legStars(state: RunState): LegStars {
  const finished = state.phase.kind === 'over' && state.phase.reason === 'finish';
  const clean = finished && state.stats.crashes === 0;
  const target =
    finished &&
    state.config.nearMissTarget !== null &&
    state.stats.nearMissPoints >= state.config.nearMissTarget;
  return { finished, clean, target, count: Number(finished) + Number(clean) + Number(target) };
}

/** How far through a run with an end the car is, 0..1. */
export function progressOf(state: RunState): number | null {
  const finish = state.drive.road.finish;
  return finish === null ? null : Math.min(1, Math.max(0, state.drive.car.nose / finish));
}
