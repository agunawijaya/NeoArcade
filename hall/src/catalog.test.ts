import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { catalogProblems } from '../../scripts/check-catalog';
import {
  formatPlayers,
  originCredit,
  originDate,
  originYears,
  parseCatalog,
  type GameEntry,
} from './catalog';

const validGame: GameEntry = {
  slug: 'skyline-showdown',
  title: 'Skyline Showdown',
  tagline: 'Bananas, wind and a city at dusk.',
  origin: {
    title: 'QBasic Gorillas',
    author: 'Microsoft Corporation',
    year: 1990,
    platform: 'MS-DOS PCs',
    language: 'QBasic',
    machine: 'dos-pc',
  },
  category: 'arcade',
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

  it('accepts an era in place of a year nobody can confirm, but not neither or both', () => {
    const undatedOrigin = { ...validGame.origin, year: undefined };
    const era = { label: 'early 1980s', from: 1981, to: 1984 };
    const undated: GameEntry = { ...validGame, origin: { ...undatedOrigin, era } };
    expect(parseCatalog([undated]).problems).toEqual([]);
    expect(originDate(undated.origin)).toBe('early 1980s');
    expect(originYears(undated.origin)).toEqual({ from: 1981, to: 1984 });
    expect(originDate(validGame.origin)).toBe('1990');
    expect(originYears(validGame.origin)).toEqual({ from: 1990, to: 1990 });

    const neither = { ...validGame, origin: undatedOrigin };
    expect(parseCatalog([neither]).problems[0]).toMatch(/either a year or an era/);
    const both = { ...validGame, origin: { ...validGame.origin, era } };
    expect(parseCatalog([both]).problems[0]).toMatch(/either a year or an era/);
    const backwards = { ...validGame, origin: { ...undatedOrigin, era: { ...era, to: 1979 } } };
    expect(parseCatalog([backwards]).problems[0]).toMatch(/era/);
  });

  it('needs the facts of the origin, with a machine from the list', () => {
    for (const field of ['title', 'author', 'platform', 'language'] as const) {
      const origin = { ...validGame.origin, [field]: '' };
      expect(parseCatalog([{ ...validGame, origin }]).problems[0]).toMatch(field);
    }
    const origin = { ...validGame.origin, machine: 'abacus' };
    expect(parseCatalog([{ ...validGame, origin }]).problems[0]).toMatch(/machine/);
  });

  it('credits the publisher only when it is someone else', () => {
    expect(originCredit(validGame.origin)).toBe('Microsoft Corporation');
    const donkey = { ...validGame.origin, author: 'Microsoft', publisher: 'IBM' };
    expect(originCredit(donkey)).toBe('Microsoft for IBM');
  });

  it('takes categories from the fixed list only, and a secondary that differs', () => {
    const strategy: GameEntry = { ...validGame, secondaryCategory: 'strategy' };
    expect(parseCatalog([strategy]).problems).toEqual([]);
    const invented = { ...validGame, category: 'shooters' };
    expect(parseCatalog([invented]).problems[0]).toMatch(/category/);
    expect(parseCatalog([{ ...validGame, category: undefined }]).problems[0]).toMatch(/category/);
    const twice = { ...validGame, secondaryCategory: 'arcade' };
    expect(parseCatalog([twice]).problems[0]).toMatch(/secondaryCategory/);
  });

  it('checks the daily challenge it declares', () => {
    const daily = {
      name: 'Daily Skyline',
      launch: '2026-09-29',
      mode: 'daily',
      results: [{ when: { outcome: 'hit' }, text: 'Hit in {throws}' }, { text: 'Missed' }],
    };
    expect(parseCatalog([{ ...validGame, daily }]).problems).toEqual([]);
    const broken = [
      { ...daily, launch: '29/09/2026' },
      { ...daily, mode: 'Daily Mode' },
      { ...daily, name: '' },
      { ...daily, results: [{ text: '{throws|furlongs}' }] },
      { ...daily, results: [{ when: { outcome: ['hit'] }, text: 'Hit' }] },
    ];
    for (const entry of broken) {
      expect(parseCatalog([{ ...validGame, daily: entry }]).problems[0]).toMatch(/daily/);
    }
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

// Guards the real catalog the way the build does: every registered game must
// be complete, or the Hall shows a broken card.
describe('hall/catalog.json', () => {
  it('is valid, and every file it points at exists', () => {
    expect(catalogProblems(fileURLToPath(new URL('../../', import.meta.url)))).toEqual([]);
  });
});
