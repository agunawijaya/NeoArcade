import { describe, expect, it } from 'vitest';
import { recordEmblem } from './emblem-pen';
import { glyphs } from './glyphs';
import { badgeXp, definePassManifest, manifestProblems, TIER_XP } from './manifest';
import { testManifest } from './test-helpers';

const goodBadge = {
  id: 'first-win',
  name: 'First Win',
  description: 'Won a match.',
  hint: 'Win any match.',
  tier: 'bronze',
  emblem: glyphs.star,
};

describe('manifestProblems', () => {
  it('accepts a well-formed manifest', () => {
    expect(manifestProblems(testManifest)).toEqual([]);
  });

  it('finds duplicate ids everywhere', () => {
    const problems = manifestProblems({
      game: 'test-game',
      badges: [goodBadge, goodBadge],
      cosmetics: [
        { id: 'hat', name: 'Hat', kind: 'Hat', unlock: { level: 2 } },
        { id: 'hat', name: 'Hat', kind: 'Hat', unlock: { level: 3 } },
      ],
      stats: [
        { key: 'wins', label: 'Wins' },
        { key: 'wins', label: 'Wins again' },
      ],
    });
    expect(problems).toEqual([
      'badge first-win: the id is used twice.',
      'cosmetic hat: the id is used twice.',
      'stat wins: the key is used twice.',
    ]);
  });

  it('names every missing or broken field', () => {
    const problems = manifestProblems({
      game: 'Not A Slug',
      badges: [
        { id: 'no-hint', name: 'No hint', description: 'x', tier: 'gold', emblem: glyphs.star },
        { id: 'Bad Id', name: '', description: '', tier: 'platinum', emblem: 'star' },
        { ...goodBadge, id: 'counted', target: 1, xp: 9000 },
        { ...goodBadge, id: 'blank', emblem: () => {} },
        {
          ...goodBadge,
          id: 'broken',
          emblem: () => {
            throw new Error('no pen today');
          },
        },
      ],
      cosmetics: [{ id: 'cape', name: 'Cape', kind: 'Cape', unlock: { badge: 'nope' } }],
    });
    expect(problems).toContain('`game` must be the port slug.');
    expect(problems).toContain(
      'badge no-hint: `hint` is missing or longer than 120 characters (only secret badges go without).',
    );
    expect(problems.filter((problem) => problem.startsWith('badge Bad Id:'))).toHaveLength(6);
    expect(problems).toContain('badge counted: `xp` must be a whole number from 0 to 300.');
    expect(problems).toContain('badge counted: `target` must be a whole number of 2 or more.');
    expect(problems).toContain('badge blank: `emblem` draws nothing.');
    expect(problems).toContain('badge broken: `emblem` throws: no pen today');
    expect(problems).toContain(
      'cosmetic cape: `unlock.badge` must name one of this manifest’s badges.',
    );
  });

  it('lets secret badges go without a hint', () => {
    const secret = { ...goodBadge, tier: 'secret', hint: undefined };
    expect(manifestProblems({ game: 'test-game', badges: [secret] })).toEqual([]);
  });

  it('rejects things that are not manifests', () => {
    expect(manifestProblems(null)).toHaveLength(1);
    expect(manifestProblems({ game: 'test-game', badges: [] })).toEqual([
      '`badges` must list at least one badge.',
    ]);
    expect(manifestProblems({ game: 'test-game', badges: [goodBadge], stats: 'wins' })).toEqual([
      '`stats` must be a list.',
    ]);
  });
});

describe('definePassManifest', () => {
  it('fills in the optional lists', () => {
    const manifest = definePassManifest({ game: 'tiny', badges: [goodBadge as never] });
    expect(manifest.cosmetics).toEqual([]);
    expect(manifest.stats).toEqual([]);
  });
});

describe('badge XP', () => {
  it('defaults by tier and follows the manifest when set', () => {
    expect(badgeXp(testManifest.badges[0]!)).toBe(TIER_XP.bronze);
    expect(badgeXp(testManifest.badges[3]!)).toBe(200);
  });
});

describe('glyphs', () => {
  it('all draw inside the grid', () => {
    for (const [name, glyph] of Object.entries(glyphs)) {
      const shapes = recordEmblem(glyph);
      expect(shapes.length, name).toBeGreaterThan(0);
      for (const shape of shapes) {
        const numbers =
          shape.kind === 'path'
            ? []
            : shape.kind === 'polygon'
              ? shape.points.split(/[ ,]/).map(Number)
              : shape.kind === 'circle'
                ? [shape.cx - shape.r, shape.cx + shape.r, shape.cy - shape.r, shape.cy + shape.r]
                : [shape.x, shape.y, shape.x + shape.width, shape.y + shape.height];
        for (const value of numbers) {
          expect(value, name).toBeGreaterThanOrEqual(0);
          expect(value, name).toBeLessThanOrEqual(64);
        }
      }
    }
  });
});
