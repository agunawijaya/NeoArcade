import { DEFAULT_LOOK, LOOK_OPTIONS, type LookSlot, type PlayerLook } from './arcade-cosmetics';
import { migrateProfile, PROFILE_VERSION } from './migrate';

/**
 * The saved profile. It is one JSON document under `neoarcade:pass:profile`,
 * versioned so later releases can migrate it (see migrate.ts).
 */
export interface Profile {
  version: typeof PROFILE_VERSION;
  /** ISO time the profile was created. */
  createdAt: string;
  name: string;
  look: PlayerLook;
  /** Every XP point ever granted, across all games. */
  xp: number;
  games: Record<string, GameRecord>;
  /** Newest first, at most FEED_LENGTH entries. */
  feed: FeedEntry[];
}

export interface GameRecord {
  /** XP granted by this game, badges included. */
  xp: number;
  firstPlayed: string;
  lastPlayed: string;
  /** Badge id → ISO time it was unlocked. */
  badges: Record<string, string>;
  /** Counted badges: badge id → count so far. */
  progress: Record<string, number>;
  stats: Record<string, number>;
  /** Local calendar day the daily counter belongs to, "YYYY-MM-DD". */
  day: string;
  /** XP this game asked for on that day, before the daily cap. */
  askedToday: number;
}

export type FeedKind = 'xp' | 'badge' | 'level';

export interface FeedEntry {
  at: string;
  kind: FeedKind;
  /** The game it happened in; null for arcade-wide news such as a level-up. */
  game: string | null;
  xp: number;
  text: string;
  /** How many identical awards were folded into this line. */
  times: number;
  /** For badge lines: the badge's id, so its medal can be drawn next to it. */
  badge?: string;
}

export const NAME_MAX_LENGTH = 16;
export const DEFAULT_NAME = 'Player One';
export const FEED_LENGTH = 40;
const REASON_MAX_LENGTH = 90;

export function emptyProfile(now: Date): Profile {
  return {
    version: PROFILE_VERSION,
    createdAt: now.toISOString(),
    name: DEFAULT_NAME,
    look: { ...DEFAULT_LOOK },
    xp: 0,
    games: {},
    feed: [],
  };
}

export function emptyGameRecord(now: Date, day: string): GameRecord {
  const at = now.toISOString();
  return {
    xp: 0,
    firstPlayed: at,
    lastPlayed: at,
    badges: {},
    progress: {},
    stats: {},
    day,
    askedToday: 0,
  };
}

export type LoadResult =
  | { status: 'loaded'; profile: Profile; repaired: boolean }
  | { status: 'unreadable' }
  | { status: 'newer-version'; version: number };

/**
 * Turns whatever was stored (or imported) into a valid profile: old
 * versions are migrated, then every field is checked. Damaged fields fall
 * back to their defaults instead of losing the whole profile.
 */
export function loadProfile(raw: unknown, now: Date): LoadResult {
  const migrated = migrateProfile(raw);
  if (!migrated.ok) {
    return migrated.reason === 'newer-version'
      ? { status: 'newer-version', version: migrated.version }
      : { status: 'unreadable' };
  }
  const profile = sanitiseProfile(migrated.data, now);
  const repaired = JSON.stringify(profile) !== JSON.stringify(migrated.data);
  return { status: 'loaded', profile, repaired };
}

export function sanitiseProfile(data: Record<string, unknown>, now: Date): Profile {
  const games: Record<string, GameRecord> = {};
  for (const [slug, record] of Object.entries(asObject(data.games))) {
    if (isSlug(slug) && isObject(record)) games[slug] = sanitiseGame(record, now);
  }
  return {
    version: PROFILE_VERSION,
    createdAt: asIsoTime(data.createdAt, now.toISOString()),
    name: cleanName(data.name),
    look: sanitiseLook(data.look),
    xp: asCount(data.xp),
    games,
    feed: asArray(data.feed)
      .map((entry) => sanitiseFeedEntry(entry, now))
      .filter((entry): entry is FeedEntry => entry !== null)
      .slice(0, FEED_LENGTH),
  };
}

/** Trims, strips control characters and caps the length; blank becomes the default. */
export function cleanName(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_NAME;
  const cleaned = value
    .replace(/\p{Cc}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return [...cleaned].slice(0, NAME_MAX_LENGTH).join('').trim() || DEFAULT_NAME;
}

export function cleanReason(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, REASON_MAX_LENGTH)
    : '';
}

function sanitiseLook(value: unknown): PlayerLook {
  const stored = asObject(value);
  const look = { ...DEFAULT_LOOK };
  for (const slot of Object.keys(LOOK_OPTIONS) as LookSlot[]) {
    const id = stored[slot];
    if (LOOK_OPTIONS[slot].some((option) => option.id === id)) {
      (look as Record<LookSlot, string>)[slot] = id as string;
    }
  }
  return look;
}

function sanitiseGame(record: Record<string, unknown>, now: Date): GameRecord {
  const firstPlayed = asIsoTime(record.firstPlayed, now.toISOString());
  const badges: Record<string, string> = {};
  for (const [id, at] of Object.entries(asObject(record.badges))) {
    if (isSlug(id)) badges[id] = asIsoTime(at, firstPlayed);
  }
  return {
    xp: asCount(record.xp),
    firstPlayed,
    lastPlayed: asIsoTime(record.lastPlayed, firstPlayed),
    badges,
    progress: countsIn(record.progress),
    stats: numbersIn(record.stats),
    day: typeof record.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(record.day) ? record.day : '',
    askedToday: asCount(record.askedToday),
  };
}

function sanitiseFeedEntry(value: unknown, now: Date): FeedEntry | null {
  if (!isObject(value)) return null;
  const kind = value.kind;
  if (kind !== 'xp' && kind !== 'badge' && kind !== 'level') return null;
  const text = cleanReason(value.text);
  if (!text) return null;
  const entry: FeedEntry = {
    at: asIsoTime(value.at, now.toISOString()),
    kind,
    game: typeof value.game === 'string' && isSlug(value.game) ? value.game : null,
    xp: asCount(value.xp),
    text,
    times: Math.max(1, asCount(value.times)),
  };
  if (kind === 'badge' && typeof value.badge === 'string' && isSlug(value.badge)) {
    entry.badge = value.badge;
  }
  return entry;
}

function countsIn(value: unknown): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [key, count] of Object.entries(asObject(value))) {
    if (isSlug(key)) counts[key] = asCount(count);
  }
  return counts;
}

function numbersIn(value: unknown): Record<string, number> {
  const numbers: Record<string, number> = {};
  for (const [key, number] of Object.entries(asObject(value))) {
    if (isStatKey(key) && typeof number === 'number' && Number.isFinite(number)) {
      numbers[key] = number;
    }
  }
  return numbers;
}

const SLUG = /^_?[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STAT_KEY = /^[a-zA-Z][a-zA-Z0-9-]*$/;

export function isSlug(value: string): boolean {
  return SLUG.test(value) && value.length <= 64;
}

export function isStatKey(value: string): boolean {
  return STAT_KEY.test(value) && value.length <= 64;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asObject(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function asIsoTime(value: unknown, fallback: string): string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : fallback;
}
