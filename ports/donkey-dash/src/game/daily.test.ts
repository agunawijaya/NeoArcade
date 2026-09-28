import { describe, expect, it } from 'vitest';
import { createRun } from '../engine/run';
import { dailyRun } from '../engine/modes';
import { DAILY, dailyResultOf, shareText, stripOf } from './daily';

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

  it('flies the chequered flag for a finished road', () => {
    const run = createRun(dailyRun(5));
    run.phase = { kind: 'over', reason: 'finish' };
    run.drive.car.nose = run.drive.road.finish! + 3;
    const result = dailyResultOf(run);
    expect(result.finished).toBe(true);
    expect(shareText(DAILY.forKey('2026-09-29'), result)).toContain('Daily #2 🏁 0 🫏💥');
  });
});
