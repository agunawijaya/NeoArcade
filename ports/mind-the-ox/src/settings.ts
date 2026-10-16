import type { Store } from '@shared/storage';
import type { FlightModel } from './engine/rules';
import { SORTIE_MISSIONS, type SortieOptions } from './game/sortie';
import type { CpuLevel, Loadout } from './engine/world';
import type { CameraView } from './render/view';
import { isThemeId, type ThemeId } from './themes';

/** Everything the plane can be asked to do from a key. */
export type FlyingAction =
  | 'pull'
  | 'push'
  | 'faster'
  | 'slower'
  | 'flip'
  | 'fire'
  | 'bomb'
  | 'missile'
  | 'starburst'
  | 'home'
  | 'loadout';

export const FLYING_ACTIONS: readonly FlyingAction[] = [
  'pull',
  'push',
  'faster',
  'slower',
  'flip',
  'fire',
  'bomb',
  'missile',
  'starburst',
  'home',
  'loadout',
];

/**
 * Three sets of keys: one player alone, and the left and right halves of
 * the keyboard when two share it. Alone, the player picks the modern
 * layout or 1984's; any key in any set can be changed in Settings.
 */
export type KeySetId = 'solo' | 'left' | 'right';
export type KeyLayout = 'modern' | 'classic';

export type KeyChoices = Partial<Record<FlyingAction, string>>;

export interface Settings {
  theme: ThemeId;
  camera: CameraView;
  /** Smooth flight or 1984's sixteen headings, for every mode but Classic 1984 (always sixteen). */
  flight: FlightModel;
  autoRoll: boolean;
  /** The four-colour CGA picture, in Classic 1984. */
  cga: boolean;
  /** Missiles and starbursts, once the Secret Hangar has been found. */
  secretWeapons: boolean;
  /** On-screen controls: shown on touch screens, always, or never. */
  touch: 'auto' | 'on' | 'off';
  layout: KeyLayout;
  keys: Readonly<Record<KeySetId, KeyChoices>>;
  dogfight: { opponents: 1 | 3; level: CpuLevel };
  twoPlayer: 'coop' | 'versus';
  /** At sea: a steady deck and wider wires, never, or as the mission's difficulty has it. */
  landingAssist: 'auto' | 'on' | 'off';
  /** What a plane on a carrier starts with: as the briefing suggests, or always the same. */
  loadout: 'briefing' | Loadout;
  /** The last Custom Sortie built, to start from next time. */
  sortie: SortieOptions;
}

export const CPU_LEVELS: readonly CpuLevel[] = ['easy', 'normal', 'hard', 'brutal'];

export function defaultSettings(): Settings {
  return {
    theme: 'great-war',
    camera: 'side',
    flight: 'smooth',
    autoRoll: true,
    cga: false,
    secretWeapons: true,
    touch: 'auto',
    layout: 'modern',
    keys: { solo: {}, left: {}, right: {} },
    dogfight: { opponents: 1, level: 'normal' },
    twoPlayer: 'coop',
    landingAssist: 'auto',
    loadout: 'briefing',
    sortie: {
      base: 'carrier',
      mission: 'anti-ship',
      enemy: 'both',
      seaState: 1,
      hour: 'day',
      level: 'normal',
      theme: 'great-war',
      seed: 1916,
    },
  };
}

/** The keys each set starts with, by KeyboardEvent.code. */
export function defaultKeys(set: KeySetId, layout: KeyLayout): Record<FlyingAction, string> {
  if (set === 'left') {
    return {
      pull: 'KeyW',
      push: 'KeyS',
      faster: 'KeyD',
      slower: 'KeyA',
      flip: 'KeyQ',
      fire: 'KeyG',
      bomb: 'KeyF',
      missile: 'KeyR',
      starburst: 'KeyT',
      home: 'KeyE',
      loadout: 'KeyZ',
    };
  }
  if (set === 'right') {
    return {
      pull: 'ArrowUp',
      push: 'ArrowDown',
      faster: 'ArrowRight',
      slower: 'ArrowLeft',
      flip: 'Slash',
      fire: 'Period',
      bomb: 'Comma',
      missile: 'KeyL',
      starburst: 'KeyK',
      home: 'KeyM',
      loadout: 'KeyJ',
    };
  }
  if (layout === 'classic') {
    // 1984's own table: X faster, Z slower, comma up, slash down, full stop flip, V and C the secrets.
    return {
      pull: 'Comma',
      push: 'Slash',
      faster: 'KeyX',
      slower: 'KeyZ',
      flip: 'Period',
      fire: 'Space',
      bomb: 'KeyB',
      missile: 'KeyV',
      starburst: 'KeyC',
      home: 'KeyH',
      loadout: 'KeyT',
    };
  }
  return {
    pull: 'KeyW',
    push: 'KeyS',
    faster: 'KeyD',
    slower: 'KeyA',
    flip: 'KeyF',
    fire: 'Space',
    bomb: 'KeyB',
    missile: 'KeyM',
    starburst: 'KeyV',
    home: 'KeyH',
    loadout: 'KeyT',
  };
}

/** A set's keys as the player has them: the defaults with their own choices on top. */
export function keysFor(settings: Settings, set: KeySetId): Record<FlyingAction, string> {
  return { ...defaultKeys(set, settings.layout), ...settings.keys[set] };
}

const ARROWS: Readonly<Partial<Record<FlyingAction, string>>> = {
  pull: 'ArrowUp',
  push: 'ArrowDown',
  faster: 'ArrowRight',
  slower: 'ArrowLeft',
};

/**
 * Second keys that fly the plane too: alone with the modern layout, the
 * arrows do what W, S, A and D do. An arrow the player has given to
 * something else keeps that job and is not doubled up.
 */
export function spareKeysFor(
  settings: Settings,
  set: KeySetId,
): Partial<Record<FlyingAction, string>> {
  if (set !== 'solo' || settings.layout !== 'modern') return {};
  const taken = new Set(Object.values(keysFor(settings, set)));
  const spare: Partial<Record<FlyingAction, string>> = {};
  for (const action of FLYING_ACTIONS) {
    const arrow = ARROWS[action];
    if (arrow && !taken.has(arrow)) spare[action] = arrow;
  }
  return spare;
}

/** Rebuilds settings from storage, field by field, falling back on anything unexpected. */
export function sanitiseSettings(raw: unknown): Settings {
  const fallback = defaultSettings();
  if (typeof raw !== 'object' || raw === null) return fallback;
  const stored = raw as Partial<Record<keyof Settings, unknown>>;
  const dogfight = (
    typeof stored.dogfight === 'object' && stored.dogfight !== null ? stored.dogfight : {}
  ) as Partial<Record<keyof Settings['dogfight'], unknown>>;
  const keys = (
    typeof stored.keys === 'object' && stored.keys !== null ? stored.keys : {}
  ) as Partial<Record<KeySetId, unknown>>;
  return {
    theme: isThemeId(stored.theme) ? stored.theme : fallback.theme,
    camera: oneOf(stored.camera, ['side', 'diorama'] as const, fallback.camera),
    flight: oneOf(stored.flight, ['smooth', 'classic'] as const, fallback.flight),
    autoRoll: flag(stored.autoRoll, fallback.autoRoll),
    cga: flag(stored.cga, fallback.cga),
    secretWeapons: flag(stored.secretWeapons, fallback.secretWeapons),
    touch: oneOf(stored.touch, ['auto', 'on', 'off'] as const, fallback.touch),
    layout: oneOf(stored.layout, ['modern', 'classic'] as const, fallback.layout),
    keys: {
      solo: keyChoices(keys.solo),
      left: keyChoices(keys.left),
      right: keyChoices(keys.right),
    },
    dogfight: {
      opponents: dogfight.opponents === 3 ? 3 : 1,
      level: oneOf(dogfight.level, CPU_LEVELS, fallback.dogfight.level),
    },
    twoPlayer: oneOf(stored.twoPlayer, ['coop', 'versus'] as const, fallback.twoPlayer),
    landingAssist: oneOf(
      stored.landingAssist,
      ['auto', 'on', 'off'] as const,
      fallback.landingAssist,
    ),
    loadout: oneOf(stored.loadout, ['briefing', 'bombs', 'torpedo'] as const, fallback.loadout),
    sortie: sortieChoices(stored.sortie, fallback.sortie),
  };
}

function sortieChoices(value: unknown, fallback: SortieOptions): SortieOptions {
  if (typeof value !== 'object' || value === null) return fallback;
  const stored = value as Partial<Record<keyof SortieOptions, unknown>>;
  const seed = Number(stored.seed);
  return {
    base: oneOf(stored.base, ['carrier', 'airfield'] as const, fallback.base),
    mission: oneOf(
      stored.mission,
      SORTIE_MISSIONS.map((mission) => mission.id),
      fallback.mission,
    ),
    enemy: oneOf(stored.enemy, ['land', 'sea', 'both'] as const, fallback.enemy),
    seaState: stored.seaState === 0 || stored.seaState === 2 ? stored.seaState : 1,
    hour: oneOf(stored.hour, ['day', 'dusk', 'night'] as const, fallback.hour),
    level: oneOf(stored.level, CPU_LEVELS, fallback.level),
    theme: isThemeId(stored.theme) ? stored.theme : fallback.theme,
    seed: Number.isInteger(seed) && seed >= 0 && seed < 2 ** 32 ? seed : fallback.seed,
  };
}

function keyChoices(value: unknown): KeyChoices {
  if (typeof value !== 'object' || value === null) return {};
  const choices: KeyChoices = {};
  for (const action of FLYING_ACTIONS) {
    const code = (value as Record<string, unknown>)[action];
    if (typeof code === 'string' && /^[A-Za-z0-9]{1,24}$/.test(code)) choices[action] = code;
  }
  return choices;
}

function oneOf<T extends string>(value: unknown, options: readonly T[], otherwise: T): T {
  return options.includes(value as T) ? (value as T) : otherwise;
}

function flag(value: unknown, otherwise: boolean): boolean {
  return typeof value === 'boolean' ? value : otherwise;
}

/** Light is a summer morning, dark a night raid; "auto" follows the device. */
export type LightChoice = 'auto' | 'day' | 'night';

/**
 * The player's light, saved at once and applied at once; index.html reads
 * the same key ("theme", as every NeoArcade game calls light and dark)
 * before the first paint.
 */
export class LightPreference {
  private current: LightChoice;
  private readonly device = matchMedia('(prefers-color-scheme: light)');
  private readonly listeners = new Set<() => void>();

  constructor(private readonly store: Store) {
    const stored = store.get<unknown>('theme', 'auto');
    this.current = stored === 'light' ? 'day' : stored === 'dark' ? 'night' : 'auto';
    this.device.addEventListener('change', () => {
      if (this.current === 'auto') this.notify();
    });
  }

  get choice(): LightChoice {
    return this.current;
  }

  get lighting(): 'day' | 'night' {
    if (this.current !== 'auto') return this.current;
    return this.device.matches ? 'day' : 'night';
  }

  choose(choice: LightChoice) {
    if (choice === this.current) return;
    this.current = choice;
    this.store.set('theme', choice === 'day' ? 'light' : choice === 'night' ? 'dark' : 'auto');
    this.notify();
  }

  onChange(listener: () => void) {
    this.listeners.add(listener);
  }

  private notify() {
    for (const listener of this.listeners) listener();
  }
}
