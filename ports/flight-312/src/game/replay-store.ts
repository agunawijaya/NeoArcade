import type { Store } from '@shared/storage';

/**
 * The replays the player saved: the last ten, newest first, each kept as
 * its packed text (setup and inputs, never video) with a title and a line
 * to show in the list. Saving an eleventh lets the oldest go.
 */
export interface SavedReplay {
  id: string;
  /** When it was saved, ISO 8601. */
  savedAt: string;
  title: string;
  summary: string;
  packed: string;
  /** The step the replay is built around: the touchdown, or the end. */
  focusStep: number;
}

export const SAVED_REPLAYS_KEPT = 10;
const KEY = 'replays';

function isSaved(value: unknown): value is SavedReplay {
  if (typeof value !== 'object' || value === null) return false;
  const one = value as Record<string, unknown>;
  return (
    typeof one.id === 'string' &&
    typeof one.savedAt === 'string' &&
    typeof one.title === 'string' &&
    typeof one.summary === 'string' &&
    typeof one.packed === 'string' &&
    typeof one.focusStep === 'number'
  );
}

export function savedReplays(store: Store): SavedReplay[] {
  const stored = store.get<unknown>(KEY, []);
  return Array.isArray(stored) ? stored.filter(isSaved) : [];
}

export function saveReplay(
  store: Store,
  replay: Omit<SavedReplay, 'id' | 'savedAt'>,
  now = new Date(),
) {
  const saved: SavedReplay = { ...replay, id: `${now.getTime()}`, savedAt: now.toISOString() };
  const kept = [saved, ...savedReplays(store).filter((one) => one.packed !== replay.packed)];
  store.set(KEY, kept.slice(0, SAVED_REPLAYS_KEPT));
  return saved;
}

export function deleteReplay(store: Store, id: string) {
  store.set(
    KEY,
    savedReplays(store).filter((one) => one.id !== id),
  );
}
