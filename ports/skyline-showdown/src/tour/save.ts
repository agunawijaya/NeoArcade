import { DEFAULT_OUTFITS, sanitiseOutfit, type Outfit } from '../wardrobe/items';
import { RIVAL_IDS, type RivalId } from './rivals';
import { STAGES, type StageId } from './stages';

/**
 * The game's own save, apart from the Arcade Pass: World Tour stars,
 * rivals beaten, and both players' outfits. Stored under
 * `neoarcade:skyline-showdown:tour`, versioned like the Pass profile: when
 * the shape changes, bump TOUR_VERSION and add a step that turns the
 * previous version into the new one.
 */
export const TOUR_KEY = 'tour';
export const TOUR_VERSION = 1;

export interface StageRecord {
  /** Best stars ever earned here, 0–3. */
  stars: number;
  won: boolean;
  /** Fewest throws in a win. */
  bestThrows: number | null;
  plays: number;
}

export interface TourSave {
  version: typeof TOUR_VERSION;
  stages: Partial<Record<StageId, StageRecord>>;
  rivalsBeaten: RivalId[];
  outfits: [Outfit, Outfit];
}

type Json = Record<string, unknown>;

/** Step n turns a version-n save into version n + 1. Empty while version 1 is current. */
export const TOUR_MIGRATIONS: Readonly<Record<number, (older: Json) => Json>> = {};

export function emptyTour(): TourSave {
  return {
    version: TOUR_VERSION,
    stages: {},
    rivalsBeaten: [],
    outfits: [{ ...DEFAULT_OUTFITS[0] }, { ...DEFAULT_OUTFITS[1] }],
  };
}

/** Whatever was stored, as a valid current save; anything unreadable starts afresh. */
export function loadTour(
  raw: unknown,
  steps: Readonly<Record<number, (older: Json) => Json>> = TOUR_MIGRATIONS,
  targetVersion: number = TOUR_VERSION,
): TourSave {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return emptyTour();
  let data = raw as Json;
  const stored = data.version;
  if (typeof stored !== 'number' || !Number.isInteger(stored) || stored < 1) return emptyTour();
  // A save from a newer version is left as it is on disk; this visit starts afresh.
  if (stored > targetVersion) return emptyTour();
  for (let version = stored; version < targetVersion; version++) {
    const step = steps[version];
    if (!step) return emptyTour();
    data = { ...step(data), version: version + 1 };
  }
  return sanitise(data);
}

function sanitise(data: Json): TourSave {
  const save = emptyTour();
  const stages =
    typeof data.stages === 'object' && data.stages !== null ? (data.stages as Json) : {};
  for (const stage of STAGES) {
    const record = stages[stage.id];
    if (typeof record !== 'object' || record === null) continue;
    const { stars, won, bestThrows, plays } = record as Json;
    save.stages[stage.id] = {
      stars: whole(stars, 0, 3),
      won: won === true,
      bestThrows: typeof bestThrows === 'number' && bestThrows >= 1 ? Math.floor(bestThrows) : null,
      plays: whole(plays, 0, 1_000_000),
    };
  }
  const beaten = Array.isArray(data.rivalsBeaten) ? data.rivalsBeaten : [];
  save.rivalsBeaten = RIVAL_IDS.filter((id) => beaten.includes(id));
  const outfits = Array.isArray(data.outfits) ? data.outfits : [];
  save.outfits = [
    sanitiseOutfit(outfits[0], DEFAULT_OUTFITS[0]),
    sanitiseOutfit(outfits[1], DEFAULT_OUTFITS[1]),
  ];
  return save;
}

function whole(value: unknown, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.floor(value)))
    : min;
}
