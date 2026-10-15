import { describe, expect, it } from 'vitest';
import { createDailyLog } from '@shared/daily';
import { createStore, type Store } from '@shared/storage';
import type { GameEntry } from './catalog';
import { nextDaily, readDailies } from './today';

const haul = {
  slug: 'long-haul',
  title: 'Long Haul',
  daily: {
    name: 'Daily Haul',
    launch: '2026-10-04',
    mode: 'daily',
    results: [{ when: { outcome: 'crashed' }, text: 'Lost the rig' }, { text: 'Delivered' }],
  },
} as GameEntry;
const road = {
  slug: 'donkey-dash',
  title: 'Donkey Dash',
  daily: { name: 'Daily Road', launch: '2026-09-28', mode: 'daily', log: 'road-log' },
} as GameEntry;
const noDaily = { slug: 'skyline-showdown', title: 'Skyline Showdown' } as GameEntry;

function stores() {
  const made = new Map<string, Store>();
  return (slug: string) => {
    if (!made.has(slug)) made.set(slug, createStore(`test-today-${slug}`, null));
    return made.get(slug) as Store;
  };
}

const morning = new Date('2026-10-15T08:30:00Z');

describe('readDailies', () => {
  it('lists every game with a daily, numbered from its launch, unplayed on a fresh profile', () => {
    expect(readDailies([haul, noDaily, road], morning, stores())).toEqual([
      expect.objectContaining({ number: 12, played: false, result: null, streak: 0 }),
      expect.objectContaining({ number: 18, played: false, result: null, streak: 0 }),
    ]);
  });

  it("reads today's result and the streak from the game's own log", () => {
    const storeFor = stores();
    const log = createDailyLog(storeFor('long-haul'));
    log.record('2026-10-13', { outcome: 'delivered' });
    log.record('2026-10-14', { outcome: 'delivered' });
    log.record('2026-10-15', { outcome: 'crashed' });
    createDailyLog(storeFor('donkey-dash'), 'road-log').record('2026-10-14', { metres: 900 });

    const [haulToday, roadToday] = readDailies([haul, road], morning, storeFor);
    expect(haulToday).toMatchObject({ played: true, result: 'Lost the rig', streak: 3 });
    // Played yesterday, not yet today: the streak is still alive, and there are no words for it.
    expect(roadToday).toMatchObject({ played: false, result: null, streak: 1 });
  });

  it('gives a day before the launch number one', () => {
    const [status] = readDailies([haul], new Date('2026-10-01T12:00:00Z'), stores());
    expect(status?.number).toBe(1);
  });
});

describe('nextDaily', () => {
  it('counts down to the next UTC midnight', () => {
    expect(nextDaily(morning)).toEqual({
      wait: '15 h 30 min',
      at: new Date('2026-10-16T00:00:00Z'),
    });
    expect(nextDaily(new Date('2026-10-15T23:20:00Z')).wait).toBe('40 min');
    expect(nextDaily(new Date('2026-10-15T21:00:00Z')).wait).toBe('3 h');
    expect(nextDaily(new Date('2026-10-15T23:59:30Z')).wait).toBe('under a minute');
  });
});
