import type { Rng } from '@shared/rng';
import { GORILLA_SIZE, STREET_Y, WORLD_WIDTH } from './constants';

/**
 * The city, built left to right the way MakeCityScape did it. A running
 * "trend" height follows one of four slope patterns and each building adds a
 * random amount on top.
 *
 * The original meant to have four patterns but only three worked: its
 * inverted-"V" branch (CASE 4) sat after `CASE 3 TO 5` and could never run,
 * and slope 6 had no branch at all, so it produced a flat, tall city. Here
 * every pattern gets its own rule.
 */
export type SlopePattern = 'upward' | 'downward' | 'v' | 'invertedV' | 'hillUp' | 'hillDown';

export interface CityWindow {
  x: number;
  y: number;
  width: number;
  height: number;
  lit: boolean;
}

export interface Building {
  x: number;
  width: number;
  /** y of the roof; the building runs down to STREET_Y. */
  top: number;
  windows: CityWindow[];
}

export interface Skyline {
  pattern: SlopePattern;
  buildings: Building[];
}

const HEIGHT_STEP = 10;
const MIN_WIDTH = 37;
const RANDOM_HEIGHT = 120;
const WINDOW_WIDTH = 4;
const WINDOW_HEIGHT = 7;
const WINDOW_ROW_SPACING = 15;
const WINDOW_COLUMN_SPACING = 10;
/** Keeps the tallest roof low enough for a gorilla (and a little air) above it. */
export const HIGHEST_ROOF = GORILLA_SIZE + 5;

/*
 * The two hill patterns are the World Tour's, never rolled by the dice: a
 * city climbing a steep slope from one side to the other, with less
 * randomness, so the gorillas stand far apart in height.
 */
const STARTING_TREND: Record<SlopePattern, number> = {
  upward: 15,
  downward: 130,
  v: 15,
  invertedV: 130,
  hillUp: 10,
  hillDown: 270,
};

/** Random height added on top of the trend, per building. */
const RANDOM_HEIGHT_FOR: Record<SlopePattern, number> = {
  upward: RANDOM_HEIGHT,
  downward: RANDOM_HEIGHT,
  v: RANDOM_HEIGHT,
  invertedV: RANDOM_HEIGHT,
  hillUp: 25,
  hillDown: 25,
};
const HILL_STEP = 24;

/** One roll of a six-sided die, as in the original: the "V" city wins half the time. */
export function pickSlopePattern(rng: Rng): SlopePattern {
  const roll = rng.int(1, 6);
  if (roll === 1) return 'upward';
  if (roll === 2) return 'downward';
  if (roll === 6) return 'invertedV';
  return 'v';
}

/** How the trend height changes before placing a building that starts at `x`. */
function trendChange(pattern: SlopePattern, x: number): number {
  const leftHalf = x <= WORLD_WIDTH / 2;
  switch (pattern) {
    case 'upward':
      return HEIGHT_STEP;
    case 'downward':
      return -HEIGHT_STEP;
    // Named after the original: its "V" rises to the middle, a peak on screen.
    case 'v':
      return leftHalf ? 2 * HEIGHT_STEP : -2 * HEIGHT_STEP;
    case 'invertedV':
      return leftHalf ? -2 * HEIGHT_STEP : 2 * HEIGHT_STEP;
    case 'hillUp':
      return HILL_STEP;
    case 'hillDown':
      return -HILL_STEP;
  }
}

export function makeSkyline(rng: Rng, pattern: SlopePattern = pickSlopePattern(rng)): Skyline {
  const buildings: Building[] = [];
  let trend = STARTING_TREND[pattern];
  let x = 2;

  do {
    trend += trendChange(pattern, x);

    let width = rng.int(1, MIN_WIDTH) + MIN_WIDTH;
    if (x + width > WORLD_WIDTH) width = WORLD_WIDTH - x - 2;

    let height = rng.int(1, RANDOM_HEIGHT_FOR[pattern]) + trend;
    height = Math.max(HEIGHT_STEP, height);
    // The original clamped against an undeclared variable (always 0), which
    // shrank an over-tall building to 20 units. Capping it is what it meant.
    height = Math.min(STREET_Y - HIGHEST_ROOF, height);

    const top = STREET_Y - height;
    buildings.push({ x, width, top, windows: makeWindows(rng, x, width, height) });
    x += width + 2;
  } while (x <= WORLD_WIDTH - HEIGHT_STEP);

  return { pattern, buildings };
}

/** A block of a hand-built city: its width and its height above the street. */
export type Block = readonly [width: number, height: number];

/**
 * A city built by hand, for Trick Shot: the blocks stand left to right from
 * the same edge and with the same gaps as a rolled city, and get windows
 * the same way.
 */
export function buildSkyline(blocks: readonly Block[], rng: Rng): Building[] {
  const buildings: Building[] = [];
  let x = 2;
  for (const [width, height] of blocks) {
    buildings.push({
      x,
      width,
      top: STREET_Y - height,
      windows: makeWindows(rng, x, width, height),
    });
    x += width + 2;
  }
  return buildings;
}

/**
 * Makes one building far taller than its neighbours, windows and all: the
 * World Tour's supertall tower.
 */
export function raiseBuilding(skyline: Skyline, index: number, top: number, rng: Rng): void {
  const building = skyline.buildings[index];
  if (!building) throw new Error(`No building ${index} to raise.`);
  building.top = Math.max(HIGHEST_ROOF, top);
  building.windows = makeWindows(rng, building.x, building.width, STREET_Y - building.top);
}

/** Columns every 10 units, rows every 15 from the roof down; one in four is dark. */
function makeWindows(rng: Rng, x: number, width: number, height: number): CityWindow[] {
  const windows: CityWindow[] = [];
  let column = x + 3;
  do {
    for (let fromStreet = height - 3; fromStreet >= 7; fromStreet -= WINDOW_ROW_SPACING) {
      windows.push({
        x: column,
        y: STREET_Y - fromStreet,
        width: WINDOW_WIDTH,
        height: WINDOW_HEIGHT,
        lit: rng.int(1, 4) !== 1,
      });
    }
    column += WINDOW_COLUMN_SPACING;
  } while (column < x + width - 3);
  return windows;
}
