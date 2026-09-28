import type { Store } from '../storage';

/**
 * Daily challenges without a server. Everyone who plays on the same UTC date
 * gets the same number and the same seed, so results can be compared by
 * sharing a line of text. A game keeps one scored result per day in its own
 * store; streaks and the calendar are worked out from those.
 *
 *   const daily = dailyChallenge({ game: 'donkey-dash', launch: '2026-09-28' });
 *   const today = daily.on(new Date());   // { key: '2026-10-04', number: 7, seed: 2716… }
 *   const log = createDailyLog<RunResult>(store);
 *   if (log.record(today.key, result)) showStreak(log.streak(today.key));
 *   await shareText(`Donkey Dash · Daily #${today.number} · 1,840 m`);
 *
 * Dates are UTC on purpose: a daily must be the same puzzle in Jakarta and in
 * Lisbon. Show the player when the next one arrives in their local time.
 */
export interface DailyDay {
  /** The UTC date, as YYYY-MM-DD. */
  key: string;
  /** 1 on the launch date, counting up one per UTC day. Zero or less before the launch. */
  number: number;
  /** The same for every player on this date, and different for every game. */
  seed: number;
}

export interface DailyChallenge {
  on(date: Date): DailyDay;
  /** The daily for a stored key, e.g. to replay an old day from the calendar. */
  forKey(key: string): DailyDay;
}

export interface DailyOptions {
  /** The game's slug; two games never share a seed. */
  game: string;
  /** The UTC date of daily #1, as YYYY-MM-DD. */
  launch: string;
}

const DAY_MS = 86_400_000;
const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function dailyChallenge({ game, launch }: DailyOptions): DailyChallenge {
  const launchDay = dayIndex(launch);
  const forKey = (key: string): DailyDay => ({
    key,
    number: dayIndex(key) - launchDay + 1,
    seed: hashText(`${game}:${key}`),
  });
  return { on: (date) => forKey(dayKey(date)), forKey };
}

/** The UTC date of a moment, as YYYY-MM-DD. */
export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isDayKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DAY_KEY.test(value)) return false;
  return dayKey(new Date(Date.parse(`${value}T00:00:00Z`))) === value;
}

/** Days since 1970-01-01 (UTC) for a day key. */
export function dayIndex(key: string): number {
  if (!isDayKey(key)) throw new RangeError(`"${key}" is not a YYYY-MM-DD date.`);
  return Math.round(Date.parse(`${key}T00:00:00Z`) / DAY_MS);
}

export function addDays(key: string, days: number): string {
  return dayKey(new Date((dayIndex(key) + days) * DAY_MS));
}

/** The moment the next daily starts: the coming UTC midnight. */
export function nextDailyAt(now: Date): Date {
  return new Date((Math.floor(now.getTime() / DAY_MS) + 1) * DAY_MS);
}

export interface Streak {
  /** Days in a row up to today, or up to yesterday while today is still open. */
  current: number;
  best: number;
}

/** Streaks over the days a player completed, in any order. */
export function streakOf(keys: readonly string[], today: string): Streak {
  const days = [...new Set(keys.filter(isDayKey).map(dayIndex))].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let index = 0; index < days.length; index++) {
    const day = days[index] as number;
    run = index > 0 && day - (days[index - 1] as number) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  const todayIndex = dayIndex(today);
  const played = new Set(days);
  // A streak survives until the end of the day after its last run.
  let cursor = played.has(todayIndex) ? todayIndex : todayIndex - 1;
  let current = 0;
  while (played.has(cursor)) {
    current++;
    cursor--;
  }
  return { current, best };
}

export interface DailyEntry<Result> {
  key: string;
  result: Result;
}

/** One scored result per UTC day, kept in the game's own store. */
export interface DailyLog<Result> {
  /** Keeps the day's result; false if that day already has one (only the first run counts). */
  record(key: string, result: Result): boolean;
  get(key: string): Result | undefined;
  has(key: string): boolean;
  /** Oldest first. */
  entries(): DailyEntry<Result>[];
  streak(today: string): Streak;
}

export function createDailyLog<Result>(store: Store, storageKey = 'daily'): DailyLog<Result> {
  const read = (): Record<string, Result> => {
    const stored = store.get<unknown>(storageKey, {});
    if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return {};
    return Object.fromEntries(
      Object.entries(stored as Record<string, Result>).filter(([key]) => isDayKey(key)),
    );
  };

  return {
    record(key, result) {
      if (!isDayKey(key)) return false;
      const days = read();
      if (key in days) return false;
      days[key] = result;
      store.set(storageKey, days);
      return true;
    },
    get: (key) => read()[key],
    has: (key) => key in read(),
    entries: () =>
      Object.entries(read())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, result]) => ({ key, result })),
    streak: (today) => streakOf(Object.keys(read()), today),
  };
}

/**
 * One month as calendar rows, weeks starting on Monday. Each cell is a day
 * key, or null for the padding before the 1st and after the last day.
 */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const first = new Date(Date.UTC(year, month, 1));
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const leading = (first.getUTCDay() + 6) % 7;
  const cells: (string | null)[] = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= days; day++) cells.push(dayKey(new Date(Date.UTC(year, month, day))));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let start = 0; start < cells.length; start += 7) weeks.push(cells.slice(start, start + 7));
  return weeks;
}

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

/** Whether the device has a share sheet (most phones, some desktops). */
export function canShareText(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/** Opens the device's share sheet with the text, or copies it where there is none. */
export async function shareText(text: string): Promise<ShareOutcome> {
  if (canShareText()) {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    }
  }
  return copyText(text);
}

export async function copyText(text: string): Promise<ShareOutcome> {
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}

// FNV-1a, the same hash @shared/rng uses for text seeds.
function hashText(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
