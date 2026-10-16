import { describe, expect, it } from 'vitest';
import type { CpuLevel } from '../engine/world';
import {
  SORTIE_MISSIONS,
  buildSortie,
  parseSortieCode,
  sortieCode,
  sortieProblems,
  type EnemyOrigin,
  type SortieBase,
  type SortieOptions,
} from './sortie';

const BASE: SortieOptions = {
  base: 'carrier',
  mission: 'land-strike',
  enemy: 'both',
  seaState: 1,
  hour: 'day',
  level: 'normal',
  theme: 'great-war',
  seed: 42,
};

const BASES: readonly SortieBase[] = ['carrier', 'airfield'];
const ORIGINS: readonly EnemyOrigin[] = ['land', 'sea', 'both'];
const LEVELS: readonly CpuLevel[] = ['easy', 'normal', 'hard', 'brutal'];

describe('Custom Sortie', () => {
  // 1,350 sorties take a couple of seconds alone, longer beside the whole suite.
  it('builds a fair mission for every choice, over many seeds', () => {
    let built = 0;
    for (const mission of SORTIE_MISSIONS) {
      for (const base of BASES) {
        for (const enemy of ORIGINS) {
          for (let seed = 1; seed <= 25; seed++) {
            const sortie = buildSortie({
              ...BASE,
              mission: mission.id,
              base,
              enemy,
              level: LEVELS[seed % LEVELS.length] as CpuLevel,
              seaState: (seed % 3) as 0 | 1 | 2,
              seed: seed * 7919,
            });
            expect(sortieProblems(sortie)).toEqual([]);
            built += 1;
          }
        }
      }
    }
    expect(built).toBe(SORTIE_MISSIONS.length * BASES.length * ORIGINS.length * 25);
  }, 30_000);

  it('builds the same mission from the same choices and seed', () => {
    expect(buildSortie(BASE)).toEqual(buildSortie(BASE));
    expect(buildSortie({ ...BASE, seed: 43 }).map).not.toEqual(buildSortie(BASE).map);
  });

  it('turns the coast round for some seeds', () => {
    const sides = new Set(
      Array.from({ length: 20 }, (_, seed) => {
        const map = buildSortie({ ...BASE, seed }).map;
        const enemyField = map.bases.find((base) => base.side === 1);
        return (enemyField?.x ?? 0) < 1500 ? 'west' : 'east';
      }),
    );
    expect(sides).toEqual(new Set(['west', 'east']));
  });

  it('settles choices a mission makes for itself', () => {
    expect(buildSortie({ ...BASE, mission: 'dogfight-carrier', enemy: 'land' }).options.enemy).toBe(
      'sea',
    );
    expect(buildSortie({ ...BASE, mission: 'night-landing', hour: 'day' }).night).toBe(true);
  });

  it('writes its choices into a short code and reads them back', () => {
    const options: SortieOptions = {
      base: 'airfield',
      mission: 'recon',
      enemy: 'sea',
      seaState: 2,
      hour: 'dusk',
      level: 'brutal',
      theme: 'airshow',
      seed: 3_000_000_123,
    };
    const code = sortieCode(options);
    expect(code).toMatch(/^[a-z0-9]{7}-[0-9a-z]+$/);
    expect(parseSortieCode(code)).toEqual(options);
    expect(parseSortieCode('nonsense')).toBeNull();
    expect(parseSortieCode('cz l1dng-zz')).toBeNull();
  });
});
