/**
 * One entry of hall/catalog.json. The schema is documented in
 * docs/adr/0002-hall-catalog-and-covers.md; this module is its enforcement.
 */
/** One screenshot from the port, with a line saying what is happening in it. */
export interface GameScreen {
  /** Image path relative to the port folder, normally under media/. */
  image: string;
  caption?: string;
}

export interface GameEntry {
  /** Folder name under ports/, and the game's URL segment in the built site. */
  slug: string;
  title: string;
  tagline: string;
  /** Two or three sentences on why the game is worth playing, in the voice of an invitation. */
  pitch?: string;
  /** A few short reasons to play, shown as a list. */
  highlights?: string[];
  /** Screenshots shown in the Hall; without them the Hall shows the animated cover. */
  screens?: GameScreen[];
  original: {
    title: string;
    author: string;
    year: number;
    platform?: string;
  };
  genres: string[];
  players: { min: number; max: number };
  /** The game's colour in the Hall, as #rrggbb. */
  accent: string;
  /** Where the game lives relative to the Hall in the built site, normally "<slug>/". */
  path: string;
  /** Name of the animated cover in hall/covers/ (without .ts), shown when there are no screens. */
  cover: string;
  /** Markdown files relative to the port folder. */
  docs: {
    howToPlay: string;
    about: string;
    architecture?: string;
  };
  /** Date the game joined the Hall, YYYY-MM-DD. */
  added: string;
}

export interface ParsedCatalog {
  games: GameEntry[];
  /** Human-readable reasons entries were skipped. */
  problems: string[];
}

const SLUG = /^_?[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX_COLOUR = /^#[0-9a-f]{6}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_HIGHLIGHTS = 4;

export function parseCatalog(raw: unknown): ParsedCatalog {
  if (!Array.isArray(raw)) {
    return { games: [], problems: ['The catalog must be a JSON array of games.'] };
  }

  const games: GameEntry[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();

  raw.forEach((item: unknown, index) => {
    const label =
      isRecord(item) && typeof item.slug === 'string' ? item.slug : `entry ${index + 1}`;
    const reasons = entryProblems(item);
    if (reasons.length === 0 && seen.has((item as GameEntry).slug)) {
      reasons.push('slug is used by an earlier entry');
    }
    if (reasons.length > 0) {
      problems.push(`${label}: ${reasons.join('; ')}`);
      return;
    }
    const game = item as GameEntry;
    seen.add(game.slug);
    games.push(game);
  });

  return { games, problems };
}

function entryProblems(item: unknown): string[] {
  if (!isRecord(item)) return ['not an object'];
  const problems: string[] = [];
  const need = (condition: boolean, message: string) => {
    if (!condition) problems.push(message);
  };

  need(typeof item.slug === 'string' && SLUG.test(item.slug), 'slug must be kebab-case');
  for (const field of ['title', 'tagline', 'cover'] as const) {
    need(isText(item[field]), `${field} must be a non-empty string`);
  }
  need(
    isText(item.path) && !/^([a-z]+:|\/)/i.test(item.path),
    'path must be relative to the Hall, like "my-game/"',
  );
  need(typeof item.accent === 'string' && HEX_COLOUR.test(item.accent), 'accent must be #rrggbb');
  need(
    typeof item.added === 'string' &&
      ISO_DATE.test(item.added) &&
      !Number.isNaN(Date.parse(item.added)),
    'added must be a YYYY-MM-DD date',
  );
  need(
    Array.isArray(item.genres) && item.genres.length > 0 && item.genres.every(isText),
    'genres must list at least one genre',
  );

  need(item.pitch === undefined || isText(item.pitch), 'pitch must be a non-empty string');
  need(
    item.highlights === undefined ||
      (Array.isArray(item.highlights) &&
        item.highlights.length <= MAX_HIGHLIGHTS &&
        item.highlights.every(isText)),
    `highlights must be a list of at most ${MAX_HIGHLIGHTS} lines`,
  );
  need(
    item.screens === undefined ||
      (Array.isArray(item.screens) &&
        item.screens.every(
          (screen) =>
            isRecord(screen) &&
            isText(screen.image) &&
            !/^([a-z]+:|\/)/i.test(screen.image) &&
            (screen.caption === undefined || isText(screen.caption)),
        )),
    'screens must list images relative to the port, each with an optional caption',
  );

  const { original, players, docs } = item;
  need(
    isRecord(original) &&
      isText(original.title) &&
      isText(original.author) &&
      Number.isInteger(original.year) &&
      (original.platform === undefined || isText(original.platform)),
    'original needs title, author, a whole-number year and optionally a platform',
  );
  need(
    isRecord(players) &&
      Number.isInteger(players.min) &&
      Number.isInteger(players.max) &&
      (players.min as number) >= 1 &&
      (players.max as number) >= (players.min as number),
    'players needs whole numbers with 1 <= min <= max',
  );
  need(
    isRecord(docs) &&
      isText(docs.howToPlay) &&
      isText(docs.about) &&
      (docs.architecture === undefined || isText(docs.architecture)),
    'docs needs howToPlay and about paths',
  );

  return problems;
}

export function formatPlayers({ min, max }: GameEntry['players']): string {
  if (min === max) return `${min} player${min === 1 ? '' : 's'}`;
  return `${min}–${max} players`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
