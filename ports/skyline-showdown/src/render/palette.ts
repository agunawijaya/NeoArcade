import type { WorldId } from '../engine/worlds';

/**
 * Colours for one world at one moment of the day. Each world has four
 * looks: dusk, night and dawn for the dark theme, and a bright day that
 * stands in for dusk and dawn in the light theme. The day cycle blends
 * between them.
 */
export interface Palette {
  skyTop: string;
  skyMiddle: string;
  skyHorizon: string;
  /** Glow low in the sky behind the city. */
  horizonGlow: string;
  farCity: string;
  midCity: string;
  haze: string;
  facades: string[];
  windowLit: string[];
  windowDark: string;
  street: string;
  /** Light from the sky on the gorillas' edges. */
  rimLight: string;
  /** 0 = no stars, 1 = full starfield. */
  stars: number;
  /** How bright the face in the sky is. */
  bodyGlow: number;
  cloud: string;
  /** 0 in the dark looks, 1 in full daylight: dims street lamps and softens the bloom. */
  daylight: number;
  /** Colour grading handed to the post-processing pass. */
  grade: { exposure: number; saturation: number; contrast: number; tint: [number, number, number] };
}

export type TimeOfDay = number;

type Key = 'dusk' | 'night' | 'dawn' | 'day';

export type Theme = 'light' | 'dark';

const EARTH: Record<Key, Palette> = {
  dusk: {
    skyTop: '#1c1446',
    skyMiddle: '#6b2f6e',
    skyHorizon: '#f07a4a',
    horizonGlow: '#ffb35c',
    farCity: '#3a1f52',
    midCity: '#2a1640',
    haze: '#c4607a',
    facades: ['#3b2a55', '#4a2f4f', '#2f3558', '#503345', '#36405e', '#44324f'],
    windowLit: ['#ffd27a', '#ffc160', '#ffe3a3', '#ffb07a'],
    windowDark: '#1c1528',
    street: '#120c1c',
    rimLight: '#ff9d6c',
    stars: 0.25,
    bodyGlow: 1,
    cloud: '#d9829a',
    daylight: 0,
    grade: { exposure: 1.02, saturation: 1.08, contrast: 1.04, tint: [1.03, 0.98, 0.98] },
  },
  night: {
    skyTop: '#05061a',
    skyMiddle: '#0f1438',
    skyHorizon: '#2a2860',
    horizonGlow: '#5b3f8c',
    farCity: '#131634',
    midCity: '#0d1029',
    haze: '#3a3a78',
    facades: ['#1b1e3a', '#22203d', '#1a2540', '#262240', '#1d2a45', '#241e38'],
    windowLit: ['#ffd98a', '#ffc76a', '#cfe4ff', '#ffe9b0'],
    windowDark: '#0b0c1c',
    street: '#06070f',
    rimLight: '#7c8cff',
    stars: 1,
    bodyGlow: 0.75,
    cloud: '#3c3f73',
    daylight: 0,
    grade: { exposure: 1, saturation: 1.02, contrast: 1.06, tint: [0.96, 0.98, 1.05] },
  },
  dawn: {
    skyTop: '#2b3f78',
    skyMiddle: '#8a7fb8',
    skyHorizon: '#ffc9a0',
    horizonGlow: '#ffe0b3',
    farCity: '#5d5a8a',
    midCity: '#48456f',
    haze: '#f2b8b0',
    facades: ['#4d4a74', '#5a4a6b', '#44557a', '#634f68', '#4a5f80', '#57506e'],
    windowLit: ['#ffe2a8', '#ffd18c', '#fff0cc', '#ffcaa0'],
    windowDark: '#2a2840',
    street: '#1e1a2c',
    rimLight: '#ffd6b0',
    stars: 0.05,
    bodyGlow: 1,
    cloud: '#ffd0c4',
    daylight: 0,
    grade: { exposure: 1.04, saturation: 1.02, contrast: 1, tint: [1.02, 1, 0.99] },
  },
  day: {
    skyTop: '#3a86d6',
    skyMiddle: '#79b6ea',
    skyHorizon: '#d4eaf7',
    horizonGlow: '#fff4d6',
    farCity: '#9db3cb',
    midCity: '#8198b3',
    haze: '#dcebf5',
    facades: ['#8c7f9c', '#9c8a86', '#7c8ba2', '#a69484', '#8797aa', '#96889c'],
    windowLit: ['#d2e8ff', '#b8d6f2', '#e8f3ff', '#a8c6e6'],
    windowDark: '#4c566b',
    street: '#3c414d',
    rimLight: '#fff3d8',
    stars: 0,
    bodyGlow: 1,
    cloud: '#ffffff',
    daylight: 1,
    grade: { exposure: 1, saturation: 1.04, contrast: 1.03, tint: [1, 1, 1] },
  },
};

const MOON: Record<Key, Palette> = {
  dusk: {
    skyTop: '#020208',
    skyMiddle: '#070918',
    skyHorizon: '#141a33',
    horizonGlow: '#2d3f6e',
    farCity: '#1d2236',
    midCity: '#161a2b',
    haze: '#27325a',
    facades: ['#3a3f52', '#434859', '#353a4c', '#4a4a57', '#3d4557', '#44414f'],
    windowLit: ['#9fe8ff', '#bff2ff', '#ffe3a0', '#8fd8ff'],
    windowDark: '#151722',
    street: '#0c0d14',
    rimLight: '#8ed0ff',
    stars: 1,
    bodyGlow: 0.95,
    cloud: '#00000000',
    daylight: 0,
    grade: { exposure: 1, saturation: 0.9, contrast: 1.1, tint: [0.95, 1, 1.06] },
  },
  night: {
    skyTop: '#000003',
    skyMiddle: '#03040c',
    skyHorizon: '#0b0e1f',
    horizonGlow: '#1d2850',
    farCity: '#121626',
    midCity: '#0e111e',
    haze: '#1a2243',
    facades: ['#2a2e3d', '#303342', '#262a38', '#353542', '#2c3342', '#322f3b'],
    windowLit: ['#9fe8ff', '#bff2ff', '#ffe3a0', '#8fd8ff'],
    windowDark: '#0e0f18',
    street: '#07080d',
    rimLight: '#6fb8ff',
    stars: 1,
    bodyGlow: 1,
    cloud: '#00000000',
    daylight: 0,
    grade: { exposure: 0.98, saturation: 0.88, contrast: 1.12, tint: [0.94, 1, 1.08] },
  },
  dawn: {
    skyTop: '#03030b',
    skyMiddle: '#0c1022',
    skyHorizon: '#26304f',
    horizonGlow: '#7b8fb8',
    farCity: '#2b3044',
    midCity: '#222638',
    haze: '#3c4a70',
    facades: ['#474b5d', '#505365', '#424759', '#56545f', '#495164', '#514d5b'],
    windowLit: ['#b0edff', '#d0f6ff', '#ffe9b5', '#a0e0ff'],
    windowDark: '#1b1d29',
    street: '#101119',
    rimLight: '#d6e8ff',
    stars: 0.8,
    bodyGlow: 1,
    cloud: '#00000000',
    daylight: 0,
    grade: { exposure: 1.02, saturation: 0.9, contrast: 1.08, tint: [0.98, 1, 1.04] },
  },
  day: {
    // No air, so the sky stays black even with the Sun up; only the ground is lit.
    skyTop: '#000000',
    skyMiddle: '#04050b',
    skyHorizon: '#10131e',
    horizonGlow: '#36415c',
    farCity: '#5c606e',
    midCity: '#4a4e5b',
    haze: '#2c3242',
    facades: ['#9a9da8', '#a9a9b1', '#8f94a0', '#b1aeb4', '#98a0ac', '#a6a1aa'],
    windowLit: ['#dae7f3', '#c6d5e5', '#eef4fa', '#bacbdc'],
    windowDark: '#3b3e49',
    street: '#5e6068',
    rimLight: '#ffffff',
    stars: 0.35,
    bodyGlow: 1,
    cloud: '#00000000',
    daylight: 1,
    grade: { exposure: 1.02, saturation: 0.88, contrast: 1.1, tint: [1, 1, 1.02] },
  },
};

const MARS: Record<Key, Palette> = {
  dusk: {
    skyTop: '#1e1428',
    skyMiddle: '#6e4a4e',
    skyHorizon: '#d49a6a',
    horizonGlow: '#9cc4e8',
    farCity: '#5a3530',
    midCity: '#472824',
    haze: '#b77a5a',
    facades: ['#6b3b2e', '#7a4632', '#5e3a33', '#80503a', '#6a4436', '#744032'],
    windowLit: ['#ffc98a', '#ffb070', '#ffe0a8', '#9fd3ff'],
    windowDark: '#2a1714',
    street: '#1e100d',
    rimLight: '#9cc6f0',
    stars: 0.35,
    bodyGlow: 0.9,
    cloud: '#c9967a',
    daylight: 0,
    grade: { exposure: 1.02, saturation: 1.05, contrast: 1.05, tint: [1.04, 0.98, 0.95] },
  },
  night: {
    skyTop: '#0b0710',
    skyMiddle: '#1d1320',
    skyHorizon: '#3a2530',
    horizonGlow: '#5e3a3a',
    farCity: '#2d1a1a',
    midCity: '#241414',
    haze: '#5e3530',
    facades: ['#3d241e', '#472a22', '#3a2622', '#4d3026', '#3f2c26', '#452822'],
    windowLit: ['#ffc98a', '#ffb070', '#ffe0a8', '#9fd3ff'],
    windowDark: '#170c0a',
    street: '#0f0807',
    rimLight: '#d48a6a',
    stars: 1,
    bodyGlow: 0.8,
    cloud: '#5a3a36',
    daylight: 0,
    grade: { exposure: 1, saturation: 1.02, contrast: 1.08, tint: [1.04, 0.97, 0.96] },
  },
  dawn: {
    skyTop: '#6a4a3a',
    skyMiddle: '#c28a5e',
    skyHorizon: '#e8c49a',
    horizonGlow: '#fbe2c0',
    farCity: '#8a5a44',
    midCity: '#744a38',
    haze: '#e0a67c',
    facades: ['#8a4e38', '#9a5a40', '#7c4e40', '#a06448', '#8a5a44', '#94543e'],
    windowLit: ['#ffd9a0', '#ffc488', '#ffecc4', '#b8e0ff'],
    windowDark: '#3a2018',
    street: '#2c1810',
    rimLight: '#ffe0b8',
    stars: 0,
    bodyGlow: 1,
    cloud: '#f0c6a0',
    daylight: 0,
    grade: { exposure: 1.04, saturation: 1.04, contrast: 1.02, tint: [1.05, 0.99, 0.94] },
  },
  day: {
    // A Martian noon: dust turns the sky butterscotch.
    skyTop: '#b98b60',
    skyMiddle: '#d7ab7c',
    skyHorizon: '#eed2aa',
    horizonGlow: '#f8e8ca',
    farCity: '#b27c5c',
    midCity: '#9c684c',
    haze: '#eac69e',
    facades: ['#b2684c', '#c27858', '#a26c5a', '#ca8662', '#ac785e', '#ba7252'],
    windowLit: ['#f6e4ca', '#ead2b2', '#fff2de', '#dae6ee'],
    windowDark: '#5c362a',
    street: '#6c4232',
    rimLight: '#fff0d8',
    stars: 0,
    bodyGlow: 1,
    cloud: '#f6dec2',
    daylight: 1,
    grade: { exposure: 1, saturation: 1.02, contrast: 1.02, tint: [1.02, 1, 0.97] },
  },
};

const JUPITER: Record<Key, Palette> = {
  dusk: {
    skyTop: '#2a1a30',
    skyMiddle: '#7a4a3c',
    skyHorizon: '#e0a068',
    horizonGlow: '#ffcc88',
    farCity: '#4a2c2e',
    midCity: '#3a2226',
    haze: '#c07a58',
    facades: ['#4a3040', '#5a3a3a', '#3e3446', '#634036', '#4c3a48', '#583a3e'],
    windowLit: ['#ffd780', '#ffb860', '#ffe8a8', '#ffa070'],
    windowDark: '#1e1218',
    street: '#150c10',
    rimLight: '#ffb070',
    stars: 0.15,
    bodyGlow: 1,
    cloud: '#e8a878',
    daylight: 0,
    grade: { exposure: 1.02, saturation: 1.12, contrast: 1.05, tint: [1.05, 0.98, 0.94] },
  },
  night: {
    skyTop: '#0c0710',
    skyMiddle: '#241624',
    skyHorizon: '#4a2a2c',
    horizonGlow: '#7a4030',
    farCity: '#241418',
    midCity: '#1c1014',
    haze: '#5a3030',
    facades: ['#2c1c26', '#342224', '#281e2c', '#3a2622', '#2e2230', '#342226'],
    windowLit: ['#ffd780', '#ffb860', '#ffe8a8', '#ffa070'],
    windowDark: '#120a0e',
    street: '#0a0608',
    rimLight: '#ff9060',
    stars: 0.8,
    bodyGlow: 0.85,
    cloud: '#5a3432',
    daylight: 0,
    grade: { exposure: 1, saturation: 1.08, contrast: 1.08, tint: [1.06, 0.97, 0.95] },
  },
  dawn: {
    skyTop: '#4a3040',
    skyMiddle: '#b07860',
    skyHorizon: '#f5d0a0',
    horizonGlow: '#fff0c8',
    farCity: '#6a4448',
    midCity: '#56383c',
    haze: '#e0a888',
    facades: ['#5c4250', '#6c4a48', '#524656', '#765046', '#5e4a58', '#6a4a4c'],
    windowLit: ['#ffe0a0', '#ffc888', '#fff0c8', '#ffb890'],
    windowDark: '#2c1c24',
    street: '#20141a',
    rimLight: '#ffd0a0',
    stars: 0,
    bodyGlow: 1,
    cloud: '#f8c8a8',
    daylight: 0,
    grade: { exposure: 1.04, saturation: 1.08, contrast: 1.02, tint: [1.05, 0.99, 0.95] },
  },
  day: {
    skyTop: '#c99b6b',
    skyMiddle: '#e7c59b',
    skyHorizon: '#f7e5c5',
    horizonGlow: '#fff5de',
    farCity: '#b28a72',
    midCity: '#9a7460',
    haze: '#f2d6b2',
    facades: ['#906c7c', '#a2786c', '#88768c', '#b28068', '#927c90', '#a27a74'],
    windowLit: ['#fcedd2', '#f4deba', '#fff7e6', '#eadac2'],
    windowDark: '#4c3642',
    street: '#5c424a',
    rimLight: '#fff0d0',
    stars: 0,
    bodyGlow: 1,
    cloud: '#fff2de',
    daylight: 1,
    grade: { exposure: 1, saturation: 1.05, contrast: 1.02, tint: [1.02, 1, 0.98] },
  },
};

const WORLD_PALETTES: Record<WorldId, Record<Key, Palette>> = {
  earth: EARTH,
  moon: MOON,
  mars: MARS,
  jupiter: JUPITER,
};

/**
 * The time of day for a round: without the day cycle every round is dusk;
 * with it the city moves through dusk, night and dawn, half a step a round,
 * and on into the next evening.
 */
export function timeOfDayForRound(round: number, dayCycle: boolean): TimeOfDay {
  return dayCycle ? ((round - 1) * 0.5) % 3 : 0;
}

/** The darker half of the cycle, around midnight, when Earth's Moon is up. */
export function isNight(time: TimeOfDay): boolean {
  return time > 0.6 && time < 1.6;
}

/**
 * The look for a world at a time of day. The light theme swaps dusk and dawn
 * for broad daylight, but night stays night: when the Moon is up, the city
 * is dark whatever the theme.
 */
export function paletteFor(world: WorldId, time: TimeOfDay, theme: Theme = 'dark'): Palette {
  const keys = WORLD_PALETTES[world];
  const stops: Palette[] =
    theme === 'light'
      ? [keys.day, keys.night, keys.day, keys.day]
      : [keys.dusk, keys.night, keys.dawn, keys.dusk];
  const index = Math.min(2, Math.floor(time));
  const from = stops[index] as Palette;
  const to = stops[index + 1] as Palette;
  return blendPalettes(from, to, time - index);
}

export function blendPalettes(from: Palette, to: Palette, amount: number): Palette {
  if (amount <= 0) return from;
  if (amount >= 1) return to;
  const colour = (a: string, b: string) => mixColours(a, b, amount);
  const number = (a: number, b: number) => a + (b - a) * amount;
  return {
    skyTop: colour(from.skyTop, to.skyTop),
    skyMiddle: colour(from.skyMiddle, to.skyMiddle),
    skyHorizon: colour(from.skyHorizon, to.skyHorizon),
    horizonGlow: colour(from.horizonGlow, to.horizonGlow),
    farCity: colour(from.farCity, to.farCity),
    midCity: colour(from.midCity, to.midCity),
    haze: colour(from.haze, to.haze),
    facades: from.facades.map((value, index) => colour(value, to.facades[index] ?? value)),
    windowLit: from.windowLit.map((value, index) => colour(value, to.windowLit[index] ?? value)),
    windowDark: colour(from.windowDark, to.windowDark),
    street: colour(from.street, to.street),
    rimLight: colour(from.rimLight, to.rimLight),
    stars: number(from.stars, to.stars),
    bodyGlow: number(from.bodyGlow, to.bodyGlow),
    cloud: colour(from.cloud, to.cloud),
    daylight: number(from.daylight, to.daylight),
    grade: {
      exposure: number(from.grade.exposure, to.grade.exposure),
      saturation: number(from.grade.saturation, to.grade.saturation),
      contrast: number(from.grade.contrast, to.grade.contrast),
      tint: from.grade.tint.map((value, index) => number(value, to.grade.tint[index] ?? value)) as [
        number,
        number,
        number,
      ],
    },
  };
}

/** Mixes two #rrggbb or #rrggbbaa colours. */
export function mixColours(from: string, to: string, amount: number): string {
  const a = parseColour(from);
  const b = parseColour(to);
  const channel = (index: number) =>
    Math.round((a[index] ?? 0) + ((b[index] ?? 0) - (a[index] ?? 0)) * amount);
  const alpha = (a[3] ?? 255) + ((b[3] ?? 255) - (a[3] ?? 255)) * amount;
  const hex = (value: number) => value.toString(16).padStart(2, '0');
  return `#${hex(channel(0))}${hex(channel(1))}${hex(channel(2))}${alpha >= 255 ? '' : hex(Math.round(alpha))}`;
}

export function parseColour(colour: string): number[] {
  const hex = colour.replace('#', '');
  const values = [];
  for (let index = 0; index < hex.length; index += 2)
    values.push(Number.parseInt(hex.slice(index, index + 2), 16));
  return values;
}

export function withAlpha(colour: string, alpha: number): string {
  const [red = 0, green = 0, blue = 0] = parseColour(colour);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/**
 * Leans a colour towards another hue but keeps its lightness, so a city's
 * tint changes its character without turning night into day.
 */
export function tintKeepingLight(colour: string, tint: string, amount: number): string {
  const original = parseColour(colour);
  const mixed = parseColour(mixColours(colour, tint, amount));
  const lightness = (rgb: number[]) =>
    0.2126 * (rgb[0] ?? 0) + 0.7152 * (rgb[1] ?? 0) + 0.0722 * (rgb[2] ?? 0);
  const ratio = lightness(original) / Math.max(1, lightness(mixed));
  const hex = (value: number) =>
    Math.round(Math.min(255, Math.max(0, value * ratio)))
      .toString(16)
      .padStart(2, '0');
  return `#${hex(mixed[0] ?? 0)}${hex(mixed[1] ?? 0)}${hex(mixed[2] ?? 0)}`;
}

/** Lighter (amount > 0) or darker (amount < 0) version of a colour. */
export function shade(colour: string, amount: number): string {
  return mixColours(colour, amount > 0 ? '#ffffff' : '#000000', Math.abs(amount));
}
