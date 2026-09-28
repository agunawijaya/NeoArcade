import { describe, expect, it } from 'vitest';
import { playStage, playTour } from '../../test/tour-sim';
import { STAGES, stagesIn } from './stages';

/**
 * The World Tour's tuning, checked against a stand-in "decent human" (see
 * test/tour-sim.ts): every stage can be won, Earth's cities are friendly
 * enough to learn on, and the time estimates land where the design wants
 * them: Earth in about half an hour to three quarters, the whole tour in a
 * few sessions.
 */
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

describe('World Tour tuning', () => {
  it('lets a decent player win every stage, and most Earth cities more often than not', () => {
    for (const stage of STAGES) {
      const runs = Array.from({ length: 40 }, (_, index) => playStage(stage, 500 + index * 31));
      const winRate = runs.filter((run) => run.won).length / runs.length;
      expect(winRate, stage.id).toBeGreaterThan(0.15);
      if (stage.chapter === 'earth' && !stage.boss) expect(winRate, stage.id).toBeGreaterThan(0.4);
    }
  }, 60_000);

  it('takes about half an hour to three quarters for Earth, and a few sessions for the tour', () => {
    const journeys = Array.from({ length: 15 }, (_, index) => playTour(80 + index));
    const minutes = (chapter: 'earth' | 'jupiter') =>
      median(journeys.map((journey) => (journey.finished[chapter] ?? Infinity) / 60));
    expect(minutes('earth')).toBeGreaterThan(25);
    expect(minutes('earth')).toBeLessThan(50);
    expect(minutes('jupiter')).toBeGreaterThan(90);
    expect(minutes('jupiter')).toBeLessThan(300);
    for (const journey of journeys) {
      expect(journey.save.stages[stagesIn('jupiter').at(-1)!.id]?.won).toBe(true);
    }
  }, 120_000);
});
