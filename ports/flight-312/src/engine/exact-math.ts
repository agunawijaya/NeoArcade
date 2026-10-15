/**
 * The trigonometry, exponentials and logarithms the flight engine needs,
 * built from + − × ÷, comparisons and Math.round/floor/abs/sqrt alone.
 * IEEE 754 fixes those to the last bit, so every browser flies the same
 * flight from the same seed and the same inputs; `Math.sin`, `Math.exp`
 * and friends are left to each engine and differ in the last bit (ADR 0012
 * measured it; ADR 0023 applies it here). `Math.sqrt` is one of the
 * operations IEEE 754 requires to be correctly rounded, and ADR 0012 found
 * no browser that disagrees, so it is used as it is.
 *
 * Every function agrees with its `Math` twin to within a few units in the
 * last place over the ranges a flight uses.
 */
export const PI = 3.141592653589793;
export const HALF_PI = 1.5707963267948966;
export const TWO_PI = 6.283185307179586;
export const RADIANS_PER_DEGREE = 0.017453292519943295;
export const DEGREES_PER_RADIAN = 57.29577951308232;

// π/2 in two parts, so that k·π/2 subtracts exactly (the classic Cody–Waite split).
const HALF_PI_HIGH = 1.5707963267341256;
const HALF_PI_LOW = 6.077100506506192e-11;

const LN2 = 0.6931471805599453;
const LN2_HIGH = 0.6931471803691238;
const LN2_LOW = 1.9082149292705877e-10;
const SQRT_3 = 1.7320508075688772;
const SQRT_2 = 1.4142135623730951;
const SIXTH_PI = 0.5235987755982988;

/** 1 / n!, exact as far as 18! (every factorial that far is a whole number a double holds). */
const INVERSE_FACTORIAL: readonly number[] = (() => {
  const values = [1];
  let factorial = 1;
  for (let n = 1; n <= 18; n++) {
    factorial *= n;
    values.push(1 / factorial);
  }
  return values;
})();

/** The series' signed coefficients, highest power first, worked out once. */
const powers = (from: number, to: number) =>
  Array.from({ length: (from - to) / 2 + 1 }, (_, i) => from - 2 * i);
const SIN_TERMS = powers(17, 3).map(
  (power) => (power % 4 === 1 ? 1 : -1) * (INVERSE_FACTORIAL[power] as number),
);
const COS_TERMS = powers(18, 2).map(
  (power) => (power % 4 === 0 ? 1 : -1) * (INVERSE_FACTORIAL[power] as number),
);
const ATAN_TERMS = powers(27, 3).map((power) => (power % 4 === 1 ? 1 : -1) / power);
const ATANH_TERMS = powers(23, 3).map((power) => 1 / power);

/** Horner's rule in x²: ((c₀·x² + c₁)·x² + …)·x². */
function series(terms: readonly number[], square: number): number {
  let sum = 0;
  for (let i = 0; i < terms.length; i++) sum = (sum + (terms[i] as number)) * square;
  return sum;
}

function sinSeries(x: number): number {
  return x + x * series(SIN_TERMS, x * x);
}

function cosSeries(x: number): number {
  return 1 + series(COS_TERMS, x * x);
}

export interface SinCos {
  sin: number;
  cos: number;
}

/** Sine and cosine of an angle in radians, together, since the engine nearly always wants both. */
export function sinCos(radians: number): SinCos {
  const quarterTurns = Math.round(radians / HALF_PI);
  const reduced = radians - quarterTurns * HALF_PI_HIGH - quarterTurns * HALF_PI_LOW;
  const sin = sinSeries(reduced);
  const cos = cosSeries(reduced);
  switch (((quarterTurns % 4) + 4) % 4) {
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

export const sin = (radians: number) => sinCos(radians).sin;
export const cos = (radians: number) => sinCos(radians).cos;

/**
 * Sine and cosine of an angle in degrees, reduced in degrees first, so that
 * headings and bearings land exactly on the axes.
 */
export function sinCosDegrees(degrees: number): SinCos {
  let turn = degrees % 360;
  if (turn < 0) turn += 360;
  const quadrant = Math.floor(turn / 90);
  const within = turn - quadrant * 90;
  const complement = within > 45;
  const radians = (complement ? 90 - within : within) * RADIANS_PER_DEGREE;
  const near = sinSeries(radians);
  const far = cosSeries(radians);
  const s = complement ? far : near;
  const c = complement ? near : far;
  switch (quadrant) {
    case 0:
      return { sin: s, cos: c };
    case 1:
      return { sin: c, cos: -s };
    case 2:
      return { sin: -s, cos: -c };
    default:
      return { sin: -c, cos: s };
  }
}

export function tan(radians: number): number {
  const { sin: s, cos: c } = sinCos(radians);
  return s / c;
}

/** atan(t) for |t| ≤ tan(15°), where the series converges fast. */
function atanSeries(t: number): number {
  return t + t * series(ATAN_TERMS, t * t);
}

export function atan(x: number): number {
  if (x !== x) return x;
  const negative = x < 0;
  let t = negative ? -x : x;
  let offset = 0;
  let mirrored = false;
  if (t > 1) {
    t = 1 / t;
    mirrored = true;
  }
  // Past tan 15° step down by 30°: atan t = 30° + atan((t√3 − 1)/(t + √3)).
  if (t > 0.2679491924311227) {
    t = (t * SQRT_3 - 1) / (t + SQRT_3);
    offset = SIXTH_PI;
  }
  let angle = offset + atanSeries(t);
  if (mirrored) angle = HALF_PI - angle;
  return negative ? -angle : angle;
}

export function atan2(y: number, x: number): number {
  if (x > 0) return atan(y / x);
  if (x < 0) return y >= 0 ? atan(y / x) + PI : atan(y / x) - PI;
  if (y > 0) return HALF_PI;
  if (y < 0) return -HALF_PI;
  return 0;
}

export function asin(x: number): number {
  const clamped = x > 1 ? 1 : x < -1 ? -1 : x;
  return atan2(clamped, Math.sqrt(1 - clamped * clamped));
}

export function acos(x: number): number {
  const clamped = x > 1 ? 1 : x < -1 ? -1 : x;
  return atan2(Math.sqrt(1 - clamped * clamped), clamped);
}

/** 2^k, by exact doublings. */
function powerOfTwo(k: number): number {
  let result = 1;
  const factor = k >= 0 ? 2 : 0.5;
  for (let i = Math.abs(k); i > 0; i--) result *= factor;
  return result;
}

export function exp(x: number): number {
  if (x > 709) return Infinity;
  if (x < -745) return 0;
  const k = Math.round(x / LN2);
  const r = x - k * LN2_HIGH - k * LN2_LOW;
  let sum = 0;
  for (let power = 16; power >= 1; power--) {
    sum = (sum + (INVERSE_FACTORIAL[power] as number)) * r;
  }
  return (1 + sum) * powerOfTwo(k);
}

export function ln(x: number): number {
  if (!(x > 0)) return x === 0 ? -Infinity : NaN;
  let mantissa = x;
  let exponent = 0;
  while (mantissa >= 2) {
    mantissa /= 2;
    exponent++;
  }
  while (mantissa < 1) {
    mantissa *= 2;
    exponent--;
  }
  if (mantissa > SQRT_2) {
    mantissa /= 2;
    exponent++;
  }
  // ln m = 2·atanh(s), s = (m − 1)/(m + 1), and |s| ≤ 0.172 here.
  const s = (mantissa - 1) / (mantissa + 1);
  const lnMantissa = 2 * (s + s * series(ATANH_TERMS, s * s));
  return exponent * LN2_HIGH + (exponent * LN2_LOW + lnMantissa);
}

/** x^y for x > 0. */
export function pow(x: number, y: number): number {
  if (x === 1 || y === 0) return 1;
  if (!(x > 0)) return x === 0 ? 0 : NaN;
  return exp(y * ln(x));
}

/** The shortest signed difference between two angles in degrees, in (−180, 180]. */
export function angleDifference(to: number, from: number): number {
  let difference = (to - from) % 360;
  if (difference > 180) difference -= 360;
  if (difference <= -180) difference += 360;
  return difference;
}

/** An angle in degrees brought into [0, 360). */
export function normaliseDegrees(degrees: number): number {
  const turn = degrees % 360;
  return turn < 0 ? turn + 360 : turn;
}

export function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

/** Moves `current` towards `target` by at most `step`. */
export function approach(current: number, target: number, step: number): number {
  if (current < target) return current + step < target ? current + step : target;
  return current - step > target ? current - step : target;
}
