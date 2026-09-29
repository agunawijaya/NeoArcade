/**
 * Sines, cosines and square roots built from nothing but + − × ÷ and
 * comparisons. IEEE 754 fixes the result of those to the last bit, so every
 * JavaScript engine computes the same numbers; `Math.sin`, `Math.cos` and
 * `Math.hypot` are left to each engine, and Chromium and Node already
 * disagree on the last bit of about one sine in thirty (ADR 0012). The
 * throw simulation uses these, so a Daily Skyline or a challenge link flies
 * the same everywhere.
 *
 * They agree with `Math` to within a few units in the last place, far below
 * anything a throw could show.
 */
const RADIANS_PER_DEGREE = 0.017453292519943295;

/**
 * 1 / n! for the Taylor series, up to 18!: every factorial that far is a
 * whole number a double holds exactly, and a division is correctly rounded,
 * so these are the same in every engine.
 */
const INVERSE_FACTORIAL: readonly number[] = (() => {
  const values = [1];
  let factorial = 1;
  for (let n = 1; n <= 18; n++) {
    factorial *= n;
    values.push(1 / factorial);
  }
  return values;
})();

/** sin(x) for |x| ≤ π/4, in Horner form. */
function sinSeries(x: number): number {
  const square = x * x;
  let sum = 0;
  for (let power = 17; power >= 3; power -= 2) {
    sum = (sum + (power % 4 === 1 ? 1 : -1) * (INVERSE_FACTORIAL[power] as number)) * square;
  }
  return x + x * sum;
}

/** cos(x) for |x| ≤ π/4, in Horner form. */
function cosSeries(x: number): number {
  const square = x * x;
  let sum = 0;
  for (let power = 18; power >= 2; power -= 2) {
    sum = (sum + (power % 4 === 0 ? 1 : -1) * (INVERSE_FACTORIAL[power] as number)) * square;
  }
  return 1 + sum;
}

/**
 * The sine and cosine of an angle in degrees. The angle is brought into the
 * first eighth of a turn with exact steps, where the short series is at its
 * most accurate, then the symmetries of the circle give the rest.
 */
export function sinCosDegrees(degrees: number): { sin: number; cos: number } {
  let turn = degrees % 360;
  if (turn < 0) turn += 360;
  const quadrant = Math.floor(turn / 90);
  const within = turn - quadrant * 90;
  // Past 45° the complement is nearer zero: sin(a) = cos(90° − a).
  const complement = within > 45;
  const radians = (complement ? 90 - within : within) * RADIANS_PER_DEGREE;
  const near = sinSeries(radians);
  const far = cosSeries(radians);
  const sin = complement ? far : near;
  const cos = complement ? near : far;
  switch (quadrant) {
    case 0:
      return { sin, cos };
    case 1:
      return { sin: cos, cos: -sin };
    case 2:
      return { sin: -sin, cos: -cos };
    default:
      return { sin: -cos, cos: sin };
  }
}

/**
 * √x by Newton's method from above: each step comes down towards the root
 * and it stops when a step no longer does, which is the same step in every
 * engine.
 */
export function squareRoot(x: number): number {
  if (!(x > 0)) return 0;
  let guess = x > 1 ? x : 1;
  for (;;) {
    const next = (guess + x / guess) / 2;
    if (next >= guess) return guess;
    guess = next;
  }
}
