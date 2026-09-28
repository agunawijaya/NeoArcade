import { STARTING_LIVES } from './constants';
import type { PhraseKind, PlanConfig, SpeedCurve } from './planner';
import { legRun, legSeed, ROUTE_IDS } from './routes';
import type { RunConfig } from './run';

/**
 * How each run is set up. Classic Duel and Donkey vs Driver are built in
 * duel.ts; everything with a road planner is described here.
 */
export type Difficulty = 'relaxed' | 'normal' | 'frantic';

export const DIFFICULTIES: readonly Difficulty[] = ['relaxed', 'normal', 'frantic'];

export interface DifficultyRules {
  /** For runs with an end: the Daily Road and its practice runs. */
  speed: SpeedCurve;
  /** Endless keeps climbing for longer, towards a harder top speed. */
  endlessSpeed: SpeedCurve;
  rest: { start: number; end: number };
  slack: number;
  wobbleCommitSeconds: number;
}

/**
 * The speed curves decide the reaction window (SIGHT_DISTANCE / speed). On
 * the Daily Road, Relaxed starts at 1.45 s and never drops below 0.92 s,
 * Normal goes from 1.23 s to 0.73 s, Frantic from 1.03 s to 0.63 s. Endless
 * keeps going: towards 0.8 s, 0.65 s and 0.59 s. The planner checks that even
 * the top speed leaves time to react and press twice (planner.test.ts).
 */
export const DIFFICULTY_RULES: Record<Difficulty, DifficultyRules> = {
  relaxed: {
    speed: { start: 11, max: 17.5, rampBeats: 240 },
    endlessSpeed: { start: 11, max: 20, rampBeats: 420 },
    rest: { start: 4, end: 2 },
    slack: 0.34,
    wobbleCommitSeconds: 0.62,
  },
  normal: {
    speed: { start: 13, max: 22, rampBeats: 200 },
    endlessSpeed: { start: 13, max: 24.5, rampBeats: 360 },
    rest: { start: 3, end: 1.5 },
    slack: 0.24,
    wobbleCommitSeconds: 0.54,
  },
  frantic: {
    speed: { start: 15.5, max: 25.5, rampBeats: 160 },
    endlessSpeed: { start: 16.5, max: 27, rampBeats: 220 },
    rest: { start: 2, end: 1 },
    slack: 0.15,
    wobbleCommitSeconds: 0.46,
  },
};

/** When each kind of hazard first turns up in Endless, in beats (a beat is half a second). */
const ENDLESS_INTRODUCTIONS: Partial<Record<PhraseKind, number>> = {
  single: 0,
  carrots: 12,
  pair: 32,
  mud: 64,
  wobbler: 96,
  'three-lanes': 136,
  herd: 176,
};

export const ENDLESS_BPM = 120;

export function endlessRun(
  seed: number,
  difficulty: Difficulty,
  hazards: boolean,
  rhythm: boolean,
): RunConfig {
  const rules = DIFFICULTY_RULES[difficulty];
  return {
    plan: {
      seed,
      bpm: ENDLESS_BPM,
      speed: rules.endlessSpeed,
      introduce: hazards ? ENDLESS_INTRODUCTIONS : { single: 0 },
      rest: rules.rest,
      slack: rules.slack,
      wobbleCommitSeconds: rules.wobbleCommitSeconds,
      lengthBeats: null,
      boss: false,
      leadInBeats: 6,
    },
    lives: STARTING_LIVES,
    rhythm,
    nearMissTarget: null,
  };
}

/** Daily Road #1. */
export const DAILY_LAUNCH = '2026-09-28';
export const DAILY_BPM = 112;
/** About two and a half minutes of road at 112 beats a minute. */
export const DAILY_LENGTH_BEATS = 288;

const DAILY_INTRODUCTIONS: Partial<Record<PhraseKind, number>> = {
  single: 0,
  carrots: 8,
  pair: 24,
  mud: 48,
  wobbler: 76,
  'three-lanes': 108,
  herd: 144,
};

/**
 * The Daily Road: a fixed length of road on Normal with every hazard. The
 * scored run ignores the player's difficulty and hazard settings, so everyone
 * drives the same road; practice runs afterwards follow the settings.
 */
export function dailyRun(
  seed: number,
  practice?: { difficulty: Difficulty; hazards: boolean; rhythm: boolean },
): RunConfig {
  const rules = DIFFICULTY_RULES[practice?.difficulty ?? 'normal'];
  const hazards = practice?.hazards ?? true;
  return {
    plan: {
      seed,
      bpm: DAILY_BPM,
      speed: rules.speed,
      introduce: hazards ? DAILY_INTRODUCTIONS : { single: 0 },
      rest: rules.rest,
      slack: rules.slack,
      wobbleCommitSeconds: rules.wobbleCommitSeconds,
      lengthBeats: DAILY_LENGTH_BEATS,
      boss: false,
      leadInBeats: 6,
    },
    lives: STARTING_LIVES,
    rhythm: practice?.rhythm ?? true,
    nearMissTarget: null,
  };
}

/** Every plan a mode can produce, for the tests that prove each one can be driven. */
export function everyPlan(): PlanConfig[] {
  const plans: PlanConfig[] = [];
  for (const difficulty of DIFFICULTIES) {
    plans.push(endlessRun(1, difficulty, true, true).plan);
    plans.push(dailyRun(1, { difficulty, hazards: true, rhythm: true }).plan);
  }
  for (const route of ROUTE_IDS) {
    for (let leg = 0; leg < 3; leg++)
      plans.push(legRun(route, leg, legSeed(route, leg), true).plan);
  }
  return plans;
}
