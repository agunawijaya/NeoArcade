import { createStore, type Store } from '../storage';

/**
 * What the player last did in each game, for the Hall's "Continue playing"
 * row. A game reports a play when the player starts a mode; the Hall lists
 * the newest and links straight back into that mode with `?play=<mode>`,
 * which the game reads once at start-up.
 *
 *   reportPlay({ game: 'skyline-showdown', mode: 'tour', item: 'tokyo', label: 'World Tour · Tokyo' });
 *
 *   // In the game, after its screens exist:
 *   const request = takeResumeRequest();   // { mode: 'tour', item: 'tokyo' }, or null
 *   if (request?.mode === 'tour') openStage(request.item);
 *
 * The history lives in this browser only (`neoarcade:last-played:*`), like
 * everything else in NeoArcade.
 */
export interface Play {
  /** The game's slug. */
  game: string;
  /** The game's own name for the mode, kebab-case, e.g. "tour" or "daily". */
  mode: string;
  /** What, inside the mode, to go back to: a stage, a puzzle, a route. */
  item?: string;
  /** A few words for the player, e.g. "World Tour · Tokyo". */
  label: string;
  /** ISO time it was played. */
  at: string;
}

export interface ResumeRequest {
  mode: string;
  item?: string;
}

/** Plays kept; the Hall shows fewer. */
export const HISTORY_LENGTH = 12;
const LABEL_MAX_LENGTH = 60;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ITEM = /^[\w.-]{1,40}$/;
const NAMESPACE = 'last-played';

export function historyStore(): Store {
  return createStore(NAMESPACE);
}

/** True for a `storage` event key that belongs to the history, so a page can refresh. */
export function isHistoryKey(key: string | null): boolean {
  return key === null || key.startsWith(`neoarcade:${NAMESPACE}:`);
}

/** Keeps the play at the top of the history, replacing the same game and mode. */
export function reportPlay(
  play: Omit<Play, 'at'>,
  store: Store = historyStore(),
  now: Date = new Date(),
): void {
  const entry = sanitisePlay({ ...play, at: now.toISOString() });
  if (!entry) {
    console.warn(
      `Last played: ignored a play that does not fit the shape: ${JSON.stringify(play)}`,
    );
    return;
  }
  const others = recentPlays(store).filter(
    (other) => other.game !== entry.game || other.mode !== entry.mode,
  );
  store.set('history', [entry, ...others].slice(0, HISTORY_LENGTH));
  const counts = playCounts(store);
  store.set('counts', { ...counts, [entry.game]: (counts[entry.game] ?? 0) + 1 });
}

/** Newest first. */
export function recentPlays(store: Store = historyStore()): Play[] {
  const stored = store.get<unknown>('history', []);
  if (!Array.isArray(stored)) return [];
  return stored
    .map(sanitisePlay)
    .filter((play): play is Play => play !== null)
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** How many times each game has been started since the history was last cleared. */
export function playCounts(store: Store = historyStore()): Record<string, number> {
  const stored = store.get<unknown>('counts', {});
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return {};
  return Object.fromEntries(
    Object.entries(stored).filter(
      (entry): entry is [string, number] =>
        ID.test(entry[0]) && Number.isInteger(entry[1]) && (entry[1] as number) > 0,
    ),
  );
}

export function clearPlays(store: Store = historyStore()): void {
  store.remove('history');
  store.remove('counts');
}

/** The query that opens a game in a mode: "?play=tour&item=tokyo". */
export function resumeQuery({ mode, item }: ResumeRequest): string {
  const params = new URLSearchParams({ play: mode });
  if (item) params.set('item', item);
  return `?${params.toString()}`;
}

export function parseResumeRequest(search: string): ResumeRequest | null {
  const params = new URLSearchParams(search);
  const mode = params.get('play') ?? '';
  const item = params.get('item');
  if (!ID.test(mode)) return null;
  return item && ITEM.test(item) ? { mode, item } : { mode };
}

/**
 * Reads the mode the page was opened in, once: it is removed from the
 * address, so a reload or a later trip back to the title stays put.
 */
export function takeResumeRequest(): ResumeRequest | null {
  const request = parseResumeRequest(location.search);
  const url = new URL(location.href);
  if (!url.searchParams.has('play') && !url.searchParams.has('item')) return request;
  url.searchParams.delete('play');
  url.searchParams.delete('item');
  history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  return request;
}

function sanitisePlay(value: unknown): Play | null {
  if (typeof value !== 'object' || value === null) return null;
  const { game, mode, item, label, at } = value as Record<string, unknown>;
  if (typeof game !== 'string' || !ID.test(game)) return null;
  if (typeof mode !== 'string' || !ID.test(mode)) return null;
  if (item !== undefined && (typeof item !== 'string' || !ITEM.test(item))) return null;
  if (typeof label !== 'string' || label.trim() === '') return null;
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return null;
  const play: Play = { game, mode, label: label.trim().slice(0, LABEL_MAX_LENGTH), at };
  if (item !== undefined) play.item = item;
  return play;
}
