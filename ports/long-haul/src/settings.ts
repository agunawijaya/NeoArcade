import { DIFFICULTY_IDS, type DifficultyId } from './engine/difficulty';
import { RIG_PAINTS, type RigPaintId } from './render/rig';

/**
 * Everything on the settings screen. Theme and sound levels are kept
 * elsewhere (the theme preference and the arcade-wide audio mix).
 */
export type Rhythm = 'realtime' | 'legs';
export type DriveView = 'cab' | 'diorama';
export type Units = 'mi' | 'km';
export type Warp = 1 | 2 | 4;
export type EventPause = 'major' | 'all';

export const RHYTHMS: readonly Rhythm[] = ['realtime', 'legs'];
export const DRIVE_VIEWS: readonly DriveView[] = ['cab', 'diorama'];
export const UNIT_CHOICES: readonly Units[] = ['mi', 'km'];
export const WARPS: readonly Warp[] = [1, 2, 4];

export interface Settings {
  rhythm: Rhythm;
  view: DriveView;
  units: Units;
  difficulty: DifficultyId;
  /** The CRT Easter egg: play the trip as the original's green-on-black prompts. */
  textMode: boolean;
  /** Real-time speed: seconds per in-game hour are divided by this. */
  warp: Warp;
  /** Which events stop the clock: the serious ones, or every one. */
  eventPause: EventPause;
  /** The rig's colours; all but the first are unlocked on the Arcade Pass. */
  paint: RigPaintId;
}

export const RHYTHM_NAMES: Record<Rhythm, string> = {
  realtime: 'Real-time',
  legs: 'Leg by leg',
};

export const VIEW_NAMES: Record<DriveView, string> = {
  cab: 'Cab',
  diorama: 'Side view',
};

export function defaultSettings(): Settings {
  return {
    rhythm: 'realtime',
    view: 'diorama',
    units: 'mi',
    difficulty: 'normal',
    textMode: false,
    warp: 1,
    eventPause: 'major',
    paint: 'classic',
  };
}

/** Rebuilds settings from storage, field by field, falling back on anything unexpected. */
export function sanitiseSettings(raw: unknown): Settings {
  const fallback = defaultSettings();
  if (typeof raw !== 'object' || raw === null) return fallback;
  const stored = raw as Partial<Record<keyof Settings, unknown>>;
  return {
    rhythm: oneOf(stored.rhythm, RHYTHMS, fallback.rhythm),
    view: oneOf(stored.view, DRIVE_VIEWS, fallback.view),
    units: oneOf(stored.units, UNIT_CHOICES, fallback.units),
    difficulty: oneOf(stored.difficulty, DIFFICULTY_IDS, fallback.difficulty),
    textMode: typeof stored.textMode === 'boolean' ? stored.textMode : fallback.textMode,
    warp: WARPS.includes(stored.warp as Warp) ? (stored.warp as Warp) : fallback.warp,
    eventPause: oneOf(stored.eventPause, ['major', 'all'] as const, fallback.eventPause),
    paint: oneOf(stored.paint, Object.keys(RIG_PAINTS) as RigPaintId[], fallback.paint),
  };
}

function oneOf<T extends string>(value: unknown, options: readonly T[], otherwise: T): T {
  return options.includes(value as T) ? (value as T) : otherwise;
}
