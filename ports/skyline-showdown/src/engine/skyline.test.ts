import { createRng } from '@shared/rng';
import { describe, expect, it } from 'vitest';
import { STREET_Y, WORLD_WIDTH } from './constants';
import { placeGorillas } from './gorillas';
import { makeSkyline, pickSlopePattern, type Building, type SlopePattern } from './skyline';
import { rollWind } from './wind';

const SEEDS = Array.from({ length: 300 }, (_, index) => index + 1);
const height = (building: Building) => STREET_Y - building.top;
const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

/** Mean heights of the left third, middle third and right third of many cities. */
function profile(pattern: SlopePattern) {
  const thirds: [number[], number[], number[]] = [[], [], []];
  for (const seed of SEEDS) {
    for (const building of makeSkyline(createRng(seed), pattern).buildings) {
      const centre = building.x + building.width / 2;
      const third = Math.min(2, Math.floor((centre / WORLD_WIDTH) * 3)) as 0 | 1 | 2;
      thirds[third].push(height(building));
    }
  }
  return thirds.map(average) as [number, number, number];
}

describe('makeSkyline', () => {
  it('fills the screen left to right with 38–74 wide buildings two units apart', () => {
    for (const seed of SEEDS) {
      const { buildings } = makeSkyline(createRng(seed));
      expect(buildings[0]?.x).toBe(2);
      buildings.forEach((building, index) => {
        const next = buildings[index + 1];
        if (next) {
          expect(next.x).toBe(building.x + building.width + 2);
          expect(building.width).toBeGreaterThanOrEqual(38);
          expect(building.width).toBeLessThanOrEqual(74);
        }
      });
      const last = buildings.at(-1) as Building;
      expect(last.x + last.width).toBeLessThanOrEqual(WORLD_WIDTH);
      expect(last.x + last.width + 2).toBeGreaterThan(WORLD_WIDTH - 10);
    }
  });

  it('keeps every building between 10 units and gorilla-safe height', () => {
    for (const seed of SEEDS) {
      for (const building of makeSkyline(createRng(seed), 'v').buildings) {
        expect(height(building)).toBeGreaterThanOrEqual(10);
        expect(building.top).toBeGreaterThanOrEqual(35);
      }
    }
  });

  it('rises for the upward pattern and falls for the downward one', () => {
    const [left, , right] = profile('upward');
    expect(right).toBeGreaterThan(left + 40);
    const [downLeft, , downRight] = profile('downward');
    expect(downLeft).toBeGreaterThan(downRight + 40);
  });

  it('peaks in the middle for "V" and dips in the middle for inverted "V"', () => {
    const [left, middle, right] = profile('v');
    expect(middle).toBeGreaterThan(left + 30);
    expect(middle).toBeGreaterThan(right + 30);

    const [invertedLeft, invertedMiddle, invertedRight] = profile('invertedV');
    expect(invertedMiddle).toBeLessThan(invertedLeft - 30);
    expect(invertedMiddle).toBeLessThan(invertedRight - 30);
  });

  it('picks "V" half the time and each other pattern a sixth of the time', () => {
    const counts = new Map<SlopePattern, number>();
    const rng = createRng(99);
    for (let i = 0; i < 12_000; i++) {
      const pattern = pickSlopePattern(rng);
      counts.set(pattern, (counts.get(pattern) ?? 0) + 1);
    }
    expect((counts.get('v') ?? 0) / 12_000).toBeCloseTo(1 / 2, 1);
    for (const pattern of ['upward', 'downward', 'invertedV'] as const) {
      expect((counts.get(pattern) ?? 0) / 12_000).toBeCloseTo(1 / 6, 1);
    }
  });

  it('darkens about one window in four and keeps windows on their building', () => {
    let lit = 0;
    let total = 0;
    for (const seed of SEEDS.slice(0, 50)) {
      for (const building of makeSkyline(createRng(seed)).buildings) {
        for (const window of building.windows) {
          total++;
          if (window.lit) lit++;
          expect(window.x).toBeGreaterThanOrEqual(building.x);
          expect(window.y).toBeGreaterThanOrEqual(building.top);
          expect(window.y + window.height).toBeLessThanOrEqual(STREET_Y);
        }
      }
    }
    expect(lit / total).toBeCloseTo(0.75, 1);
  });

  it('builds the same city from the same seed', () => {
    expect(makeSkyline(createRng(1990))).toEqual(makeSkyline(createRng(1990)));
  });
});

describe('rollWind', () => {
  it('stays within the original range and averages a slight breeze to the right', () => {
    const rng = createRng(5);
    const winds = Array.from({ length: 30_000 }, () => rollWind(rng));
    expect(Math.min(...winds)).toBeGreaterThanOrEqual(-14);
    expect(Math.max(...winds)).toBeLessThanOrEqual(15);
    expect(average(winds)).toBeCloseTo(0.5, 0);
  });

  it('is calm sometimes and gusty about a third of the time', () => {
    const rng = createRng(6);
    const winds = Array.from({ length: 30_000 }, () => rollWind(rng));
    const calm = winds.filter((wind) => wind === 0).length / winds.length;
    const gusty = winds.filter((wind) => wind > 5 || wind < -4).length / winds.length;
    // Calm needs a base of 0 (1 in 10) and no gust (2 in 3).
    expect(calm).toBeCloseTo(0.1 * (2 / 3), 2);
    expect(gusty).toBeGreaterThan(0.25);
    expect(gusty).toBeLessThan(1 / 3);
  });
});

describe('placeGorillas', () => {
  it('stands player 1 on the 2nd or 3rd building and player 2 on the 2nd or 3rd from the right', () => {
    const seen = [new Set<number>(), new Set<number>()];
    for (const seed of SEEDS) {
      const rng = createRng(seed);
      const { buildings } = makeSkyline(rng);
      const [left, right] = placeGorillas(buildings, rng);
      const last = buildings.length - 1;
      expect([1, 2]).toContain(left.building);
      expect([last - 1, last - 2]).toContain(right.building);
      seen[0]?.add(left.building);
      seen[1]?.add(last - right.building);

      for (const gorilla of [left, right]) {
        const roof = buildings[gorilla.building] as Building;
        const next = buildings[gorilla.building + 1] as Building;
        expect(gorilla.y + 30).toBe(roof.top);
        expect(Math.abs(gorilla.x + 14 - (roof.x + (next.x - roof.x) / 2))).toBeLessThanOrEqual(
          0.5,
        );
      }
    }
    expect(seen[0]).toEqual(new Set([1, 2]));
    expect(seen[1]).toEqual(new Set([1, 2]));
  });
});
