import type { RouteId } from '../engine/routes';

/**
 * Every colour the scene uses, per place and time of day. The home look is a
 * farm road at golden hour; each Road Trip route has its own. The light theme
 * swaps dusk for broad daylight, except on Foggy Night, which stays night.
 */
export type Theme = 'light' | 'dark';
export type LookId = 'home' | RouteId;
export type Weather = 'none' | 'pollen' | 'mist' | 'heat' | 'fireflies' | 'snow';
export type PropKind =
  | 'tree'
  | 'pine'
  | 'bush'
  | 'hay'
  | 'fence'
  | 'pole'
  | 'barn'
  | 'windmill'
  | 'cactus'
  | 'rock'
  | 'mesa'
  | 'lamp'
  | 'snowman'
  | 'flowers';

export interface Palette {
  look: LookId;
  /** 1 in full daylight, 0 at night: headlights, lit windows and stars follow it. */
  daylight: number;
  sky: readonly [string, string, string];
  sun: { colour: string; glow: string; height: number; x: number; moon: boolean };
  stars: boolean;
  mountains: readonly [string, string];
  /** The colour distance fades into. */
  haze: string;
  fog: number;
  grass: readonly [string, string, string];
  /** Rows of crops in the fields. */
  crop: string;
  verge: string;
  asphalt: string;
  asphaltLight: string;
  edgeLine: string;
  dash: string;
  mud: string;
  mudShine: string;
  fence: string;
  trunk: string;
  foliage: readonly [string, string, string];
  accent: string;
  rock: string;
  roof: string;
  wall: string;
  shadow: string;
  weather: Weather;
  /** Roadside things, most common first. */
  props: readonly PropKind[];
  /** The post-processing grade for this light. */
  grade: {
    exposure: number;
    contrast: number;
    saturation: number;
    tint: readonly [number, number, number];
  };
}

const HOME_DUSK: Palette = {
  look: 'home',
  daylight: 0.7,
  sky: ['#3b3a78', '#e0806a', '#ffd08a'],
  sun: { colour: '#fff1c4', glow: 'rgba(255, 190, 110, 0.55)', height: 0.22, x: 0.72, moon: false },
  stars: false,
  mountains: ['#8a6c8e', '#6b5579'],
  haze: '#f3b58a',
  fog: 0.35,
  grass: ['#8fa546', '#b5c35a', '#6b8433'],
  crop: '#d9b44a',
  verge: '#c9a26a',
  asphalt: '#4a4252',
  asphaltLight: '#5c5364',
  edgeLine: '#f6e6c8',
  dash: '#ffd978',
  mud: '#6e4a2c',
  mudShine: '#9c7048',
  fence: '#a0714a',
  trunk: '#6c4a35',
  foliage: ['#4f7a3a', '#6f9a45', '#9bbb58'],
  accent: '#f4c542',
  rock: '#a39383',
  roof: '#b3473c',
  wall: '#f0dcc0',
  shadow: 'rgba(60, 30, 50, 0.32)',
  weather: 'pollen',
  props: ['tree', 'fence', 'hay', 'pole', 'bush', 'flowers', 'barn', 'windmill'],
  grade: { exposure: 1.02, contrast: 1.04, saturation: 1.08, tint: [1.04, 0.99, 0.94] },
};

const HOME_DAY: Palette = {
  ...HOME_DUSK,
  daylight: 1,
  sky: ['#4f9fe0', '#9fd4f5', '#e6f5ff'],
  sun: { colour: '#fffbe6', glow: 'rgba(255, 245, 200, 0.5)', height: 0.78, x: 0.78, moon: false },
  mountains: ['#9ab7c9', '#7f9fb0'],
  haze: '#d8ecf6',
  fog: 0.25,
  grass: ['#8bbd4c', '#aad160', '#6d9a3a'],
  crop: '#e3c25a',
  verge: '#d6b886',
  asphalt: '#5a5f66',
  asphaltLight: '#6d737b',
  edgeLine: '#ffffff',
  dash: '#ffe07a',
  shadow: 'rgba(30, 50, 40, 0.26)',
  grade: { exposure: 1, contrast: 1.02, saturation: 1.06, tint: [1, 1, 1] },
};

// Foggy Night is night in either theme.
const NIGHT: Palette = {
  ...HOME_DUSK,
  look: 'night',
  daylight: 0,
  sky: ['#070b1e', '#16204a', '#2a3563'],
  sun: { colour: '#f4f1dc', glow: 'rgba(200, 210, 255, 0.35)', height: 0.62, x: 0.8, moon: true },
  stars: true,
  mountains: ['#1d2548', '#141a36'],
  haze: '#2c3866',
  fog: 0.7,
  grass: ['#23402f', '#2d4f39', '#1a3225'],
  crop: '#34503a',
  verge: '#3a3a44',
  asphalt: '#1f2230',
  asphaltLight: '#2a2e3e',
  edgeLine: '#c9d2ee',
  dash: '#f0d27a',
  fence: '#4a3c3a',
  trunk: '#2e2626',
  foliage: ['#16301f', '#1f4029', '#2b5236'],
  accent: '#ffe27a',
  roof: '#4a2a36',
  wall: '#5c5870',
  shadow: 'rgba(0, 0, 10, 0.45)',
  weather: 'fireflies',
  props: ['tree', 'lamp', 'fence', 'bush', 'pole', 'barn'],
  grade: { exposure: 1.05, contrast: 1.06, saturation: 1, tint: [0.94, 0.98, 1.08] },
};

const LOOKS: Record<LookId, Record<Theme, Palette>> = {
  home: { dark: HOME_DUSK, light: HOME_DAY },
  farm: {
    dark: { ...HOME_DUSK, look: 'farm' },
    light: { ...HOME_DAY, look: 'farm' },
  },
  mountain: {
    dark: {
      ...HOME_DUSK,
      look: 'mountain',
      daylight: 0.6,
      sky: ['#2c3f66', '#7c8fb3', '#d5c7d3'],
      sun: {
        colour: '#fde8d0',
        glow: 'rgba(240, 200, 200, 0.4)',
        height: 0.3,
        x: 0.3,
        moon: false,
      },
      mountains: ['#8190ad', '#5c6a88'],
      haze: '#c8c8d8',
      fog: 0.6,
      grass: ['#5f8a5a', '#7aa06e', '#46704a'],
      crop: '#8fb07a',
      verge: '#9c9180',
      asphalt: '#454a55',
      asphaltLight: '#565c68',
      foliage: ['#2f5a45', '#3f7055', '#5a8a64'],
      rock: '#8d8f99',
      weather: 'mist',
      props: ['pine', 'rock', 'fence', 'pine', 'pole', 'bush'],
      grade: { exposure: 1, contrast: 1, saturation: 0.95, tint: [0.97, 0.99, 1.04] },
    },
    light: {
      ...HOME_DAY,
      look: 'mountain',
      sky: ['#5b8fd0', '#a8c8ea', '#eef3f8'],
      mountains: ['#a3b4cc', '#7d8fab'],
      haze: '#e3ebf3',
      fog: 0.5,
      grass: ['#6f9c5e', '#8cb574', '#517d4a'],
      crop: '#9cc585',
      verge: '#aea593',
      foliage: ['#2f6048', '#407a58', '#5f9a6a'],
      rock: '#9c9ea8',
      weather: 'mist',
      props: ['pine', 'rock', 'fence', 'pine', 'pole', 'bush'],
    },
  },
  desert: {
    dark: {
      ...HOME_DUSK,
      look: 'desert',
      daylight: 0.75,
      sky: ['#46306e', '#e56b4f', '#ffc36b'],
      sun: {
        colour: '#fff0b0',
        glow: 'rgba(255, 170, 80, 0.6)',
        height: 0.18,
        x: 0.5,
        moon: false,
      },
      mountains: ['#b0645a', '#8a4a4a'],
      haze: '#f6a86a',
      fog: 0.3,
      grass: ['#d9a15d', '#e8b877', '#c28246'],
      crop: '#e8c27a',
      verge: '#e2b98a',
      asphalt: '#4d3f45',
      asphaltLight: '#5f4f55',
      foliage: ['#5f7d3c', '#76954a', '#93ad5c'],
      accent: '#e2593e',
      rock: '#b8704f',
      weather: 'heat',
      props: ['cactus', 'rock', 'mesa', 'pole', 'bush', 'cactus'],
      grade: { exposure: 1.03, contrast: 1.05, saturation: 1.1, tint: [1.06, 0.98, 0.92] },
    },
    light: {
      ...HOME_DAY,
      look: 'desert',
      sky: ['#3f8fd8', '#8fc8f0', '#fbeed2'],
      sun: {
        colour: '#ffffff',
        glow: 'rgba(255, 250, 220, 0.6)',
        height: 0.85,
        x: 0.5,
        moon: false,
      },
      mountains: ['#d39a74', '#b87b5c'],
      haze: '#fbe7c7',
      fog: 0.25,
      grass: ['#e4b673', '#f0ca8e', '#cf9a58'],
      crop: '#f2d493',
      verge: '#ecd0a2',
      foliage: ['#5f8a3c', '#78a24a', '#98bd5c'],
      accent: '#e2593e',
      rock: '#c98460',
      weather: 'heat',
      props: ['cactus', 'rock', 'mesa', 'pole', 'bush', 'cactus'],
    },
  },
  night: { dark: NIGHT, light: NIGHT },
  snow: {
    dark: {
      ...HOME_DUSK,
      look: 'snow',
      daylight: 0.55,
      sky: ['#26336b', '#8b8fc6', '#f2c6c6'],
      sun: {
        colour: '#fff4e8',
        glow: 'rgba(255, 210, 210, 0.4)',
        height: 0.2,
        x: 0.62,
        moon: false,
      },
      mountains: ['#b7bde0', '#9097c4'],
      haze: '#e3d8ec',
      fog: 0.45,
      grass: ['#e9eef7', '#ffffff', '#cfd8ea'],
      crop: '#dfe6f1',
      verge: '#d2d8e6',
      asphalt: '#50556a',
      asphaltLight: '#61677e',
      edgeLine: '#ffffff',
      foliage: ['#2c5046', '#3d6758', '#e9f0f7'],
      accent: '#d64545',
      rock: '#a4a9bd',
      weather: 'snow',
      props: ['pine', 'snowman', 'fence', 'pine', 'pole', 'rock'],
      grade: { exposure: 1.02, contrast: 1.02, saturation: 0.95, tint: [0.98, 0.99, 1.05] },
    },
    light: {
      ...HOME_DAY,
      look: 'snow',
      sky: ['#6aa3dc', '#b9d8f2', '#f5f9ff'],
      mountains: ['#c9d6ea', '#a8b9d6'],
      haze: '#eef4fb',
      fog: 0.35,
      grass: ['#eef3fa', '#ffffff', '#d5deee'],
      crop: '#e6edf6',
      verge: '#dfe5ef',
      edgeLine: '#e0e6f0',
      foliage: ['#2f5a4c', '#43705f', '#f4f8fc'],
      accent: '#d64545',
      rock: '#aab0c4',
      weather: 'snow',
      props: ['pine', 'snowman', 'fence', 'pine', 'pole', 'rock'],
    },
  },
};

export function paletteFor(look: LookId, theme: Theme): Palette {
  return LOOKS[look][theme];
}

/** The looks Endless drives through, one after another. */
export const ENDLESS_LOOKS: readonly LookId[] = ['home', 'mountain', 'desert', 'night', 'snow'];

/** Donkey coats: body, belly and muzzle, mane and ear tips. */
export const COATS = [
  { body: '#8c8a8f', light: '#d9d3cc', dark: '#3d3a40' },
  { body: '#7a5c48', light: '#e3cdb5', dark: '#3b2a22' },
  { body: '#b39a7f', light: '#f1e4d2', dark: '#5a4636' },
  { body: '#6f7075', light: '#e6e4e0', dark: '#2c2c31' },
] as const;

export type Coat = (typeof COATS)[number];

export function coatFor(seed: number): Coat {
  return COATS[Math.abs(seed) % COATS.length] as Coat;
}

/** Mixes two colours (#rrggbb or rgb()); t = 0 gives `from`. */
export function mix(from: string, to: string, t: number): string {
  const a = parseHex(from);
  const b = parseHex(to);
  const channel = (index: number) => Math.round(a[index]! + (b[index]! - a[index]!) * t);
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
}

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Reads #rrggbb, or the rgb(r, g, b) that mix() itself returns. */
function parseHex(colour: string): [number, number, number] {
  if (colour.startsWith('rgb')) {
    const [r = 0, g = 0, b = 0] = colour.match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
    return [r, g, b];
  }
  const value = Number.parseInt(colour.replace('#', ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** The garage's swatch for the rainbow trail. */
export const RAINBOW_SWATCH =
  'linear-gradient(135deg, #ff5e5e, #ffb14a, #ffe45c, #5fd67a, #4ab8ff, #9a7bff)';
