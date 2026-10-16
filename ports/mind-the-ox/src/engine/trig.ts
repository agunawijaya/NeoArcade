/**
 * Headings and their sines without Math.sin. A heading is a number of
 * 1/4096ths of a turn, counter-clockwise from "flying right", with y pointing
 * up: 1024 climbs straight up, 2048 flies left, 3072 dives straight down.
 *
 * The Daily Sortie must fly the same in every browser, and engines disagree
 * on the last bit of Math.sin (see ADR 0012 for the measurements). The table
 * below is built once from a Taylor series using only + − × ÷, which IEEE 754
 * rounds identically everywhere.
 */
export const TURN = 4096;
export const QUARTER_TURN = TURN / 4;
export const HALF_TURN = TURN / 2;

/** The 1984 plane points in sixteen directions; Classic keeps to these. */
export const CLASSIC_STEP = TURN / 16;

export const RIGHT = 0;
export const UP = QUARTER_TURN;
export const LEFT = HALF_TURN;
export const DOWN = 3 * QUARTER_TURN;

const RADIANS_PER_UNIT = 0.0015339807878856412; // 2π / 4096

function seriesSine(radians: number): number {
  const square = radians * radians;
  let term = radians;
  let sum = radians;
  for (let n = 3; n <= 21; n += 2) {
    term = (-term * square) / ((n - 1) * n);
    sum += term;
  }
  return sum;
}

// One quarter is enough: the rest of the circle mirrors it exactly.
const QUARTER_SINES: readonly number[] = Array.from({ length: QUARTER_TURN + 1 }, (_, unit) =>
  unit === QUARTER_TURN ? 1 : seriesSine(unit * RADIANS_PER_UNIT),
);

/** Brings any heading into [0, TURN). */
export function wrapHeading(heading: number): number {
  const wrapped = heading % TURN;
  return wrapped < 0 ? wrapped + TURN : wrapped;
}

function tableSine(unit: number): number {
  if (unit <= QUARTER_TURN) return QUARTER_SINES[unit] as number;
  if (unit <= HALF_TURN) return QUARTER_SINES[HALF_TURN - unit] as number;
  if (unit <= 3 * QUARTER_TURN) return -(QUARTER_SINES[unit - HALF_TURN] as number);
  return -(QUARTER_SINES[TURN - unit] as number);
}

/** sin of a heading; fractional headings are interpolated between table entries. */
export function sine(heading: number): number {
  const wrapped = wrapHeading(heading);
  const unit = Math.floor(wrapped);
  const fraction = wrapped - unit;
  const low = tableSine(unit);
  if (fraction === 0) return low;
  return low + (tableSine(unit + 1 === TURN ? 0 : unit + 1) - low) * fraction;
}

export function cosine(heading: number): number {
  return sine(heading + QUARTER_TURN);
}

/** The signed shortest turn from one heading to another, in (−HALF_TURN, HALF_TURN]. */
export function headingDelta(from: number, to: number): number {
  const delta = wrapHeading(to - from);
  return delta > HALF_TURN ? delta - TURN : delta;
}

/**
 * How steeply a heading climbs, as the 1984 gravity table shaped it: zero
 * when level, +1 pointing straight up, −1 straight down, changing linearly
 * with the angle in between (a triangle wave, not a sine). Sixteen-direction
 * headings reproduce the original's steps of a quarter exactly.
 */
export function climbFactor(heading: number): number {
  const wrapped = wrapHeading(heading);
  if (wrapped <= QUARTER_TURN) return wrapped / QUARTER_TURN;
  if (wrapped <= 3 * QUARTER_TURN) return (HALF_TURN - wrapped) / QUARTER_TURN;
  return (wrapped - TURN) / QUARTER_TURN;
}

/**
 * A heading pointing along (dx, dy), without atan2: a binary search on the
 * table. Accurate to a fraction of a unit, which is far finer than anything
 * steers by.
 */
export function headingOf(dx: number, dy: number): number {
  if (dx === 0 && dy === 0) return RIGHT;
  const length = Math.sqrt(dx * dx + dy * dy);
  const along = Math.abs(dx) / length;
  // Search the first quarter for the angle whose cosine matches.
  let low = 0;
  let high = QUARTER_TURN;
  for (let step = 0; step < 16; step++) {
    const middle = (low + high) / 2;
    if (cosine(middle) > along) low = middle;
    else high = middle;
  }
  const angle = (low + high) / 2;
  if (dx >= 0) return dy >= 0 ? angle : wrapHeading(TURN - angle);
  return dy >= 0 ? HALF_TURN - angle : HALF_TURN + angle;
}
