import { describe, expect, it } from 'vitest';
import { cappedXp, DAILY_XP_BANDS, grantedForDay, localDay, MAX_AWARD } from './daily-cap';
import {
  levelForXp,
  levelProgress,
  nextRank,
  RANKS,
  rankForLevel,
  STEADY_XP_PER_LEVEL,
  XP_TO_NEXT_LEVEL,
  xpForLevel,
} from './levels';

describe('the XP curve', () => {
  it('matches the documented milestones', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(150);
    expect(xpForLevel(5)).toBe(1200);
    expect(xpForLevel(10)).toBe(4950);
    expect(xpForLevel(15)).toBe(10450);
    expect(xpForLevel(20)).toBe(17200);
    expect(xpForLevel(30)).toBe(32200);
  });

  it('never gets cheaper, and is flat from level 20', () => {
    for (let index = 1; index < XP_TO_NEXT_LEVEL.length; index++) {
      expect(XP_TO_NEXT_LEVEL[index]).toBeGreaterThanOrEqual(XP_TO_NEXT_LEVEL[index - 1]!);
    }
    expect(xpForLevel(41) - xpForLevel(40)).toBe(STEADY_XP_PER_LEVEL);
    expect(STEADY_XP_PER_LEVEL).toBeGreaterThanOrEqual(XP_TO_NEXT_LEVEL.at(-1)!);
  });

  it('reaches level 2 inside one good session', () => {
    // A good first session: a few full matches, a couple of wins, two bronze badges.
    const session = 4 * 10 + 2 * 40 + 2 * 25;
    expect(levelForXp(session)).toBeGreaterThanOrEqual(2);
  });

  it('keeps the top ranks weeks away, even at the daily cap', () => {
    const bestDay = grantedForDay(Infinity);
    const daysToLegend = xpForLevel(rankForLevel(30).fromLevel) / bestDay;
    expect(daysToLegend).toBeGreaterThan(21);
  });

  it('converts XP to levels and back at every boundary', () => {
    for (let level = 1; level <= 60; level++) {
      expect(levelForXp(xpForLevel(level))).toBe(level);
      if (level > 1) expect(levelForXp(xpForLevel(level) - 1)).toBe(level - 1);
    }
    expect(levelForXp(-50)).toBe(1);
  });

  it('reports progress inside a level', () => {
    expect(levelProgress(1200 + 275)).toEqual({
      level: 5,
      xpIntoLevel: 275,
      xpForNextLevel: 550,
      fraction: 0.5,
    });
  });
});

describe('ranks', () => {
  it('are ordered and start at level 1', () => {
    expect(RANKS[0]?.fromLevel).toBe(1);
    const starts = RANKS.map((rank) => rank.fromLevel);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });

  it('are found by level', () => {
    expect(rankForLevel(1).name).toBe('Coin Slot');
    expect(rankForLevel(4).name).toBe('Coin Slot');
    expect(rankForLevel(5).name).toBe('Button Masher');
    expect(rankForLevel(29).name).toBe('Cabinet Champion');
    expect(rankForLevel(99).name).toBe('Arcade Legend');
    expect(nextRank(12)?.name).toBe('High Scorer');
    expect(nextRank(30)).toBeNull();
  });
});

describe('the daily cap', () => {
  it('grants full XP up to the first band, then less and less', () => {
    expect(grantedForDay(0)).toBe(0);
    expect(grantedForDay(400)).toBe(400);
    expect(grantedForDay(800)).toBe(600);
    expect(grantedForDay(1800)).toBe(700);
    expect(grantedForDay(2000)).toBe(720);
    expect(grantedForDay(50_000)).toBe(720);
    expect(DAILY_XP_BANDS.at(-1)).toEqual({ upTo: Infinity, rate: 0 });
  });

  it('adds up the same whether XP comes in one award or many', () => {
    let asked = 0;
    let granted = 0;
    for (let award = 0; award < 90; award++) {
      granted += cappedXp(asked, 13);
      asked += 13;
    }
    expect(granted).toBe(Math.round(grantedForDay(asked)));
  });

  it('splits an award that straddles a band', () => {
    expect(cappedXp(380, 40)).toBe(20 + 10);
  });

  it('never lets one award use up the full-rate band', () => {
    expect(MAX_AWARD).toBeLessThan(DAILY_XP_BANDS[0]!.upTo);
  });

  it('uses the local calendar day', () => {
    expect(localDay(new Date('2026-01-05T23:59:00'))).toBe('2026-01-05');
    expect(localDay(new Date('2026-01-06T00:01:00'))).toBe('2026-01-06');
  });
});
