import { DIFFICULTIES, type Difficulty } from './engine/modes';

export type ModeId = 'trip' | 'endless' | 'daily' | 'classic' | 'versus';
export type CameraView = 'chase' | 'classic' | 'iso';
export type ScreenFilter = 'none' | 'crt' | 'cga';

export const MODE_IDS: readonly ModeId[] = ['trip', 'endless', 'daily', 'classic', 'versus'];
export const CAMERA_VIEWS: readonly CameraView[] = ['chase', 'classic', 'iso'];
export const SCREEN_FILTERS: readonly ScreenFilter[] = ['none', 'crt', 'cga'];

/** Everything chosen on the settings screen. Theme and sound levels are kept elsewhere. */
export interface Settings {
  mode: ModeId;
  camera: CameraView;
  /** Endless, and Daily Road practice runs. */
  difficulty: Difficulty;
  /** Classic Duel and Donkey vs Driver. */
  points: number;
  rhythm: boolean;
  /** The modern hazards, per mode. Classic Duel starts without them, like 1981. */
  hazards: Record<'classic' | 'versus' | 'endless', boolean>;
  filter: ScreenFilter;
}

export const DIFFICULTY_NAMES: Record<Difficulty, string> = {
  relaxed: 'Relaxed',
  normal: 'Normal',
  frantic: 'Frantic',
};

export const POINTS_RANGE = { min: 1, max: 11 } as const;

export function defaultSettings(): Settings {
  return {
    mode: 'trip',
    camera: 'chase',
    difficulty: 'normal',
    points: 5,
    rhythm: true,
    hazards: { classic: false, versus: false, endless: true },
    filter: 'none',
  };
}

/** Rebuilds settings from storage, field by field, falling back on anything unexpected. */
export function sanitiseSettings(raw: unknown): Settings {
  const fallback = defaultSettings();
  if (typeof raw !== 'object' || raw === null) return fallback;
  const stored = raw as Partial<Record<keyof Settings, unknown>>;
  const hazards = (
    typeof stored.hazards === 'object' && stored.hazards !== null ? stored.hazards : {}
  ) as Partial<Record<keyof Settings['hazards'], unknown>>;
  const points = Number(stored.points);

  return {
    mode: oneOf(stored.mode, MODE_IDS, fallback.mode),
    camera: oneOf(stored.camera, CAMERA_VIEWS, fallback.camera),
    difficulty: oneOf(stored.difficulty, DIFFICULTIES, fallback.difficulty),
    points: Number.isInteger(points)
      ? Math.min(POINTS_RANGE.max, Math.max(POINTS_RANGE.min, points))
      : fallback.points,
    rhythm: flag(stored.rhythm, fallback.rhythm),
    hazards: {
      classic: flag(hazards.classic, fallback.hazards.classic),
      versus: flag(hazards.versus, fallback.hazards.versus),
      endless: flag(hazards.endless, fallback.hazards.endless),
    },
    filter: oneOf(stored.filter, SCREEN_FILTERS, fallback.filter),
  };
}

function oneOf<T extends string>(value: unknown, options: readonly T[], otherwise: T): T {
  return options.includes(value as T) ? (value as T) : otherwise;
}

function flag(value: unknown, otherwise: boolean): boolean {
  return typeof value === 'boolean' ? value : otherwise;
}
