import { dailyChallenge, type DailyDay } from '@shared/daily';
import type { SessionOutcome } from './session';
import type { SortieMission, SortieOptions } from './sortie';

/** Daily Sortie #1 was flown on this UTC date. */
export const DAILY_LAUNCH = '2026-10-15';

/**
 * The Daily Sortie: one battlefield a day, the same for everyone, seeded
 * from the UTC date (see modes.ts for the rules it is flown under). Only
 * the first sortie of the day counts; it is kept as a small record for the
 * streak, the calendar, the Hall's Today panel and the share line.
 */
export const DAILY = dailyChallenge({ game: 'mind-the-ox', launch: DAILY_LAUNCH });

/**
 * From Daily Sortie #3 one day in three or so is flown at sea, as a Custom
 * Sortie built from the day's seed. The days before it were all on land
 * and stay as they were, so their results still stand.
 */
export const NAVAL_DAILY_FROM = 3;

const NAVAL_MISSIONS: readonly SortieMission[] = [
  'land-strike',
  'anti-ship',
  'intercept',
  'convoy-escort',
  'defend-carrier',
  'recon',
];

export function isNavalDay(day: DailyDay): boolean {
  return day.number >= NAVAL_DAILY_FROM && day.seed % 3 === 0;
}

/** A naval day's sortie: the same for everyone, flown off our carrier in daylight against normal pilots. */
export function dailySortieOptions(day: DailyDay): SortieOptions {
  return {
    base: 'carrier',
    mission: NAVAL_MISSIONS[(day.seed >>> 4) % NAVAL_MISSIONS.length] as SortieMission,
    enemy: (['land', 'sea', 'both'] as const)[(day.seed >>> 8) % 3] ?? 'land',
    seaState: ((day.seed >>> 12) % 2) as 0 | 1,
    hour: 'day',
    level: 'normal',
    theme: 'great-war',
    seed: day.seed,
  };
}

export interface DailyResult {
  score: number;
  /** Flew into the sun, or got THE END. */
  won: boolean;
  targets: number;
  planesDowned: number;
  planesLost: number;
  oxSafe: boolean;
  seconds: number;
}

export function dailyResultOf(outcome: SessionOutcome): DailyResult {
  const round = outcome.rounds[0];
  const side = round?.tally.sides[0];
  return {
    score: outcome.scores[0],
    won: round?.winner === 0,
    targets: side?.targets ?? 0,
    planesDowned: side?.planesDowned ?? 0,
    planesLost: side?.planesLost ?? 0,
    oxSafe: (side?.oxen ?? 0) === 0,
    seconds: Math.round(round?.tally.seconds ?? 0),
  };
}

/**
 * The line players paste to friends: a bang for every plane brought down,
 * whether the oxen came through, the sun if the round was won, and the
 * score. Nothing about where the targets were.
 */
export function shareText(day: DailyDay, result: DailyResult): string {
  const kills = '💥'.repeat(Math.min(5, result.planesDowned));
  const ox = result.oxSafe ? '🐄✅' : '🐄❌';
  const sun = result.won ? '☀️' : '';
  const sea = isNavalDay(day) ? '⚓' : '';
  return `Mind the Ox · Daily #${day.number} 🛩️${sea}${kills}${ox}${sun} ${result.score.toLocaleString('en')}`;
}

export function isDailyResult(value: unknown): value is DailyResult {
  if (typeof value !== 'object' || value === null) return false;
  const result = value as Partial<DailyResult>;
  return (
    typeof result.score === 'number' &&
    typeof result.won === 'boolean' &&
    typeof result.planesDowned === 'number' &&
    typeof result.oxSafe === 'boolean'
  );
}
