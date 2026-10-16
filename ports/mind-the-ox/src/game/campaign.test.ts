import { describe, expect, it } from 'vitest';
import { buildMap, mapProblems } from '../engine/map';
import { THEMES, THEME_IDS } from '../themes';
import { CHAPTERS, goalLabel, TOTAL_STARS } from './campaign';

describe('the campaign', () => {
  it('has eight chapters, one for each twist, and three stars in each', () => {
    expect(CHAPTERS).toHaveLength(8);
    expect(new Set(CHAPTERS.map((chapter) => chapter.twist)).size).toBe(8);
    expect(TOTAL_STARS).toBe(24);
  });

  it.each(CHAPTERS.map((chapter) => [chapter.id, chapter] as const))(
    'builds a fair hand-drawn map for %s',
    (_id, chapter) => {
      const map = buildMap(chapter.map);
      expect(mapProblems(map)).toEqual([]);
      if (chapter.ace) expect(map.bases.filter((base) => base.side === 1)).toHaveLength(4);
    },
  );

  it('speaks in every theme’s own voice', () => {
    for (const chapter of CHAPTERS) {
      for (const theme of THEME_IDS) {
        expect(chapter.title[theme].length).toBeGreaterThan(2);
        expect(chapter.briefing[theme].length).toBeGreaterThan(60);
        for (const goal of chapter.stars) expect(goalLabel(goal, THEMES[theme])).not.toMatch(/\{/);
      }
    }
  });
});
