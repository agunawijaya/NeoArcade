import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatPlayers, parseCatalog, type GameEntry } from './catalog';

const validGame: GameEntry = {
  slug: 'skyline-showdown',
  title: 'Skyline Showdown',
  tagline: 'Bananas, wind and a city at dusk.',
  original: {
    title: 'QBasic Gorillas',
    author: 'Microsoft Corporation',
    year: 1990,
    platform: 'MS-DOS',
  },
  genres: ['Artillery', 'Duel'],
  players: { min: 1, max: 2 },
  accent: '#ff8a3d',
  path: 'skyline-showdown/',
  cover: 'skyline-showdown',
  docs: { howToPlay: 'docs/HOW-TO-PLAY.md', about: 'docs/ABOUT.md' },
  added: '2026-09-25',
};

describe('parseCatalog', () => {
  it('accepts a well-formed entry', () => {
    expect(parseCatalog([validGame])).toEqual({ games: [validGame], problems: [] });
  });

  it('accepts an empty catalog', () => {
    expect(parseCatalog([])).toEqual({ games: [], problems: [] });
  });

  it('rejects something that is not a list', () => {
    expect(parseCatalog({ games: [] }).problems).toHaveLength(1);
  });

  it('skips broken entries but keeps the good ones, explaining why', () => {
    const broken = {
      ...validGame,
      slug: 'Bad Slug',
      accent: 'orange',
      players: { min: 2, max: 1 },
    };
    const { games, problems } = parseCatalog([broken, validGame]);
    expect(games).toEqual([validGame]);
    expect(problems[0]).toMatch(/^Bad Slug: /);
    expect(problems[0]).toMatch(/slug/);
    expect(problems[0]).toMatch(/accent/);
    expect(problems[0]).toMatch(/players/);
  });

  it('rejects duplicate slugs', () => {
    const { games, problems } = parseCatalog([validGame, validGame]);
    expect(games).toHaveLength(1);
    expect(problems[0]).toMatch(/earlier entry/);
  });

  it('rejects absolute and external paths', () => {
    for (const path of ['/skyline/', 'https://example.com/', '']) {
      expect(parseCatalog([{ ...validGame, path }]).problems).toHaveLength(1);
    }
  });

  it('accepts a pitch, highlights and screens, and checks their shape', () => {
    const invited: GameEntry = {
      ...validGame,
      pitch: 'Throw a banana across the city.',
      highlights: ['Four worlds', 'A CPU at four levels'],
      screens: [
        { image: 'media/aiming.jpg', caption: 'Read the wind.' },
        { image: 'media/moon.jpg' },
      ],
    };
    expect(parseCatalog([invited]).problems).toEqual([]);
    expect(parseCatalog([{ ...validGame, pitch: '' }]).problems[0]).toMatch(/pitch/);
    expect(
      parseCatalog([{ ...validGame, highlights: ['a', 'b', 'c', 'd', 'e'] }]).problems[0],
    ).toMatch(/highlights/);
    for (const image of ['/media/x.jpg', 'https://example.com/x.jpg', '']) {
      expect(parseCatalog([{ ...validGame, screens: [{ image }] }]).problems[0]).toMatch(/screens/);
    }
  });

  it('rejects impossible dates and missing docs', () => {
    expect(parseCatalog([{ ...validGame, added: '25/09/2026' }]).problems).toHaveLength(1);
    const withoutDocs: Partial<GameEntry> = { ...validGame };
    delete withoutDocs.docs;
    expect(parseCatalog([withoutDocs]).problems[0]).toMatch(/docs/);
  });
});

describe('formatting', () => {
  it('describes player counts naturally', () => {
    expect(formatPlayers({ min: 1, max: 1 })).toBe('1 player');
    expect(formatPlayers({ min: 2, max: 2 })).toBe('2 players');
    expect(formatPlayers({ min: 1, max: 4 })).toBe('1–4 players');
  });
});

// Guards the real catalog: every registered game must be complete, or the Hall shows a broken card.
describe('hall/catalog.json', () => {
  const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
  const raw: unknown = JSON.parse(readFileSync(`${repoRoot}hall/catalog.json`, 'utf8'));
  const { games, problems } = parseCatalog(raw);

  it('is valid', () => {
    expect(problems).toEqual([]);
  });

  it.each(games.map((game) => [game.slug, game] as const))(
    '%s has a port, a cover and its docs',
    (slug, game) => {
      expect(existsSync(`${repoRoot}ports/${slug}/index.html`)).toBe(true);
      expect(existsSync(`${repoRoot}hall/covers/${game.cover}.ts`)).toBe(true);
      expect(existsSync(`${repoRoot}ports/${slug}/${game.docs.howToPlay}`)).toBe(true);
      expect(existsSync(`${repoRoot}ports/${slug}/${game.docs.about}`)).toBe(true);
      expect(game.path).toBe(`${slug}/`);
      for (const screen of game.screens ?? []) {
        expect(existsSync(`${repoRoot}ports/${slug}/${screen.image}`), screen.image).toBe(true);
      }
    },
  );
});
