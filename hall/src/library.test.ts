import { describe, expect, it } from 'vitest';
import type { GameEntry } from './catalog';
import { collectGenres, selectGames, type LibraryQuery } from './library';

function game(slug: string, title: string, genres: string[], added: string, originalTitle = title) {
  return {
    slug,
    title,
    genres,
    added,
    original: { title: originalTitle, author: 'Someone', year: 1990 },
  } as GameEntry;
}

const games = [
  game('skyline', 'Skyline Showdown', ['Artillery', 'Duel'], '2026-09-25', 'QBasic Gorillas'),
  game('nibbles', 'Neon Nibbles', ['Snake', 'Arcade'], '2026-10-02', 'QBasic Nibbles'),
  game('eliza', 'Élise', ['Conversation'], '2026-09-25'),
];

const everything: LibraryQuery = { search: '', genre: null, sort: 'title' };
const slugs = (list: GameEntry[]) => list.map((entry) => entry.slug);

describe('collectGenres', () => {
  it('lists each genre once, alphabetically', () => {
    expect(collectGenres(games)).toEqual(['Arcade', 'Artillery', 'Conversation', 'Duel', 'Snake']);
  });
});

describe('selectGames', () => {
  it('sorts by title, ignoring case and accents', () => {
    expect(slugs(selectGames(games, everything))).toEqual(['eliza', 'nibbles', 'skyline']);
  });

  it('sorts newest first, breaking ties by title', () => {
    expect(slugs(selectGames(games, { ...everything, sort: 'added' }))).toEqual([
      'nibbles',
      'eliza',
      'skyline',
    ]);
  });

  it('filters by genre', () => {
    expect(slugs(selectGames(games, { ...everything, genre: 'Duel' }))).toEqual(['skyline']);
  });

  it('searches titles loosely, including the original title', () => {
    expect(slugs(selectGames(games, { ...everything, search: 'gorillas' }))).toEqual(['skyline']);
    expect(slugs(selectGames(games, { ...everything, search: '  NEON  nib ' }))).toEqual([
      'nibbles',
    ]);
    expect(slugs(selectGames(games, { ...everything, search: 'elise' }))).toEqual(['eliza']);
    expect(selectGames(games, { ...everything, search: 'tetris' })).toEqual([]);
  });

  it('combines search and genre', () => {
    const query = { ...everything, search: 'qbasic', genre: 'Snake' };
    expect(slugs(selectGames(games, query))).toEqual(['nibbles']);
  });

  it('does not reorder the catalog it was given', () => {
    const copy = [...games];
    selectGames(games, everything);
    expect(games).toEqual(copy);
  });
});
