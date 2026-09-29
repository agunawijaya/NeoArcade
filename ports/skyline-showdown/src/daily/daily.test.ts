import { addDays } from '@shared/daily';
import { describe, expect, it } from 'vitest';
import { previewTurn, takeTurn } from '../engine/match';
import {
  DAILY,
  DAILY_LAUNCH,
  DAILY_THROWS,
  dailyFor,
  dailySkyline,
  outcomeOf,
  resumeDaily,
  sanitiseAims,
  shareLine,
  startDaily,
  windText,
  type DailyResult,
} from './daily';

const miss = { angle: 170, velocity: 200 };

/** Angles a patient player would try: 45° first, then further and further from it. */
const ANGLES = Array.from(
  { length: 29 },
  (_, index) => 45 + (index % 2 ? 1 : -1) * Math.ceil(index / 2) * 2.5,
);

/** A first throw that hits the target, if there is one. */
function firstHit(state: ReturnType<typeof startDaily>) {
  for (const angle of ANGLES) {
    for (let velocity = 5; velocity <= 200; velocity++) {
      if (previewTurn(state, { angle, velocity }).victim === 1) return { angle, velocity };
    }
  }
  return null;
}

describe('the Daily Skyline', () => {
  it('is the same for everyone on a UTC date, and new the next day', () => {
    const jakarta = dailyFor(new Date('2026-10-04T23:30:00+07:00'));
    const lisbon = dailyFor(new Date('2026-10-04T17:10:00+01:00'));
    expect(jakarta.day.key).toBe('2026-10-04');
    expect(lisbon).toEqual(jakarta);
    expect(startDaily(lisbon).round.terrain).toEqual(startDaily(jakarta).round.terrain);
    expect(dailyFor(new Date('2026-10-05T00:00:01Z')).roundSeed).not.toBe(jakarta.roundSeed);
  });

  it('counts from the launch, and never shows a daily before #1', () => {
    expect(dailyFor(new Date(`${DAILY_LAUNCH}T12:00:00Z`)).day.number).toBe(1);
    expect(dailyFor(new Date('2026-10-08T12:00:00Z')).day.number).toBe(10);
    expect(dailyFor(new Date('2020-01-01T12:00:00Z')).day.number).toBe(1);
  });

  it('can be won with the very first throw, every day of its first four months', () => {
    for (let offset = 0; offset < 120; offset++) {
      const daily = dailySkyline(DAILY.forKey(addDays(DAILY_LAUNCH, offset)));
      expect(firstHit(startDaily(daily)), daily.day.key).not.toBeNull();
    }
  }, 120_000);

  it('visits every world and every light twist, and never hides the wind', () => {
    const worlds = new Set<string>();
    const twists = new Set<string>();
    for (let offset = 0; offset < 120; offset++) {
      const daily = dailySkyline(DAILY.forKey(addDays(DAILY_LAUNCH, offset)));
      worlds.add(daily.world);
      twists.add(daily.twist);
      if (daily.world === 'moon')
        expect(['gusts', 'jetStream', 'dustDevil']).not.toContain(daily.twist);
    }
    expect(worlds.size).toBe(4);
    expect(twists).not.toContain('hiddenWind');
    expect(twists).not.toContain('lightning');
    expect(twists.size).toBeGreaterThanOrEqual(6);
  });
});

describe('an attempt', () => {
  const daily = dailySkyline(DAILY.forKey('2026-10-04'));

  it('never passes the turn to the target, and ends after ten misses', () => {
    const state = startDaily(daily);
    for (let throwNumber = 1; throwNumber <= DAILY_THROWS; throwNumber++) {
      expect(state.turn).toBe(0);
      expect(outcomeOf(state)).toBeNull();
      takeTurn(state, miss);
    }
    expect(outcomeOf(state)).toBe('outOfThrows');
  });

  it('ends with a hit, or with a banana on your own head', () => {
    const hitting = startDaily(daily);
    takeTurn(hitting, miss);
    takeTurn(hitting, firstHit(hitting) ?? miss);
    expect(outcomeOf(hitting)).toBe('hit');
    const clumsy = startDaily(daily);
    takeTurn(clumsy, { angle: 45, velocity: 1 });
    expect(outcomeOf(clumsy)).toBe('selfHit');
  });

  it('picks up exactly where it was left', () => {
    const played = startDaily(daily);
    const aims = [miss, { angle: 60, velocity: 55 }, { angle: 38.7, velocity: 71 }];
    for (const aim of aims) takeTurn(played, aim);
    const { state, results } = resumeDaily(daily, aims);
    expect(results).toHaveLength(3);
    expect(state.round.terrain).toEqual(played.round.terrain);
    expect(state.round.wind).toBe(played.round.wind);
    expect(state.round.throws).toBe(3);
  });

  it('trusts only well-formed stored aims', () => {
    expect(sanitiseAims([[45, 60], [1], 'x', [Number.NaN, 3], [30, 70]])).toEqual([
      [45, 60],
      [30, 70],
    ]);
    expect(sanitiseAims(null)).toEqual([]);
  });
});

describe('the share line', () => {
  const mars = { ...dailySkyline(DAILY.forKey('2026-10-04')), world: 'mars' as const };
  const result = (outcome: DailyResult['outcome'], throws: number): DailyResult => ({
    outcome,
    throws,
    aims: Array.from({ length: throws }, () => [47.3, 61] as [number, number]),
  });

  it('reads like the brief', () => {
    const numbered = { ...mars, day: { ...mars.day, number: 142 } };
    expect(shareLine(numbered, -3, result('hit', 4))).toBe(
      'Skyline Showdown · Daily #142 · Mars 🌬️ ←3\n🍌🍌🍌💥  4/10',
    );
  });

  it('shows a loss without a score, and a self-hit as a monkey covering its eyes', () => {
    expect(shareLine(mars, 5, result('outOfThrows', 10)).split('\n')[1]).toBe(
      `${'🍌'.repeat(10)}  X/10`,
    );
    expect(shareLine(mars, 0, result('selfHit', 3))).toContain('🍌🍌🍌🙈  X/10');
    expect(windText(0)).toBe('calm');
    expect(windText(5)).toBe('→5');
  });

  it('gives nothing away: no angles, no powers', () => {
    const line = shareLine(mars, -3, result('hit', 2));
    expect(line).not.toMatch(/47|61/);
  });
});
