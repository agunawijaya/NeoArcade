import { dailyChallenge, type DailyDay } from '@shared/daily';
import { createRng } from '@shared/rng';
import {
  createRound,
  matchFromRound,
  takeTurn,
  type MatchOptions,
  type MatchState,
  type TurnAim,
  type TurnResult,
} from '../engine/match';
import type { TwistKind } from '../engine/twists';
import { WORLD_IDS, WORLDS, type WorldId } from '../engine/worlds';

/**
 * The Daily Skyline (ADR 0013): one city a day, the same for everyone on
 * Earth, worked out from the UTC date alone. You against a still target
 * gorilla, on that day's world, in that day's wind, with one light twist;
 * as few throws as you can, ten at most. The first attempt of the day is
 * the one that counts.
 */
export const DAILY_LAUNCH = '2026-09-29';
export const DAILY_THROWS = 10;
export const DAILY = dailyChallenge({ game: 'skyline-showdown', launch: DAILY_LAUNCH });

/**
 * Light twists: each changes how a city plays without deciding it. Heat
 * haze would hide the very wind the share line shows, and lightning
 * reshapes too much for a ten-throw puzzle. The Moon has no air to gust,
 * stream or whirl.
 */
export type LightTwist = Extract<
  TwistKind,
  'gusts' | 'drone' | 'supertall' | 'jetStream' | 'hillside' | 'bouncy' | 'dustDevil'
>;

const LIGHT_TWISTS: Record<WorldId, readonly LightTwist[]> = {
  earth: ['gusts', 'drone', 'supertall', 'jetStream', 'hillside', 'bouncy'],
  moon: ['drone', 'supertall', 'hillside', 'bouncy'],
  mars: ['gusts', 'drone', 'supertall', 'hillside', 'bouncy', 'dustDevil'],
  jupiter: ['gusts', 'drone', 'supertall', 'jetStream', 'hillside', 'bouncy'],
};

/** Each light twist as the daily card names it. */
export const TWIST_WORDS: Record<LightTwist, { name: string; line: string }> = {
  gusts: { name: 'Gusts', line: 'The wind shifts after every throw: check the gauge each time.' },
  drone: {
    name: 'Billboard drone',
    line: 'A drone patrols above the street and stops any banana it touches.',
  },
  supertall: { name: 'Supertall', line: 'One tower in the middle scrapes the sky.' },
  jetStream: {
    name: 'Jet stream',
    line: 'High above, a band of air blows with a wind of its own.',
  },
  hillside: {
    name: 'Hillside',
    line: 'The city climbs a hill: the target stands far above or below you.',
  },
  bouncy: { name: 'Springy roofs', line: 'Every banana bounces once off the first roof it hits.' },
  dustDevil: { name: 'Dust devil', line: 'A whirlwind shoves anything that flies through it.' },
};

export interface DailySkyline {
  day: DailyDay;
  world: WorldId;
  twist: LightTwist;
  /** The one round, rebuilt from this seed on every visit and in every browser. */
  roundSeed: number;
  options: MatchOptions;
}

/** Today's daily; a clock set before the launch gets Daily #1. */
export function dailyFor(now: Date): DailySkyline {
  const day = DAILY.on(now);
  return dailySkyline(day.number >= 1 ? day : DAILY.forKey(DAILY_LAUNCH));
}

export function dailySkyline(day: DailyDay): DailySkyline {
  const rng = createRng(day.seed);
  const world = rng.pick(WORLD_IDS);
  const twist = rng.pick(LIGHT_TWISTS[world]);
  const roundSeed = rng.int(0, 0x7fffffff);
  return {
    day,
    world,
    twist,
    roundSeed,
    options: {
      seed: day.seed,
      world,
      points: 1,
      format: 'firstTo',
      powerUps: [],
      twists: [twist],
      solo: true,
      throwLimit: DAILY_THROWS,
    },
  };
}

/** A fresh attempt at the daily: you throw, the gorilla on the right waits. */
export function startDaily(daily: DailySkyline): MatchState {
  const round = createRound(1, daily.roundSeed, daily.options);
  return matchFromRound(daily.options, round, 0, [null, null]);
}

/**
 * An attempt picked up where it was left: the throws already made are
 * thrown again, which lands every one exactly where it landed before.
 */
export function resumeDaily(
  daily: DailySkyline,
  aims: readonly TurnAim[],
): {
  state: MatchState;
  results: TurnResult[];
} {
  const state = startDaily(daily);
  const results: TurnResult[] = [];
  for (const aim of aims) {
    if (state.status !== 'playing') break;
    results.push(takeTurn(state, aim));
  }
  return { state, results };
}

export type DailyOutcome = 'hit' | 'selfHit' | 'outOfThrows';

/** What is kept for each day's scored attempt. */
export interface DailyResult {
  outcome: DailyOutcome;
  throws: number;
  /** Every throw as aimed, [angle, velocity], to redraw the paths on the results screen. */
  aims: [number, number][];
}

export function outcomeOf(state: MatchState): DailyOutcome | null {
  if (state.status === 'playing') return null;
  if (state.winner === 0) return 'hit';
  return state.winner === 1 ? 'selfHit' : 'outOfThrows';
}

/** The share line: how it went, never how it was done (no angles, no powers). */
export function shareLine(daily: DailySkyline, wind: number, result: DailyResult): string {
  const header = `Skyline Showdown · Daily #${daily.day.number} · ${WORLDS[daily.world].name} 🌬️ ${windText(wind)}`;
  const misses = '🍌'.repeat(result.outcome === 'hit' ? result.throws - 1 : result.throws);
  const ending = result.outcome === 'hit' ? '💥' : result.outcome === 'selfHit' ? '🙈' : '';
  const score = result.outcome === 'hit' ? `${result.throws}/${DAILY_THROWS}` : `X/${DAILY_THROWS}`;
  return `${header}\n${misses}${ending}  ${score}`;
}

/** "←3", "→5", or "calm": the wind as the gauge shows it. */
export function windText(wind: number): string {
  if (wind === 0) return 'calm';
  return `${wind > 0 ? '→' : '←'}${Math.abs(wind)}`;
}

/** Stored aims, as far as they can be trusted. */
export function sanitiseAims(raw: unknown): [number, number][] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (aim): aim is [number, number] =>
        Array.isArray(aim) &&
        aim.length === 2 &&
        aim.every((value) => typeof value === 'number' && Number.isFinite(value)),
    )
    .slice(0, DAILY_THROWS);
}
