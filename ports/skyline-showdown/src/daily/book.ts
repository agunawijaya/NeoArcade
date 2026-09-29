import { createDailyLog, type DailyEntry, type DailyLog, type Streak } from '@shared/daily';
import type { Store } from '@shared/storage';
import {
  DAILY_THROWS,
  sanitiseAims,
  type DailyOutcome,
  type DailyResult,
  type DailySkyline,
} from './daily';

const LOG_KEY = 'daily';
const RUN_KEY = 'daily-run';
const OUTCOMES: readonly DailyOutcome[] = ['hit', 'selfHit', 'outOfThrows'];

interface StoredRun {
  key: string;
  aims: [number, number][];
}

/**
 * The Daily Skyline's memory in this browser: one scored result per UTC
 * day (the shared daily log), and the throws of today's attempt while it
 * is still going, so leaving the page never grants a second try. Coming
 * back replays those throws and carries on.
 */
export class DailyBook {
  private readonly log: DailyLog<DailyResult>;

  constructor(private readonly store: Store) {
    this.log = createDailyLog<DailyResult>(store, LOG_KEY);
  }

  resultOf(key: string): DailyResult | undefined {
    return sanitiseResult(this.log.get(key));
  }

  entries(): DailyEntry<DailyResult>[] {
    return this.log.entries().flatMap((entry) => {
      const result = sanitiseResult(entry.result);
      return result ? [{ key: entry.key, result }] : [];
    });
  }

  streak(today: string): Streak {
    return this.log.streak(today);
  }

  /** The throws of today's unfinished scored attempt, oldest first. */
  unfinished(skyline: DailySkyline): [number, number][] {
    const run = this.store.get<StoredRun | null>(RUN_KEY, null);
    return run?.key === skyline.day.key ? sanitiseAims(run.aims) : [];
  }

  throwMade(skyline: DailySkyline, aim: [number, number]) {
    const aims = [...this.unfinished(skyline), aim];
    this.store.set<StoredRun>(RUN_KEY, { key: skyline.day.key, aims });
  }

  /** Keeps the day's result; false if the day already had one. */
  finish(skyline: DailySkyline, result: DailyResult): boolean {
    this.store.remove(RUN_KEY);
    return this.log.record(skyline.day.key, result);
  }
}

function sanitiseResult(raw: unknown): DailyResult | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { outcome, throws, aims } = raw as Record<string, unknown>;
  if (!OUTCOMES.includes(outcome as DailyOutcome)) return undefined;
  if (
    typeof throws !== 'number' ||
    !Number.isInteger(throws) ||
    throws < 1 ||
    throws > DAILY_THROWS
  ) {
    return undefined;
  }
  return { outcome: outcome as DailyOutcome, throws, aims: sanitiseAims(aims) };
}
