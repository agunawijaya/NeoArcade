import { describe, expect, it } from 'vitest';
import { DAILY, DAILY_LAUNCH, isDailyResult, shareText, type DailyResult } from './daily';

const RESULT: DailyResult = {
  score: 4250,
  won: true,
  targets: 17,
  planesDowned: 3,
  planesLost: 1,
  oxSafe: true,
  seconds: 312,
};

describe('the Daily Sortie', () => {
  it('numbers the days from launch and gives everyone the same seed', () => {
    expect(DAILY.forKey(DAILY_LAUNCH).number).toBe(1);
    const day = DAILY.on(new Date('2026-10-20T12:00:00Z'));
    expect(day.number).toBe(6);
    expect(DAILY.on(new Date('2026-10-20T23:59:00Z')).seed).toBe(day.seed);
    expect(DAILY.on(new Date('2026-10-21T00:01:00Z')).seed).not.toBe(day.seed);
  });

  it('shares a spoiler-free line: a bang per kill, the ox, the sun, the score', () => {
    const day = DAILY.forKey('2026-10-26');
    expect(shareText(day, RESULT)).toBe('Mind the Ox · Daily #12 🛩️💥💥💥🐄✅☀️ 4,250');
    expect(shareText(day, { ...RESULT, won: false, oxSafe: false, planesDowned: 9 })).toBe(
      'Mind the Ox · Daily #12 🛩️💥💥💥💥💥🐄❌ 4,250',
    );
  });

  it('only accepts stored results that have the right shape', () => {
    expect(isDailyResult(RESULT)).toBe(true);
    expect(isDailyResult({ score: 1 })).toBe(false);
    expect(isDailyResult(null)).toBe(false);
  });
});
