import type { GameEntry } from './catalog';

export type SortOrder = 'title' | 'added';

export interface LibraryQuery {
  search: string;
  /** null shows every genre. */
  genre: string | null;
  sort: SortOrder;
}

export function collectGenres(games: readonly GameEntry[]): string[] {
  const genres = new Set(games.flatMap((game) => game.genres));
  return [...genres].sort((a, b) => a.localeCompare(b));
}

export function selectGames(games: readonly GameEntry[], query: LibraryQuery): GameEntry[] {
  const words = normalise(query.search).split(' ').filter(Boolean);
  return games
    .filter((game) => query.genre === null || game.genres.includes(query.genre))
    .filter((game) => {
      // The original's title counts too: people remember "Gorillas", not the new name.
      const haystack = normalise(`${game.title} ${game.original.title}`);
      return words.every((word) => haystack.includes(word));
    })
    .sort(query.sort === 'added' ? newestFirst : byTitle);
}

function byTitle(a: GameEntry, b: GameEntry): number {
  return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
}

function newestFirst(a: GameEntry, b: GameEntry): number {
  return b.added.localeCompare(a.added) || byTitle(a, b);
}

function normalise(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
