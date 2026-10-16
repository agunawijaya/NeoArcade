import { describe, expect, it } from 'vitest';
import { buildMap } from '../engine/map';
import { SEA_CHAPTERS } from './at-sea';

describe('the At Sea campaign', () => {
  it('has eight missions with their own ids', () => {
    expect(SEA_CHAPTERS).toHaveLength(8);
    expect(new Set(SEA_CHAPTERS.map((chapter) => chapter.id)).size).toBe(8);
  });

  it.each(SEA_CHAPTERS.map((chapter) => [chapter.id, chapter] as const))(
    '%s builds a fair coast, flown from our carrier',
    (_, chapter) => {
      const map = buildMap(chapter.map);
      const home = map.bases[0];
      expect(home?.side).toBe(0);
      expect(home?.carrier).toBeDefined();
      expect(map.fleet[home?.carrier ?? -1]?.kind).toBe('carrier');
      for (const enemy of chapter.enemies) expect(map.bases[enemy.base]?.side).toBe(1);
      expect(chapter.objectives.length).toBeGreaterThan(0);
      if (chapter.objectives.includes('gates')) expect(map.gates.length).toBeGreaterThan(0);
      if (chapter.objectives.includes('raiders')) expect(map.raids.length).toBeGreaterThan(0);
      if (chapter.objectives.includes('escort'))
        expect(map.fleet.some((ship) => ship.side === 0 && ship.convoy && ship.bound)).toBe(true);
      if (chapter.objectives.includes('targets')) {
        const enemy = map.targets.filter((target) => target.side === 1).length;
        const ships = map.fleet.filter((ship) => ship.side === 1).length;
        expect(enemy + ships).toBeGreaterThan(0);
      }
    },
  );
});
