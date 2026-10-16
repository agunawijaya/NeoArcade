import { DIFFICULTY_IDS, type DifficultyId } from './engine/difficulty';
import { RIG_PAINTS, type RigPaintId } from './render/vehicles/rig/model';

/**
 * Everything on the settings screen. Theme and sound levels are kept
 * elsewhere (the theme preference and the arcade-wide audio mix).
 */
export type Rhythm = 'realtime' | 'legs';
export type DriveView = 'cab' | 'diorama';
export type Units = 'mi' | 'km';
export type Warp = 1 | 2 | 4;
export type EventPause = 'major' | 'all';
/** How a police stop is shown; automatic plays it in full once, then short. */
export type PoliceStops = 'auto' | 'full' | 'short' | 'card';

export const RHYTHMS: readonly Rhythm[] = ['realtime', 'legs'];
export const DRIVE_VIEWS: readonly DriveView[] = ['cab', 'diorama'];
export const UNIT_CHOICES: readonly Units[] = ['mi', 'km'];
export const WARPS: readonly Warp[] = [1, 2, 4];
export const POLICE_STOPS: readonly PoliceStops[] = ['auto', 'full', 'short', 'card'];

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
  /** How a police stop is shown on the road. */
  policeStops: PoliceStops;
}

export const RHYTHM_NAMES: Record<Rhythm, string> = {
  realtime: 'Real-time',
  legs: 'Leg by leg',
};

export const POLICE_STOP_NAMES: Record<PoliceStops, string> = {
  auto: 'Auto',
  full: 'Full',
  short: 'Short',
  card: 'Card only',
};

export const POLICE_STOP_HELP: Record<PoliceStops, string> = {
  auto: 'The whole stop the first time, the short version after that, and the short one from the start when your device asks for less motion.',
  full: 'Every stop in full: lights in the mirror, the trooper at the window, the ticket and the hearing in town.',
  short: 'The patrol car passes, you pull over and the ticket is handed through the window.',
  card: 'No scene on the road: the event card, as before.',
};

/**
 * The stop to play: the setting, except that automatic plays the whole
 * scene the first time and the short one after that, or straight away when
 * the player has asked for less motion.
 */
export function policeStopMode(
  setting: PoliceStops,
  seen: boolean,
  reducedMotion: boolean,
): 'full' | 'short' | 'card' {
  if (setting !== 'auto') return setting;
  return seen || reducedMotion ? 'short' : 'full';
}

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
    policeStops: 'auto',
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
    policeStops: oneOf(stored.policeStops, POLICE_STOPS, fallback.policeStops),
  };
}

function oneOf<T extends string>(value: unknown, options: readonly T[], otherwise: T): T {
  return options.includes(value as T) ? (value as T) : otherwise;
}
