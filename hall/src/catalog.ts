import { isDayKey } from '@shared/daily';
import { isCategoryId, type CategoryId } from './categories';
import { templateProblems, type ResultRule } from './daily-result';
import { isMachineId, type MachineId } from './machines';

/**
 * One entry of hall/catalog.json. The schema is documented in
 * docs/adr/0002-hall-catalog-and-covers.md and ADR 0018; this module is its
 * enforcement.
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
  /** The classic it is based on, with only the facts its ABOUT page can support. */
  origin: GameOrigin;
  /** The shelf it lives on. */
  category: CategoryId;
  /** A second shelf it also appears on, when that clearly helps players find it. */
  secondaryCategory?: CategoryId;
  /** Finer tags for the genre filter. */
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
  /** The game's daily challenge, for the Hall's Today panel. */
  daily?: GameDaily;
}

export interface GameOrigin {
  title: string;
  /** Who wrote it. */
  author: string;
  /** Who put it out, when that was someone else. */
  publisher?: string;
  /** The year it appeared; leave it out and give an `era` when it cannot be confirmed. */
  year?: number;
  /** "early 1980s", with the span of years it can stand for, drawn as a soft band. */
  era?: { label: string; from: number; to: number };
  /** The computer and graphics it ran on. */
  platform: string;
  language: string;
  /** Which silhouette stands for it on the timeline. */
  machine: MachineId;
  /** Where it first reached players: a disk, a magazine, a book, a bundle. */
  appeared?: string;
}

export interface GameDaily {
  /** What the game calls it, e.g. "Daily Skyline". */
  name: string;
  /** The UTC date of daily #1, exactly as the game's own dailyChallenge() has it. */
  launch: string;
  /** The game's mode for it; the Hall links to the game with ?play=<mode>. */
  mode: string;
  /** Key of the game's daily log in its own store (the namespace is the slug). Default "daily". */
  log?: string;
  /** How to put a stored result in words; without them a played day just says so. */
  results?: ResultRule[];
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
const MODE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

  const { origin, players, docs, daily } = item;
  need(
    isRecord(origin) && originProblems(origin).length === 0,
    `origin ${isRecord(origin) ? originProblems(origin).join(', ') : 'is missing'}`,
  );
  need(isCategoryId(item.category), "category must be one of the Hall's categories");
  need(
    item.secondaryCategory === undefined ||
      (isCategoryId(item.secondaryCategory) && item.secondaryCategory !== item.category),
    "secondaryCategory must be another of the Hall's categories",
  );
  need(
    daily === undefined || (isRecord(daily) && dailyProblems(daily).length === 0),
    `daily ${isRecord(daily) ? dailyProblems(daily).join(', ') : 'must be an object'}`,
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

function originProblems(origin: Record<string, unknown>): string[] {
  const problems: string[] = [];
  for (const field of ['title', 'author', 'platform', 'language'] as const) {
    if (!isText(origin[field])) problems.push(`needs a ${field}`);
  }
  for (const field of ['publisher', 'appeared'] as const) {
    if (origin[field] !== undefined && !isText(origin[field]))
      problems.push(`${field} must be text`);
  }
  if (!isMachineId(origin.machine)) problems.push("needs a machine from the timeline's list");
  const { year, era } = origin;
  const eraIsValid =
    isRecord(era) &&
    isText(era.label) &&
    Number.isInteger(era.from) &&
    Number.isInteger(era.to) &&
    (era.from as number) <= (era.to as number);
  if ((year === undefined) === (era === undefined)) {
    problems.push('needs either a year or an era, not both');
  } else if (year !== undefined && !Number.isInteger(year)) {
    problems.push('year must be a whole number');
  } else if (era !== undefined && !eraIsValid) {
    problems.push('era needs a label and whole years from <= to');
  }
  return problems;
}

function dailyProblems(daily: Record<string, unknown>): string[] {
  const problems: string[] = [];
  if (!isText(daily.name)) problems.push('needs a name');
  if (!isDayKey(daily.launch)) problems.push('launch must be a YYYY-MM-DD date');
  if (typeof daily.mode !== 'string' || !MODE.test(daily.mode)) {
    problems.push('mode must be kebab-case');
  }
  if (daily.log !== undefined && !isText(daily.log)) problems.push('log must be a storage key');
  const rules = daily.results;
  if (rules !== undefined) {
    const valid =
      Array.isArray(rules) &&
      rules.every(
        (rule) =>
          isRecord(rule) &&
          isText(rule.text) &&
          templateProblems(rule.text).length === 0 &&
          (rule.when === undefined ||
            (isRecord(rule.when) &&
              Object.values(rule.when).every((value) =>
                ['string', 'number', 'boolean'].includes(typeof value),
              ))),
      );
    if (!valid) problems.push('results must be rules with a text and optional `when` fields');
  }
  return problems;
}

/** When the original appeared: its year, or its era when the year is not known. */
export function originDate(origin: GameOrigin): string {
  return origin.era?.label ?? String(origin.year ?? '');
}

/** The years the original may come from: one year, or its era's span. */
export function originYears(origin: GameOrigin): { from: number; to: number } {
  if (origin.era) return { from: origin.era.from, to: origin.era.to };
  const year = origin.year ?? 0;
  return { from: year, to: year };
}

/** "Microsoft Corporation", or "Microsoft for IBM" when someone else put it out. */
export function originCredit(origin: GameOrigin): string {
  return origin.publisher && origin.publisher !== origin.author
    ? `${origin.author} for ${origin.publisher}`
    : origin.author;
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
