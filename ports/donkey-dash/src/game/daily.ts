import { dailyChallenge, type DailyDay } from '@shared/daily';
import { DAILY_LAUNCH } from '../engine/modes';
import { metresDriven, runScore, type RunState } from '../engine/run';

/**
 * The Daily Road: one road a day, the same for everyone, seeded from the
 * UTC date. Only the first run of the day counts; it is kept as a small
 * record for the streak, the calendar and the share line.
 */
export const DAILY = dailyChallenge({ game: 'donkey-dash', launch: DAILY_LAUNCH });

export interface DailyResult {
  metres: number;
  crashes: number;
  finished: boolean;
  score: number;
  /** One square per tenth of the road; see stripOf. */
  strip: string;
}

const SQUARES = { clean: '🟩', close: '✨', crash: '💥', ahead: '⬜' } as const;

/**
 * The road in ten squares: clean, with near misses, with a crash, or never
 * reached. It tells friends how the run went without giving the road away.
 */
export function stripOf(state: RunState): string {
  const finish = state.drive.road.finish ?? 1;
  const reached = Math.min(1, state.drive.car.nose / finish);
  return state.segments
    .map((segment, index) => {
      if (segment.crashes > 0) return SQUARES.crash;
      if ((index + 0.001) / state.segments.length > reached) return SQUARES.ahead;
      return segment.nearMisses > 0 ? SQUARES.close : SQUARES.clean;
    })
    .join('');
}

export function dailyResultOf(state: RunState): DailyResult {
  return {
    metres: metresDriven(state),
    crashes: state.stats.crashes,
    finished: state.phase.kind === 'over' && state.phase.reason === 'finish',
    score: runScore(state),
    strip: stripOf(state),
  };
}

/** The line players paste to friends: no angles, no lanes, no spoilers. */
export function shareText(day: DailyDay, result: DailyResult): string {
  const flag = result.finished ? '🏁' : '🚗💨';
  const metres = `${result.metres.toLocaleString('en')} m`;
  return `Donkey Dash · Daily #${day.number} ${flag} ${result.crashes} 🫏💥 · ${metres}\n${result.strip}`;
}

export function isDailyResult(value: unknown): value is DailyResult {
  if (typeof value !== 'object' || value === null) return false;
  const result = value as Partial<DailyResult>;
  return (
    typeof result.metres === 'number' &&
    typeof result.crashes === 'number' &&
    typeof result.finished === 'boolean' &&
    typeof result.strip === 'string'
  );
}
