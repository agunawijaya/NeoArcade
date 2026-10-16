import type { Deck } from './engine/flight';
import type { ControlScheme } from './game/input';
import type { Livery } from './world/jumbo';

/**
 * The player's settings, kept in this browser. Everything here changes how
 * the flight is shown, heard or flown by hand; nothing changes the rules.
 */
export type SpeakingRate = 'slow' | 'normal' | 'fast';
export type CockpitLightingChoice = 'auto' | 'day' | 'dusk' | 'night';
/** The menus' colours: the device's choice, or light or dark whatever it says. The cockpit keeps its own. */
export type MenuTheme = 'auto' | 'light' | 'dark';

export interface Settings {
  controls: ControlScheme;
  atcVoice: boolean;
  voiceVolume: number;
  effectsVolume: number;
  subtitles: boolean;
  speakingRate: SpeakingRate;
  /** Coaching lines on screen: always at Arcade, by choice at Pilot. */
  hints: boolean;
  /** Hints pause the game until read (Arcade). */
  pauseOnHints: boolean;
  cockpitLighting: CockpitLightingChoice;
  detail: 'high' | 'low';
  invertPitch: boolean;
  menuTheme: MenuTheme;
  /** The jumbo's colours in the replay; the others than Brightwater's come with the Arcade Pass. */
  livery: Livery;
  /** The captain's cap on the glareshield, once the Captain's Hat badge has earned it. */
  glareshieldCap: boolean;
  /** The flight deck a briefing starts with: the classic one, or the glass one. */
  flightDeck: Deck;
}

export function defaultSettings(): Settings {
  return {
    controls: 'modern',
    atcVoice: true,
    voiceVolume: 0.9,
    effectsVolume: 0.8,
    subtitles: true,
    speakingRate: 'normal',
    hints: true,
    pauseOnHints: false,
    cockpitLighting: 'auto',
    detail: 'high',
    invertPitch: false,
    menuTheme: 'auto',
    livery: 'brightwater',
    glareshieldCap: true,
    flightDeck: 'classic',
  };
}

const oneOf = <T extends string>(value: unknown, choices: readonly T[], fallback: T): T =>
  choices.includes(value as T) ? (value as T) : fallback;

const unit = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;

export function sanitiseSettings(raw: unknown): Settings {
  const fallback = defaultSettings();
  const value = (raw ?? {}) as Partial<Record<keyof Settings, unknown>>;
  return {
    controls: oneOf(value.controls, ['modern', 'singleFile', 'ibm'] as const, fallback.controls),
    atcVoice: typeof value.atcVoice === 'boolean' ? value.atcVoice : fallback.atcVoice,
    voiceVolume: unit(value.voiceVolume, fallback.voiceVolume),
    effectsVolume: unit(value.effectsVolume, fallback.effectsVolume),
    subtitles: typeof value.subtitles === 'boolean' ? value.subtitles : fallback.subtitles,
    speakingRate: oneOf(
      value.speakingRate,
      ['slow', 'normal', 'fast'] as const,
      fallback.speakingRate,
    ),
    hints: typeof value.hints === 'boolean' ? value.hints : fallback.hints,
    pauseOnHints:
      typeof value.pauseOnHints === 'boolean' ? value.pauseOnHints : fallback.pauseOnHints,
    cockpitLighting: oneOf(
      value.cockpitLighting,
      ['auto', 'day', 'dusk', 'night'] as const,
      fallback.cockpitLighting,
    ),
    detail: oneOf(value.detail, ['high', 'low'] as const, fallback.detail),
    invertPitch: typeof value.invertPitch === 'boolean' ? value.invertPitch : fallback.invertPitch,
    menuTheme: oneOf(value.menuTheme, ['auto', 'light', 'dark'] as const, fallback.menuTheme),
    livery: oneOf(
      value.livery,
      ['brightwater', 'sunrise', 'silver', 'night', 'academy'] as const,
      fallback.livery,
    ),
    glareshieldCap:
      typeof value.glareshieldCap === 'boolean' ? value.glareshieldCap : fallback.glareshieldCap,
    flightDeck: oneOf(value.flightDeck, ['classic', 'glass'] as const, fallback.flightDeck),
  };
}
