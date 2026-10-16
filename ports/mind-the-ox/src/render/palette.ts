import type { Side } from '../engine/map';
import type { ThemeId } from '../themes';

/**
 * Every colour a view paints with. Light is a bright summer morning in
 * gouache; dark is a moonlit night raid. Each theme brings its own pair:
 * the Great War's khaki and mud, Cyan vs Magenta's cartoon brights after
 * the 1984 colours, and the Airshow's county-fair blue and bunting.
 */
export type Lighting = 'day' | 'night';

/** How a side marks its planes: rings, a cross pattée, a kite's diamond or a star. */
export type Insignia = 'roundel' | 'cross' | 'diamond' | 'star';

/** A pattern painted across the top of the upper wing, as a cosmetic. */
export type WingMotif = 'none' | 'stripes' | 'checks' | 'chevrons' | 'sunburst';

export interface Livery {
  /** Doped fabric on top and on the fuselage sides. */
  fabric: string;
  fabricShade: string;
  /** Clear-doped linen underneath: the "linen" of Linen & Dope. */
  linen: string;
  cowling: string;
  cowlingShine: string;
  strut: string;
  insignia: Insignia;
  /** The insignia's colours from the outside in. */
  insigniaColours: readonly string[];
  /** Stripes on the rudder, back to front; one colour is a plain rudder. */
  rudder: readonly string[];
  scarf: string;
  wingMotif: WingMotif;
  motifColour: string;
}

export interface SeaColours {
  /** The surface at the line of play, and far off at the horizon. */
  near: string;
  far: string;
  /** The water in section: just under the surface, and deep down. */
  shallow: string;
  deep: string;
  bed: string;
  foam: string;
  /** The sun's (or moon's) path of sparkles on the water. */
  glint: string;
}

/** How one side paints its ships. */
export interface Fleet {
  hull: string;
  hullShade: string;
  /** Below the waterline. */
  boot: string;
  /** A flight deck's planking, and the gaps between. */
  deck: string;
  deckShade: string;
  superstructure: string;
  funnel: string;
  funnelBand: string;
  /** Dazzle camouflage, darkest first; none for a plain hull. */
  dazzle: readonly string[];
  /** Rails, portholes, masts and rigging. */
  trim: string;
}

export interface Palette {
  theme: ThemeId;
  lighting: Lighting;
  /** 1 in full daylight, 0 at night; lit windows, stars and searchlights follow it. */
  daylight: number;
  sky: readonly [top: string, middle: string, horizon: string];
  sun: { body: string; glow: string; x: number; y: number; moon: boolean };
  stars: boolean;
  cloud: { light: string; shade: string; rim: string };
  farHills: readonly [string, string];
  midHills: readonly [string, string];
  haze: string;
  grass: readonly [top: string, middle: string, dark: string];
  soil: readonly [top: string, deep: string];
  chalk: string;
  mud: string;
  scorch: string;
  runway: string;
  hedge: string;
  foliage: readonly [string, string, string];
  trunk: string;
  roof: string;
  wall: string;
  window: string;
  canvas: string;
  canvasShade: string;
  metal: string;
  metalShade: string;
  ink: string;
  ox: { hide: string; shade: string; horn: string; muzzle: string };
  bird: string;
  fire: readonly [core: string, flame: string, ember: string];
  smoke: string;
  tracer: string;
  searchlight: string;
  /** Each side's flag and trim colour, for pennants on targets and the world strip. */
  accents: readonly [string, string];
  /** Flags, bunting and confetti. */
  festive: readonly string[];
  fog: string;
  liveries: readonly [Livery, Livery];
  /** The sea: its surface running back to the horizon, the water in section below the line, the bed. */
  sea: SeaColours;
  /** Each side's ships. */
  navy: readonly [Fleet, Fleet];
  /** Post-processing grade, as Donkey Dash's stage uses it. */
  grade: {
    exposure: number;
    contrast: number;
    saturation: number;
    tint: readonly [number, number, number];
  };
}

const ALLIED: Livery = {
  fabric: '#6f6b3e',
  fabricShade: '#4e4b2b',
  linen: '#e3d7b4',
  cowling: '#b9b6ad',
  cowlingShine: '#f2efe6',
  strut: '#6b4a2b',
  insignia: 'roundel',
  insigniaColours: ['#27408b', '#f4efe2', '#b8282e'],
  rudder: ['#b8282e', '#f4efe2', '#27408b'],
  scarf: '#f4efe2',
  wingMotif: 'none',
  motifColour: '#f4efe2',
};

const CENTRAL: Livery = {
  fabric: '#7b6a8f',
  fabricShade: '#4f5b3a',
  linen: '#b9cddb',
  cowling: '#9a9a96',
  cowlingShine: '#e4e3dc',
  strut: '#5a3f2a',
  insignia: 'cross',
  insigniaColours: ['#f4efe2', '#1c1a1e'],
  rudder: ['#f4efe2'],
  scarf: '#c8412f',
  wingMotif: 'none',
  motifColour: '#f4efe2',
};

/** The Royal Navy's dazzle: hard-edged slabs of blue, grey, black and white to confuse a rangefinder. */
const ALLIED_FLEET: Fleet = {
  hull: '#7f8b93',
  hullShade: '#5b666e',
  boot: '#7a3328',
  deck: '#b89d74',
  deckShade: '#8e7552',
  superstructure: '#a2abb0',
  funnel: '#3b3d40',
  funnelBand: '#e9e1cc',
  dazzle: ['#2f3b47', '#56799a', '#e4e8ea'],
  trim: '#2a2a2e',
};

/** The High Seas Fleet in plain grey, its grey funnels capped and banded in black. */
const CENTRAL_FLEET: Fleet = {
  hull: '#6c7075',
  hullShade: '#4a4e53',
  boot: '#6a2a24',
  deck: '#a68f6c',
  deckShade: '#7f6b4e',
  superstructure: '#868b90',
  funnel: '#767a7f',
  funnelBand: '#2b2c2f',
  dazzle: [],
  trim: '#222226',
};

const CYAN_FLEET: Fleet = {
  hull: '#2bb3c9',
  hullShade: '#1b7f94',
  boot: '#1d1d27',
  deck: '#f2ead2',
  deckShade: '#c9bb98',
  superstructure: '#e6f7f9',
  funnel: '#1d1d27',
  funnelBand: '#33d6ec',
  dazzle: [],
  trim: '#1d1d27',
};

const MAGENTA_FLEET: Fleet = {
  ...CYAN_FLEET,
  hull: '#d23c9a',
  hullShade: '#932468',
  superstructure: '#fbe4f2',
  funnelBand: '#ff4fb8',
};

/** Show boats: white hulls, the team colour along the waterline and on the funnel. */
const BLUEBIRD_FLEET: Fleet = {
  hull: '#f6f2e6',
  hullShade: '#cfc8b4',
  boot: '#2f62c8',
  deck: '#c8a878',
  deckShade: '#a08458',
  superstructure: '#ffffff',
  funnel: '#2f62c8',
  funnelBand: '#ffd23c',
  dazzle: [],
  trim: '#222230',
};

const RED_KITE_FLEET: Fleet = {
  ...BLUEBIRD_FLEET,
  hull: '#fbf0e0',
  boot: '#d8402e',
  funnel: '#d8402e',
  funnelBand: '#ffffff',
};

/** A fleet by moonlight: every colour pulled towards the night's blue. */
function moonlit(fleet: Fleet, night: string): Fleet {
  const dim = (colour: string, share = 0.62) => mixHex(colour, night, share);
  return {
    hull: dim(fleet.hull),
    hullShade: dim(fleet.hullShade, 0.66),
    boot: dim(fleet.boot, 0.7),
    deck: dim(fleet.deck),
    deckShade: dim(fleet.deckShade, 0.66),
    superstructure: dim(fleet.superstructure),
    funnel: dim(fleet.funnel, 0.5),
    funnelBand: dim(fleet.funnelBand),
    dazzle: fleet.dazzle.map((colour) => dim(colour)),
    trim: dim(fleet.trim, 0.4),
  };
}

const GREAT_WAR_DAY: Palette = {
  theme: 'great-war',
  lighting: 'day',
  daylight: 1,
  sky: ['#6fa8d6', '#a9d1ea', '#f4e7c8'],
  sun: { body: '#fff6d8', glow: 'rgba(255, 236, 170, 0.55)', x: 0.78, y: 0.16, moon: false },
  stars: false,
  cloud: { light: '#fffdf6', shade: '#c9d6e3', rim: '#fff3d6' },
  farHills: ['#9fb6c2', '#8aa3b2'],
  midHills: ['#8fa77a', '#76925f'],
  haze: '#e9e4cf',
  grass: ['#a9bf62', '#7f9a45', '#5d7a33'],
  soil: ['#8a6a45', '#5f4630'],
  chalk: '#d9cfb3',
  mud: '#5b4b38',
  scorch: '#3a2e25',
  runway: '#c3cf78',
  hedge: '#56702f',
  foliage: ['#6f8f3a', '#56762e', '#3f5c25'],
  trunk: '#5c4330',
  roof: '#b4553a',
  wall: '#efe4cc',
  window: '#5a4a3a',
  canvas: '#d8ccaa',
  canvasShade: '#a99a74',
  metal: '#7d7f7a',
  metalShade: '#4f514d',
  ink: '#2f2a24',
  ox: { hide: '#a8784e', shade: '#7a5234', horn: '#efe3c4', muzzle: '#d8b28c' },
  bird: '#2f2a2c',
  fire: ['#fff3c0', '#ff9a3c', '#c8412f'],
  smoke: '#5a5550',
  tracer: '#ffd27a',
  searchlight: 'rgba(255, 248, 220, 0)',
  accents: ['#b8282e', '#1c1a1e'],
  festive: ['#b8282e', '#f4efe2', '#27408b'],
  fog: '#e8e6dc',
  liveries: [ALLIED, CENTRAL],
  sea: {
    near: '#4c7f99',
    far: '#a6c6d2',
    shallow: '#4f8a98',
    deep: '#1c3e52',
    bed: '#b8a57a',
    foam: '#f4f1e4',
    glint: '#fff6d8',
  },
  navy: [ALLIED_FLEET, CENTRAL_FLEET],
  grade: { exposure: 1.02, contrast: 1.04, saturation: 1.05, tint: [1.02, 1, 0.96] },
};

const GREAT_WAR_NIGHT: Palette = {
  ...GREAT_WAR_DAY,
  lighting: 'night',
  daylight: 0,
  sky: ['#0b1230', '#1b2a52', '#3c4a6e'],
  sun: { body: '#f3f0dc', glow: 'rgba(200, 214, 255, 0.35)', x: 0.24, y: 0.15, moon: true },
  stars: true,
  cloud: { light: '#3d4769', shade: '#1c2440', rim: '#aab8de' },
  farHills: ['#2a3452', '#222b45'],
  midHills: ['#25324a', '#1d2a3c'],
  haze: '#3b4766',
  grass: ['#4f6a52', '#38503d', '#26392c'],
  soil: ['#3e3440', '#2a232e'],
  chalk: '#6d6f80',
  mud: '#2b2630',
  scorch: '#16131a',
  runway: '#5b6e58',
  hedge: '#22362a',
  foliage: ['#2f4436', '#24382c', '#1a2a21'],
  trunk: '#2a2224',
  roof: '#4a3640',
  wall: '#6b6c80',
  window: '#ffc66a',
  canvas: '#6f7083',
  canvasShade: '#4b4c5e',
  metal: '#4a4f60',
  metalShade: '#30343f',
  ink: '#0e0d14',
  ox: { hide: '#5f4c44', shade: '#3f3230', horn: '#b8b4a6', muzzle: '#7d6a5e' },
  bird: '#0f1018',
  smoke: '#3a3d4a',
  tracer: '#ffcf6e',
  searchlight: 'rgba(255, 246, 214, 0.16)',
  accents: ['#d0484c', '#c9cde0'],
  fog: '#4a5577',
  liveries: [
    {
      ...ALLIED,
      fabric: '#6a6c52',
      fabricShade: '#45473a',
      linen: '#b4b8bf',
      cowling: '#9ea3b6',
      cowlingShine: '#e6ebf8',
    },
    {
      ...CENTRAL,
      fabric: '#6a5f82',
      fabricShade: '#45503e',
      linen: '#93a4c0',
      cowling: '#8c90a0',
      cowlingShine: '#dde1ec',
    },
  ],
  sea: {
    near: '#1b2a45',
    far: '#34466a',
    shallow: '#1a3350',
    deep: '#071423',
    bed: '#33363f',
    foam: '#9fadc8',
    glint: '#e8ecf8',
  },
  navy: [moonlit(ALLIED_FLEET, '#141c34'), moonlit(CENTRAL_FLEET, '#141c34')],
  grade: { exposure: 1, contrast: 1.08, saturation: 0.95, tint: [0.92, 0.96, 1.08] },
};

const CYAN: Livery = {
  fabric: '#2bb3c9',
  fabricShade: '#1b7f94',
  linen: '#e6f7f9',
  cowling: '#f4f1e8',
  cowlingShine: '#ffffff',
  strut: '#24323a',
  insignia: 'roundel',
  insigniaColours: ['#1d1d27', '#ffffff', '#33d6ec'],
  rudder: ['#33d6ec', '#ffffff', '#1d1d27'],
  scarf: '#ffffff',
  wingMotif: 'none',
  motifColour: '#ffffff',
};

const MAGENTA: Livery = {
  fabric: '#d23c9a',
  fabricShade: '#932468',
  linen: '#fbe4f2',
  cowling: '#f4f1e8',
  cowlingShine: '#ffffff',
  strut: '#2e1f2a',
  insignia: 'diamond',
  insigniaColours: ['#1d1d27', '#ffffff', '#ff4fb8'],
  rudder: ['#ff4fb8', '#ffffff', '#ff4fb8', '#ffffff'],
  scarf: '#1d1d27',
  wingMotif: 'none',
  motifColour: '#ffffff',
};

const CYAN_MAGENTA_DAY: Palette = {
  ...GREAT_WAR_DAY,
  theme: 'cyan-magenta',
  sky: ['#36a9d8', '#8fdcf0', '#fff4dc'],
  sun: { body: '#fff8d2', glow: 'rgba(255, 240, 160, 0.6)', x: 0.8, y: 0.15, moon: false },
  cloud: { light: '#ffffff', shade: '#b9def0', rim: '#fff8e8' },
  farHills: ['#9fb6e0', '#8a9ed6'],
  midHills: ['#7cc49a', '#5eae84'],
  haze: '#e6f2f4',
  grass: ['#8fd36a', '#5fb54a', '#3f8e3a'],
  soil: ['#c27a48', '#8a4e2e'],
  chalk: '#f2dcb8',
  mud: '#7a5236',
  scorch: '#3a2a30',
  runway: '#b9e27a',
  hedge: '#3f9c4a',
  foliage: ['#62c25a', '#43a24a', '#2f7d3e'],
  trunk: '#6a4630',
  roof: '#e2574c',
  wall: '#fff3dc',
  window: '#3a5a7a',
  canvas: '#f2ead2',
  canvasShade: '#c9bb98',
  metal: '#9aa6b2',
  metalShade: '#5f6a78',
  ink: '#1d1d27',
  ox: { hide: '#c98a54', shade: '#94603a', horn: '#fff3d8', muzzle: '#f2c69a' },
  bird: '#1d1d27',
  fire: ['#fff7c8', '#ffb43c', '#ff5a3c'],
  smoke: '#6a6070',
  tracer: '#fff27a',
  accents: ['#33d6ec', '#ff4fb8'],
  festive: ['#33d6ec', '#ff4fb8', '#ffffff', '#ffd23c'],
  fog: '#f2f6f8',
  liveries: [CYAN, MAGENTA],
  sea: {
    near: '#2fa6c8',
    far: '#8fdcec',
    shallow: '#35b7cf',
    deep: '#14607e',
    bed: '#f2dcb8',
    foam: '#ffffff',
    glint: '#fffbe0',
  },
  navy: [CYAN_FLEET, MAGENTA_FLEET],
  grade: { exposure: 1.03, contrast: 1.06, saturation: 1.12, tint: [1, 1, 1] },
};

const CYAN_MAGENTA_NIGHT: Palette = {
  ...CYAN_MAGENTA_DAY,
  lighting: 'night',
  daylight: 0,
  sky: ['#110a2c', '#2a1852', '#53306e'],
  sun: { body: '#fbf2ff', glow: 'rgba(230, 200, 255, 0.35)', x: 0.22, y: 0.15, moon: true },
  stars: true,
  cloud: { light: '#4a3a72', shade: '#22183f', rim: '#d4b8f2' },
  farHills: ['#33285a', '#2a2150'],
  midHills: ['#21404e', '#1a3442'],
  haze: '#46356e',
  grass: ['#3f7a62', '#2c5c4a', '#1f4236'],
  soil: ['#5a3446', '#3a2232'],
  chalk: '#8a7aa0',
  mud: '#3a2836',
  scorch: '#160f18',
  runway: '#4f7a62',
  hedge: '#1f4a3c',
  foliage: ['#2c6450', '#214e40', '#173a30'],
  trunk: '#2e2028',
  roof: '#6a2e52',
  wall: '#7a6a92',
  window: '#ffd27a',
  canvas: '#7a6e94',
  canvasShade: '#54486e',
  metal: '#5a5a7a',
  metalShade: '#3a3a56',
  ink: '#0c0814',
  ox: { hide: '#6e5048', shade: '#4a3432', horn: '#c8bcd0', muzzle: '#8a6e6a' },
  bird: '#0c0814',
  smoke: '#3e3450',
  tracer: '#fff27a',
  searchlight: 'rgba(255, 220, 250, 0.16)',
  fog: '#5a4a80',
  liveries: [
    { ...CYAN, fabric: '#2a8ea6', fabricShade: '#1a5e72', linen: '#a8c6d6' },
    { ...MAGENTA, fabric: '#a8357e', fabricShade: '#6e2054', linen: '#d6aac6' },
  ],
  sea: {
    near: '#1c2c58',
    far: '#3b3c78',
    shallow: '#1d3a62',
    deep: '#0a1230',
    bed: '#5a4a62',
    foam: '#c8c0e8',
    glint: '#f2e8ff',
  },
  navy: [moonlit(CYAN_FLEET, '#1a1240'), moonlit(MAGENTA_FLEET, '#1a1240')],
  grade: { exposure: 1, contrast: 1.08, saturation: 1.02, tint: [0.98, 0.94, 1.08] },
};

const BLUEBIRDS: Livery = {
  fabric: '#2f62c8',
  fabricShade: '#1f4290',
  linen: '#f6f2e6',
  cowling: '#f6f2e6',
  cowlingShine: '#ffffff',
  strut: '#2a2a3a',
  insignia: 'star',
  insigniaColours: ['#ffffff', '#2f62c8'],
  rudder: ['#ffffff', '#2f62c8', '#ffffff', '#2f62c8'],
  scarf: '#ffd23c',
  wingMotif: 'stripes',
  motifColour: '#ffffff',
};

const RED_KITES: Livery = {
  fabric: '#d8402e',
  fabricShade: '#98281e',
  linen: '#fbf0e0',
  cowling: '#1f1f28',
  cowlingShine: '#6a6a7a',
  strut: '#2a2228',
  insignia: 'diamond',
  insigniaColours: ['#ffffff', '#1f1f28', '#ffd23c'],
  rudder: ['#ffd23c', '#d8402e'],
  scarf: '#ffffff',
  wingMotif: 'checks',
  motifColour: '#ffffff',
};

const AIRSHOW_DAY: Palette = {
  ...GREAT_WAR_DAY,
  theme: 'airshow',
  sky: ['#3f8ee0', '#97cdf4', '#fff0d2'],
  sun: { body: '#fffbe0', glow: 'rgba(255, 244, 190, 0.6)', x: 0.76, y: 0.14, moon: false },
  cloud: { light: '#ffffff', shade: '#c4dcf2', rim: '#fffaee' },
  farHills: ['#a4bcd8', '#90aacc'],
  midHills: ['#86be6a', '#6aa654'],
  haze: '#eef0e2',
  grass: ['#9ad35a', '#6db744', '#4c9136'],
  soil: ['#a8743e', '#74502c'],
  chalk: '#f4e6c4',
  mud: '#8a6a44',
  scorch: '#f4f0e4',
  runway: '#c8e88a',
  hedge: '#4a9a3c',
  foliage: ['#7cc452', '#5aa840', '#3e8432'],
  trunk: '#6e4a30',
  roof: '#e86a3a',
  wall: '#fffaf0',
  window: '#3a6aa0',
  canvas: '#fff6e4',
  canvasShade: '#e2cfa8',
  metal: '#a8b0ba',
  metalShade: '#6a7480',
  ink: '#222230',
  ox: { hide: '#b88052', shade: '#86583a', horn: '#fff6dc', muzzle: '#eec29a' },
  bird: '#2a2a34',
  fire: ['#fffbe0', '#ffd23c', '#ff7a3c'],
  smoke: '#e8e2f0',
  tracer: '#ff6ab8',
  accents: ['#2f62c8', '#d8402e'],
  festive: ['#d8402e', '#ffd23c', '#2f62c8', '#ffffff', '#3cb46a'],
  fog: '#f4f6f6',
  liveries: [BLUEBIRDS, RED_KITES],
  sea: {
    near: '#3f8fc0',
    far: '#a8d8ee',
    shallow: '#4aa0c8',
    deep: '#1a5478',
    bed: '#e8d6a8',
    foam: '#ffffff',
    glint: '#fffbe0',
  },
  navy: [BLUEBIRD_FLEET, RED_KITE_FLEET],
  grade: { exposure: 1.04, contrast: 1.04, saturation: 1.1, tint: [1.01, 1, 0.98] },
};

const AIRSHOW_NIGHT: Palette = {
  ...AIRSHOW_DAY,
  lighting: 'night',
  daylight: 0,
  sky: ['#0c1636', '#23315f', '#6a4a72'],
  sun: { body: '#fff8ec', glow: 'rgba(255, 220, 190, 0.32)', x: 0.25, y: 0.14, moon: true },
  stars: true,
  cloud: { light: '#45507a', shade: '#212a4a', rim: '#f2c6b8' },
  farHills: ['#2c3658', '#242d4c'],
  midHills: ['#28403e', '#203432'],
  haze: '#4a4570',
  grass: ['#3e6a4a', '#2e523a', '#20402c'],
  soil: ['#4a3a3a', '#302628'],
  chalk: '#7a7488',
  mud: '#3a3036',
  scorch: '#8a8496',
  runway: '#4e7050',
  hedge: '#21402e',
  foliage: ['#2c5a3e', '#224a34', '#183a28'],
  trunk: '#2c2224',
  roof: '#6a3a40',
  wall: '#76768e',
  window: '#ffd98a',
  canvas: '#80789a',
  canvasShade: '#58506e',
  metal: '#585e74',
  metalShade: '#383c4e',
  ink: '#0c0c16',
  ox: { hide: '#62504a', shade: '#423432', horn: '#c4bcc0', muzzle: '#806a62' },
  bird: '#0c0c16',
  smoke: '#5a5470',
  searchlight: 'rgba(255, 236, 214, 0.16)',
  fog: '#55507a',
  liveries: [
    { ...BLUEBIRDS, fabric: '#2a4e9a', fabricShade: '#1a3470', linen: '#b8bcc8' },
    { ...RED_KITES, fabric: '#a8392e', fabricShade: '#702420', linen: '#c8b8b4' },
  ],
  sea: {
    near: '#1c2e50',
    far: '#3d4a72',
    shallow: '#1d3a5c',
    deep: '#09162c',
    bed: '#4a4652',
    foam: '#c0c6dc',
    glint: '#fff1e4',
  },
  navy: [moonlit(BLUEBIRD_FLEET, '#141a38'), moonlit(RED_KITE_FLEET, '#141a38')],
  grade: { exposure: 1, contrast: 1.08, saturation: 1, tint: [0.96, 0.95, 1.06] },
};

const BLACK = '#000000';
const CGA_CYAN = '#55ffff';
const CGA_MAGENTA = '#ff55ff';
const WHITE = '#ffffff';

/**
 * Classic 1984's four-colour picture, after the IBM CGA's palette 1. The
 * world is painted in exactly those four, so the CGA filter only has to
 * make the pixels chunky: a black sky, a white line of ground, the
 * player's side in cyan and the enemy's in magenta. Hills, fields and
 * trees go black, out of the way, as the 1984 screen had none.
 */
const CGA_SCREEN: Palette = {
  ...GREAT_WAR_DAY,
  sky: [BLACK, BLACK, BLACK],
  sun: { body: WHITE, glow: 'rgba(0, 0, 0, 0)', x: 0.78, y: 0.16, moon: false },
  stars: false,
  cloud: { light: WHITE, shade: CGA_CYAN, rim: WHITE },
  farHills: [BLACK, BLACK],
  midHills: [BLACK, BLACK],
  haze: BLACK,
  grass: [WHITE, BLACK, BLACK],
  soil: [BLACK, BLACK],
  chalk: BLACK,
  mud: BLACK,
  scorch: BLACK,
  runway: WHITE,
  hedge: BLACK,
  foliage: [BLACK, BLACK, BLACK],
  trunk: BLACK,
  roof: CGA_MAGENTA,
  wall: WHITE,
  window: BLACK,
  canvas: WHITE,
  canvasShade: CGA_CYAN,
  metal: CGA_CYAN,
  metalShade: BLACK,
  ink: BLACK,
  ox: { hide: WHITE, shade: WHITE, horn: WHITE, muzzle: WHITE },
  bird: WHITE,
  fire: [WHITE, CGA_MAGENTA, CGA_MAGENTA],
  smoke: WHITE,
  tracer: WHITE,
  searchlight: 'rgba(0, 0, 0, 0)',
  accents: [CGA_CYAN, CGA_MAGENTA],
  festive: [CGA_CYAN, CGA_MAGENTA, WHITE],
  fog: WHITE,
  liveries: [
    {
      ...ALLIED,
      fabric: CGA_CYAN,
      fabricShade: CGA_CYAN,
      linen: WHITE,
      cowling: WHITE,
      cowlingShine: WHITE,
      strut: BLACK,
      insigniaColours: [WHITE, BLACK],
      rudder: [WHITE],
      scarf: WHITE,
    },
    {
      ...CENTRAL,
      fabric: CGA_MAGENTA,
      fabricShade: CGA_MAGENTA,
      linen: WHITE,
      cowling: WHITE,
      cowlingShine: WHITE,
      strut: BLACK,
      insigniaColours: [WHITE, BLACK],
      rudder: [WHITE],
      scarf: WHITE,
    },
  ],
  sea: {
    near: BLACK,
    far: BLACK,
    shallow: BLACK,
    deep: BLACK,
    bed: BLACK,
    foam: WHITE,
    glint: BLACK,
  },
  navy: [cgaFleet(CGA_CYAN), cgaFleet(CGA_MAGENTA)],
  grade: { exposure: 1, contrast: 1, saturation: 1, tint: [1, 1, 1] },
};

/** A side's ships in CGA: the hull in the side's colour, everything else white or black. */
function cgaFleet(hull: string): Fleet {
  return {
    hull,
    hullShade: hull,
    boot: BLACK,
    deck: WHITE,
    deckShade: BLACK,
    superstructure: WHITE,
    funnel: WHITE,
    funnelBand: BLACK,
    dazzle: [],
    trim: BLACK,
  };
}

/** The palette for Classic 1984 in CGA: the same in every theme, day or night. */
export function cgaPalette(): Palette {
  return CGA_SCREEN;
}

const PALETTES: Readonly<Record<ThemeId, Readonly<Record<Lighting, Palette>>>> = {
  'great-war': { day: GREAT_WAR_DAY, night: GREAT_WAR_NIGHT },
  'cyan-magenta': { day: CYAN_MAGENTA_DAY, night: CYAN_MAGENTA_NIGHT },
  airshow: { day: AIRSHOW_DAY, night: AIRSHOW_NIGHT },
};

export function paletteFor(theme: ThemeId, lighting: Lighting): Palette {
  return PALETTES[theme][lighting];
}

/**
 * The light of the flight into the sun: a day turns to sunset, a night to
 * sunrise. `share` 0 is the palette as it was, 1 the full golden light.
 */
export function goldenHour(palette: Palette, share: number): Palette {
  const t = Math.min(1, Math.max(0, share));
  if (t === 0) return palette;
  const dawn = palette.lighting === 'night';
  const glow: Palette['sky'] = dawn
    ? ['#2c3566', '#e88a6a', '#ffd79a']
    : ['#3b4a86', '#f0925c', '#ffd27e'];
  return {
    ...palette,
    daylight: palette.daylight + (0.8 - palette.daylight) * t,
    sky: [
      mixHex(palette.sky[0], glow[0], t),
      mixHex(palette.sky[1], glow[1], t),
      mixHex(palette.sky[2], glow[2], t),
    ],
    sun: {
      body: mixHex(palette.sun.body, '#fff1c8', t),
      glow: `rgba(255, 190, 110, ${(0.35 + t * 0.4).toFixed(3)})`,
      x: palette.sun.x + (0.72 - palette.sun.x) * t,
      y: palette.sun.y + ((dawn ? 0.22 : 0.26) - palette.sun.y) * t,
      moon: palette.sun.moon && t < 0.5,
    },
    stars: palette.stars && t < 0.4,
    cloud: {
      light: mixHex(palette.cloud.light, '#ffd2a8', t),
      shade: mixHex(palette.cloud.shade, '#a2729a', t),
      rim: mixHex(palette.cloud.rim, '#fff0c8', t),
    },
    haze: mixHex(palette.haze, '#f2b98a', t),
    farHills: [
      mixHex(palette.farHills[0], '#9a7a9e', t),
      mixHex(palette.farHills[1], '#7d6488', t),
    ],
    midHills: [
      mixHex(palette.midHills[0], '#8a8a52', t * 0.7),
      mixHex(palette.midHills[1], '#6a6a44', t * 0.7),
    ],
    // The sea holds the sky's colour: warm far off, a little warm near.
    sea: {
      ...palette.sea,
      far: mixHex(palette.sea.far, '#f2b98a', t * 0.6),
      near: mixHex(palette.sea.near, '#7a5a6a', t * 0.35),
      glint: mixHex(palette.sea.glint, '#ffe2a8', t),
    },
    grade: { ...palette.grade, tint: [1.06, 0.98, 0.9] },
  };
}

export function mixHex(from: string, to: string, share: number): string {
  const parse = (hex: string) =>
    [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
  const a = parse(from);
  const b = parse(to);
  return `#${a
    .map((value, index) =>
      Math.round(value + ((b[index] as number) - value) * share)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

export function liveryOf(palette: Palette, side: Side): Livery {
  return palette.liveries[side];
}
