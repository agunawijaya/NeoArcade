import type { CpuLevel } from './engine/ai';
import type { MatchFormat, MatchOptions } from './engine/match';
import { POWER_UP_KINDS, type PowerUpKind } from './engine/powerups';
import type { WorldChoice } from './engine/worlds';
import { RIVAL_IDS, type RivalId } from './tour/rivals';

export type PlayersMode = 'humanVsHuman' | 'humanVsCpu' | 'cpuVsCpu';
export type AimingMode = 'drag' | 'typed';
export type PresetId = 'classic' | 'neo';

/** Everything chosen on the settings screen. Sound levels live in the arcade-wide mix instead. */
export interface Settings {
  players: PlayersMode;
  cpuLevel: CpuLevel;
  world: WorldChoice;
  points: number;
  format: MatchFormat;
  aiming: AimingMode;
  /** Draws the first third of each person's throw while they aim. */
  aimAssist: boolean;
  powerUps: boolean;
  powerUpKinds: Record<PowerUpKind, boolean>;
  weather: boolean;
  crt: boolean;
  names: [string, string];
  /** A World Tour rival to face in a Quick Match instead of the plain CPU. */
  rival: RivalId | null;
}

const ALL_KINDS_ON = Object.fromEntries(POWER_UP_KINDS.map((kind) => [kind, true])) as Record<
  PowerUpKind,
  boolean
>;

type PresetValues = Omit<Settings, 'names' | 'rival'>;

export const PRESETS: Record<PresetId, PresetValues> = {
  classic: {
    players: 'humanVsHuman',
    cpuLevel: 'normal',
    world: 'earth',
    points: 3,
    format: 'total',
    aiming: 'typed',
    aimAssist: false,
    powerUps: false,
    powerUpKinds: ALL_KINDS_ON,
    weather: false,
    crt: true,
  },
  neo: {
    players: 'humanVsCpu',
    cpuLevel: 'normal',
    world: 'earth',
    points: 3,
    format: 'firstTo',
    aiming: 'drag',
    aimAssist: false,
    powerUps: true,
    powerUpKinds: ALL_KINDS_ON,
    weather: true,
    crt: false,
  },
};

export const DEFAULT_NAMES: [string, string] = ['Player 1', 'Player 2'];
export const NAME_LENGTH = 10;
export const POINTS_RANGE = { min: 1, max: 20 } as const;

export function defaultSettings(): Settings {
  return withPreset({ ...PRESETS.neo, names: [...DEFAULT_NAMES], rival: null }, 'neo');
}

/** Switches every rule to a preset, keeping the players' names and chosen rival. */
export function withPreset(settings: Settings, preset: PresetId): Settings {
  return {
    ...structuredClone(PRESETS[preset]),
    names: [...settings.names],
    rival: settings.rival,
  };
}

/** Which preset the settings match exactly, if any; anything else is "custom". */
export function matchingPreset(settings: Settings): PresetId | null {
  const found = (Object.keys(PRESETS) as PresetId[]).find(
    (preset) =>
      JSON.stringify(normalisedOrder(PRESETS[preset])) ===
      JSON.stringify(normalisedOrder(settings)),
  );
  return found ?? null;
}

/** The rules as a comparable list; names and the chosen rival never count. */
function normalisedOrder(values: PresetValues) {
  // CPU difficulty only matters when a CPU plays, so it never makes settings "custom" alone.
  const cpuMatters = values.players !== 'humanVsHuman';
  const kinds = POWER_UP_KINDS.map((kind) => values.powerUpKinds[kind]);
  return [
    values.players,
    cpuMatters ? values.cpuLevel : '',
    values.world,
    values.points,
    values.format,
    values.aiming,
    values.aimAssist,
    values.powerUps,
    kinds,
    values.weather,
    values.crt,
  ];
}

/** Like the original: up to ten characters, and a default for an empty name. */
export function cleanName(name: string, player: 0 | 1): string {
  const trimmed = name.trim().slice(0, NAME_LENGTH);
  return trimmed || DEFAULT_NAMES[player];
}

/** Rebuilds settings from storage, falling back field by field on anything unexpected. */
export function sanitiseSettings(raw: unknown): Settings {
  const fallback = defaultSettings();
  if (typeof raw !== 'object' || raw === null) return fallback;
  const stored = raw as Partial<Record<keyof Settings, unknown>>;

  const oneOf = <T extends string>(value: unknown, options: readonly T[], otherwise: T): T =>
    options.includes(value as T) ? (value as T) : otherwise;
  const flag = (value: unknown, otherwise: boolean) =>
    typeof value === 'boolean' ? value : otherwise;
  const points = Number(stored.points);
  const kinds = (stored.powerUpKinds ?? {}) as Partial<Record<PowerUpKind, unknown>>;
  const names = Array.isArray(stored.names) ? stored.names : [];

  return {
    players: oneOf(stored.players, ['humanVsHuman', 'humanVsCpu', 'cpuVsCpu'], fallback.players),
    cpuLevel: oneOf(stored.cpuLevel, ['easy', 'normal', 'hard', 'brutal'], fallback.cpuLevel),
    world: oneOf(stored.world, ['earth', 'moon', 'mars', 'jupiter', 'random'], fallback.world),
    points: Number.isInteger(points)
      ? Math.min(POINTS_RANGE.max, Math.max(POINTS_RANGE.min, points))
      : fallback.points,
    format: oneOf(stored.format, ['firstTo', 'total'], fallback.format),
    aiming: oneOf(stored.aiming, ['drag', 'typed'], fallback.aiming),
    aimAssist: flag(stored.aimAssist, fallback.aimAssist),
    powerUps: flag(stored.powerUps, fallback.powerUps),
    powerUpKinds: Object.fromEntries(
      POWER_UP_KINDS.map((kind) => [kind, flag(kinds[kind], true)]),
    ) as Record<PowerUpKind, boolean>,
    weather: flag(stored.weather, fallback.weather),
    crt: flag(stored.crt, fallback.crt),
    names: [0, 1].map((player) =>
      cleanName(typeof names[player] === 'string' ? names[player] : '', player as 0 | 1),
    ) as [string, string],
    rival: RIVAL_IDS.includes(stored.rival as RivalId) ? (stored.rival as RivalId) : null,
  };
}

export function isCpu(settings: Settings, player: 0 | 1): boolean {
  return settings.players === 'cpuVsCpu' || (settings.players === 'humanVsCpu' && player === 1);
}

export function matchOptionsFrom(settings: Settings, seed: number): MatchOptions {
  const kinds = settings.powerUps
    ? POWER_UP_KINDS.filter((kind) => settings.powerUpKinds[kind])
    : [];
  return {
    seed,
    world: settings.world,
    points: settings.points,
    format: settings.format,
    powerUps: kinds,
  };
}
