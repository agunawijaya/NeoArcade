export interface BloomOptions {
  /** How much glow is added back, 0 (none) to about 2 (dreamy). */
  strength: number;
  /** Brightness (0..1) above which pixels start to glow. */
  threshold: number;
  /** Spread of the glow; 1 is a soft halo, 3 a wide haze. */
  radius: number;
}

export interface CrtOptions {
  /** Barrel distortion of the tube, 0 (flat) to about 0.3 (fishbowl). */
  curvature: number;
  /** Darkness of the gaps between scanlines, 0..1. */
  scanlines: number;
  /** Strength of the red/green/blue phosphor stripes, 0..1. */
  mask: number;
  /** Colour fringing towards the edges, in fractions of the screen width. */
  aberration: number;
}

export interface GradeOptions {
  exposure: number;
  contrast: number;
  saturation: number;
  /** Multiplies the final colour, e.g. [1, 0.95, 0.9] for a warm cast. */
  tint: readonly [number, number, number];
}

export type Rgb = readonly [number, number, number];

export interface PaletteOptions {
  /** Up to four colours (0..1 RGB). Every pixel becomes the nearest of them. */
  colours: readonly Rgb[];
  /** 0 snaps straight to the nearest colour; up to 1 mixes neighbours with an ordered dither. */
  dither: number;
  /** Rows of chunky pixels down the screen, like an old video mode; 0 keeps full resolution. */
  rows: number;
}

export interface PostFxOptions {
  bloom: BloomOptions | false;
  /** Edge darkening, 0..1. */
  vignette: number;
  crt: CrtOptions | false;
  grade: GradeOptions;
  /** Limits the picture to a few colours. WebGL only: the Canvas 2D fallback ignores it. */
  palette: PaletteOptions | false;
}

export type PostFxSettings = {
  bloom?: Partial<BloomOptions> | false;
  vignette?: number;
  crt?: Partial<CrtOptions> | false;
  grade?: Partial<GradeOptions>;
  palette?: Partial<PaletteOptions> | false;
};

export const DEFAULT_BLOOM: BloomOptions = { strength: 0.8, threshold: 0.6, radius: 1.5 };
export const DEFAULT_CRT: CrtOptions = {
  curvature: 0.12,
  scanlines: 0.35,
  mask: 0.15,
  aberration: 0.0015,
};
/** The IBM Color/Graphics Adapter's 320 x 200 mode, palette 1: black, cyan, magenta, white. */
export const CGA_PALETTE: PaletteOptions = {
  colours: [
    [0, 0, 0],
    [0.33, 1, 1],
    [1, 0.33, 1],
    [1, 1, 1],
  ],
  dither: 0.3,
  rows: 200,
};

export const MAX_PALETTE_COLOURS = 4;

export const DEFAULT_GRADE: GradeOptions = {
  exposure: 1,
  contrast: 1,
  saturation: 1,
  tint: [1, 1, 1],
};

/**
 * Merges settings onto the current options. Bloom, CRT and the palette are
 * switched on by passing an object (even an empty one) and off with `false`;
 * leaving them out keeps whatever was there. An empty palette is CGA.
 */
export function resolveOptions(
  settings: PostFxSettings,
  current: PostFxOptions = {
    bloom: false,
    vignette: 0,
    crt: false,
    grade: DEFAULT_GRADE,
    palette: false,
  },
): PostFxOptions {
  const mergeWith = <T extends object>(
    change: Partial<T> | false | undefined,
    existing: T | false,
    defaults: T,
  ): T | false => {
    if (change === undefined) return existing;
    if (change === false) return false;
    return { ...(existing || defaults), ...change };
  };

  return {
    bloom: mergeWith(settings.bloom, current.bloom, DEFAULT_BLOOM),
    vignette: clamp(settings.vignette ?? current.vignette, 0, 1),
    crt: mergeWith(settings.crt, current.crt, DEFAULT_CRT),
    grade: { ...current.grade, ...settings.grade },
    palette: limitColours(mergeWith(settings.palette, current.palette, CGA_PALETTE)),
  };
}

/**
 * Scanlines line up with the rows of a low-resolution game, but never get
 * denser than one per three screen pixels, where they would only shimmer.
 */
export function scanlineCount(sourceHeight: number, outputHeight: number): number {
  return Math.max(1, Math.min(sourceHeight, outputHeight / 3));
}

function limitColours(palette: PaletteOptions | false): PaletteOptions | false {
  if (!palette) return false;
  return {
    ...palette,
    colours: palette.colours.slice(0, MAX_PALETTE_COLOURS),
    dither: clamp(palette.dither, 0, 1),
    rows: Math.max(0, Math.round(palette.rows)),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
