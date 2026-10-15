import { CATEGORIES, type Category, type CategoryId } from './categories';
import type { GameEntry } from './catalog';

/** "played" sorts by how often each game was started, most first. */
export type SortOrder = 'title' | 'added' | 'played';

/** Starts per game, from the play history. */
export type PlayCounts = Readonly<Record<string, number>>;

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

export function selectGames(
  games: readonly GameEntry[],
  query: LibraryQuery,
  plays: PlayCounts = {},
): GameEntry[] {
  const words = normalise(query.search).split(' ').filter(Boolean);
  return games
    .filter((game) => query.genre === null || game.genres.includes(query.genre))
    .filter((game) => {
      // The original's title counts too: people remember "Gorillas", not the new name.
      const haystack = normalise(`${game.title} ${game.origin.title}`);
      return words.every((word) => haystack.includes(word));
    })
    .sort(sorter(query.sort, plays));
}

/** Whether a query narrows the collection, which turns the shelves into one list of results. */
export function isFiltering(query: LibraryQuery): boolean {
  return normalise(query.search) !== '' || query.genre !== null;
}

export interface Shelf {
  category: Category;
  games: { game: GameEntry; secondary: boolean }[];
}

/**
 * One shelf per category that has games, in the fixed category order. A game
 * with a secondary category sits on that shelf too, marked as a visitor.
 */
export function shelvesOf(
  games: readonly GameEntry[],
  sort: SortOrder,
  plays: PlayCounts = {},
): Shelf[] {
  const ordered = [...games].sort(sorter(sort, plays));
  return CATEGORIES.map((category) => ({
    category,
    games: ordered
      .filter((game) => game.category === category.id || game.secondaryCategory === category.id)
      .map((game) => ({ game, secondary: game.category !== category.id })),
  })).filter((shelf) => shelf.games.length > 0);
}

export function inCategory(games: readonly GameEntry[], id: CategoryId): GameEntry[] {
  return games.filter((game) => game.category === id || game.secondaryCategory === id);
}

function sorter(sort: SortOrder, plays: PlayCounts) {
  if (sort === 'added') return newestFirst;
  if (sort === 'title') return byTitle;
  return (a: GameEntry, b: GameEntry) =>
    (plays[b.slug] ?? 0) - (plays[a.slug] ?? 0) || newestFirst(a, b);
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
