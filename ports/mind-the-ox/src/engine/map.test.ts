import { describe, expect, it } from 'vitest';
import { CEILING, OWN_TARGETS, TARGETS_PER_WORLD } from './constants';
import {
  buildMap,
  generateMap,
  mapProblems,
  runwaySpan,
  type MapLayout,
  type MapSpec,
} from './map';
import { flatMap } from './test-worlds';

describe('the battlefield generator', () => {
  it('makes a fair map from every seed it is given', () => {
    for (let seed = 1; seed <= 300; seed++) {
      expect(mapProblems(generateMap({ seed })), `seed ${seed}`).toEqual([]);
    }
  });

  it('gives the same map for the same seed, and a different one for another', () => {
    expect(generateMap({ seed: 42 })).toEqual(generateMap({ seed: 42 }));
    expect(generateMap({ seed: 42 }).heights).not.toEqual(generateMap({ seed: 43 }).heights);
  });

  it('lays out the 1984 battle: home left of centre, three enemy fields, twenty targets, three of them ours behind home', () => {
    const map = generateMap({ seed: 9 });
    const home = map.bases[0];
    expect(home?.side).toBe(0);
    expect(map.bases.filter((base) => base.side === 1)).toHaveLength(3);
    expect(map.targets).toHaveLength(TARGETS_PER_WORLD);
    const own = map.targets.filter((target) => target.side === 0);
    expect(own).toHaveLength(OWN_TARGETS);
    for (const target of own) expect(Math.abs(target.x - (home?.x ?? 0))).toBeLessThan(400);
    expect(map.targets.filter((target) => target.kind === 'depot').length).toBe(4);
    expect(map.oxen).toHaveLength(2);
    expect(map.flocks).toHaveLength(4);
  });

  it('puts every runway on level ground and walls the world in with mountains', () => {
    const map = generateMap({ seed: 5 });
    for (const base of map.bases) {
      const { left, right } = runwaySpan(base);
      const heights = map.heights.slice(Math.round(left), Math.round(right) + 1);
      expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(0.5);
    }
    expect(map.heights[0]).toBeGreaterThan(CEILING);
    expect(map.heights[map.width - 1]).toBeGreaterThan(CEILING);
  });

  it('stretches to a wider world', () => {
    const map = generateMap({ seed: 3, width: 3600 });
    expect(map.width).toBe(3600);
    expect(mapProblems(map)).toEqual([]);
  });
});

describe('the other layouts', () => {
  it.each(['coop', 'versus', 'dogfight'] as MapLayout[])(
    'are fair from every seed (%s)',
    (layout) => {
      for (let seed = 1; seed <= 120; seed++) {
        expect(mapProblems(generateMap({ seed, layout })), `${layout} seed ${seed}`).toEqual([]);
      }
    },
  );

  it('give co-op two friendly airfields and two enemy ones', () => {
    const map = generateMap({ seed: 4, layout: 'coop' });
    expect(map.bases.map((base) => base.side)).toEqual([0, 0, 1, 1]);
    expect(map.targets.filter((target) => target.side === 1)).toHaveLength(17);
  });

  it('split versus into two halves of ten targets, the oxen in no man’s land', () => {
    const map = generateMap({ seed: 4, layout: 'versus' });
    const middle = map.width / 2;
    expect(map.bases.map((base) => base.side)).toEqual([0, 1]);
    for (const target of map.targets) {
      expect(target.side === 0 ? target.x < middle : target.x > middle).toBe(true);
    }
    expect(map.targets.filter((target) => target.kind === 'depot')).toHaveLength(4);
    for (const ox of map.oxen) expect(Math.abs(ox - middle)).toBeLessThan(60);
  });

  it('leave the targets out of a dogfight but keep the oxen and the birds', () => {
    const map = generateMap({ seed: 4, layout: 'dogfight' });
    expect(map.targets).toHaveLength(0);
    expect(map.oxen).toHaveLength(2);
    expect(map.flocks).toHaveLength(4);
  });
});

describe('hand-designed maps', () => {
  const spec: MapSpec = {
    name: 'Test valley',
    seed: 7,
    ground: [
      [0, 40],
      [1500, 60],
      [3000, 40],
    ],
    bases: [
      { side: 0, x: 1100, facing: 1 },
      { side: 1, x: 2100, facing: -1 },
    ],
    targets: [
      { kind: 'hangar', side: 0, x: 900 },
      { kind: 'tank', side: 0, x: 950 },
      { kind: 'depot', side: 0, x: 1000 },
      ...Array.from({ length: 17 }, (_, index) => ({
        kind: 'factory' as const,
        side: 1 as const,
        x: 300 + index * 34 + (index > 8 ? 1700 : 0),
      })),
    ],
    oxen: [1400, 1500],
  };

  it('level the ground under everything placed on the land', () => {
    expect(mapProblems(buildMap(spec))).toEqual([]);
  });

  it('refuse a spec that would be unfair', () => {
    expect(() => buildMap({ ...spec, targets: spec.targets.slice(1) })).toThrow(
      /must have 3 targets|there must be 20 targets/,
    );
  });
});

describe('the fairness check', () => {
  it('rejects a target in a ravine, a crooked runway and a crowded field', () => {
    const map = flatMap({
      targets: [
        { kind: 'hangar', side: 1, x: 700 },
        { kind: 'tank', side: 1, x: 708 },
      ],
    });
    for (let x = 640; x < 690; x++) map.heights[x] = 120;
    map.heights[420] = 44;
    const problems = mapProblems(map).join('\n');
    expect(problems).toMatch(/ravine/);
    expect(problems).toMatch(/runway at 400 is not level/);
    expect(problems).toMatch(/crowd/);
  });
});
