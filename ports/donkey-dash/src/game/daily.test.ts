import { describe, expect, it } from 'vitest';
import { createRun } from '../engine/run';
import { dailyRun } from '../engine/modes';
import { DAILY_RULES } from '../engine/modes';
import { DAILY, dailyResultOf, isDailyResult, rulesOf, shareText, stripOf } from './daily';

describe('Daily Road', () => {
  it('is number 1 on launch day, the same road for everyone that UTC day', () => {
    expect(DAILY.forKey('2026-09-28').number).toBe(1);
    expect(DAILY.on(new Date('2026-10-01T23:59:00Z')).seed).toBe(
      DAILY.on(new Date('2026-10-01T00:01:00Z')).seed,
    );
  });

  it('shares a spoiler-free line: distance, crashes and ten squares', () => {
    const run = createRun(dailyRun(DAILY.forKey('2026-11-03').seed));
    run.drive.car.nose = run.drive.road.finish! * 0.55;
    run.segments[1]!.nearMisses = 2;
    run.segments[3]!.crashes = 1;
    run.stats.crashes = 2;
    run.segments[5]!.crashes = 1;
    expect(stripOf(run)).toBe('🟩✨🟩💥🟩💥⬜⬜⬜⬜');
    const text = shareText(DAILY.forKey('2026-11-03'), dailyResultOf(run));
    const metres = Math.floor(run.drive.road.finish! * 0.55).toLocaleString('en');
    expect(text).toBe(`Donkey Dash · Daily #37 🚗💨 2 🫏💥 · ${metres} m\n🟩✨🟩💥🟩💥⬜⬜⬜⬜`);
    expect(text).not.toMatch(/lane|left|right/i);
  });

  it('keeps counting through a change of rules, and keeps the old results as they were', () => {
    // The shifting road arrived on day 18; days before it still read as records.
    expect(DAILY.forKey('2026-10-15').number).toBe(18);
    const before = {
      metres: 1840,
      crashes: 1,
      finished: false,
      score: 2210,
      strip: '🟩🟩💥⬜⬜⬜⬜⬜⬜⬜',
    };
    expect(isDailyResult(before)).toBe(true);
    expect(rulesOf(before)).toBe(1);
    expect(rulesOf(dailyResultOf(createRun(dailyRun(5))))).toBe(DAILY_RULES);
    expect(DAILY_RULES).toBe(2);
  });

  it('flies the chequered flag for a finished road', () => {
    const run = createRun(dailyRun(5));
    run.phase = { kind: 'over', reason: 'finish' };
    run.drive.car.nose = run.drive.road.finish! + 3;
    const result = dailyResultOf(run);
    expect(result.finished).toBe(true);
    expect(shareText(DAILY.forKey('2026-09-29'), result)).toContain('Daily #2 🏁 0 🫏💥');
  });
});
