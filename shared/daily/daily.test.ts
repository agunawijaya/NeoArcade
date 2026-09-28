import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore } from '../storage';
import {
  addDays,
  copyText,
  createDailyLog,
  dailyChallenge,
  dayIndex,
  dayKey,
  isDayKey,
  monthGrid,
  nextDailyAt,
  shareText,
  streakOf,
} from './index';

describe('day keys', () => {
  it('uses the UTC date, whatever the local time zone', () => {
    expect(dayKey(new Date('2026-10-04T23:30:00-05:00'))).toBe('2026-10-05');
    expect(dayKey(new Date('2026-10-05T00:30:00+07:00'))).toBe('2026-10-04');
  });

  it('recognises real dates only', () => {
    expect(isDayKey('2026-02-28')).toBe(true);
    expect(isDayKey('2026-02-29')).toBe(false);
    expect(isDayKey('2026-2-28')).toBe(false);
    expect(isDayKey(20261004)).toBe(false);
  });

  it('counts and adds days across months and years', () => {
    expect(dayIndex('1970-01-02')).toBe(1);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
  });

  it('finds the next UTC midnight', () => {
    expect(nextDailyAt(new Date('2026-10-04T17:20:00Z')).toISOString()).toBe(
      '2026-10-05T00:00:00.000Z',
    );
    expect(nextDailyAt(new Date('2026-10-05T00:00:00Z')).toISOString()).toBe(
      '2026-10-06T00:00:00.000Z',
    );
  });
});

describe('dailyChallenge', () => {
  const daily = dailyChallenge({ game: 'donkey-dash', launch: '2026-09-28' });

  it('numbers days from the launch', () => {
    expect(daily.on(new Date('2026-09-28T08:00:00Z')).number).toBe(1);
    expect(daily.on(new Date('2026-11-03T08:00:00Z')).number).toBe(37);
    expect(daily.forKey('2026-09-27').number).toBe(0);
  });

  it('gives everyone the same seed for a date, and each game its own', () => {
    const early = daily.on(new Date('2026-10-04T00:05:00Z'));
    const late = daily.on(new Date('2026-10-04T23:55:00Z'));
    expect(early.seed).toBe(late.seed);
    expect(daily.forKey('2026-10-05').seed).not.toBe(early.seed);
    const other = dailyChallenge({ game: 'skyline-showdown', launch: '2026-09-28' });
    expect(other.forKey('2026-10-04').seed).not.toBe(early.seed);
  });
});

describe('streakOf', () => {
  it('keeps a streak alive until the day after the last run ends', () => {
    const days = ['2026-10-01', '2026-10-02', '2026-10-03'];
    expect(streakOf(days, '2026-10-03')).toEqual({ current: 3, best: 3 });
    expect(streakOf(days, '2026-10-04')).toEqual({ current: 3, best: 3 });
    expect(streakOf(days, '2026-10-05')).toEqual({ current: 0, best: 3 });
  });

  it('finds the best run anywhere in the history', () => {
    const days = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-10-01'];
    expect(streakOf(days, '2026-10-01')).toEqual({ current: 1, best: 4 });
    expect(streakOf([], '2026-10-01')).toEqual({ current: 0, best: 0 });
  });

  it('ignores duplicates, order and junk', () => {
    expect(streakOf(['2026-10-02', 'nope', '2026-10-01', '2026-10-02'], '2026-10-02')).toEqual({
      current: 2,
      best: 2,
    });
  });
});

describe('createDailyLog', () => {
  it('keeps only the first result of each day', () => {
    const log = createDailyLog<{ metres: number }>(createStore('test-daily', null));
    expect(log.record('2026-10-04', { metres: 1840 })).toBe(true);
    expect(log.record('2026-10-04', { metres: 9999 })).toBe(false);
    expect(log.get('2026-10-04')).toEqual({ metres: 1840 });
    expect(log.record('not-a-day', { metres: 1 })).toBe(false);
  });

  it('lists entries oldest first and knows the streak', () => {
    const log = createDailyLog<number>(createStore('test-daily', null));
    log.record('2026-10-05', 2);
    log.record('2026-10-04', 1);
    expect(log.entries().map((entry) => entry.key)).toEqual(['2026-10-04', '2026-10-05']);
    expect(log.streak('2026-10-06')).toEqual({ current: 2, best: 2 });
    expect(log.has('2026-10-05')).toBe(true);
  });

  it('survives damaged storage', () => {
    const store = createStore('test-daily', null);
    store.set('daily', ['broken']);
    expect(createDailyLog(store).entries()).toEqual([]);
  });
});

describe('monthGrid', () => {
  it('lays a month out in Monday-first weeks', () => {
    // October 2026 starts on a Thursday.
    const weeks = monthGrid(2026, 9);
    expect(weeks[0]).toEqual([
      null,
      null,
      null,
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
    expect(weeks.at(-1)).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      null,
    ]);
    expect(weeks.flat().filter(Boolean)).toHaveLength(31);
  });
});

describe('sharing', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the share sheet when there is one', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share });
    expect(await shareText('Daily #7')).toBe('shared');
    expect(share).toHaveBeenCalledWith({ text: 'Daily #7' });
  });

  it('treats a dismissed sheet as cancelled', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('no', 'AbortError'));
    vi.stubGlobal('navigator', { share });
    expect(await shareText('Daily #7')).toBe('cancelled');
  });

  it('copies when there is no share sheet, and reports a refusal', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(await shareText('Daily #7')).toBe('copied');
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error()) },
    });
    expect(await copyText('Daily #7')).toBe('failed');
  });
});
