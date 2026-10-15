import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRng } from '@shared/rng';
import { describe, expect, it } from 'vitest';
import {
  acos,
  angleDifference,
  asin,
  atan,
  atan2,
  exp,
  ln,
  normaliseDegrees,
  pow,
  sinCos,
  sinCosDegrees,
  tan,
} from './exact-math';

const close = (actual: number, expected: number, relative = 4e-15) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(
    Math.max(Math.abs(expected), 1) * relative,
  );

describe('exact maths', () => {
  it('agrees with Math on sines and cosines over many turns', () => {
    const rng = createRng(312);
    for (let sample = 0; sample < 20_000; sample++) {
      const radians = rng.float(-40, 40);
      const { sin, cos } = sinCos(radians);
      close(sin, Math.sin(radians));
      close(cos, Math.cos(radians));
    }
    expect(sinCosDegrees(90).sin).toBe(1);
    expect(sinCosDegrees(180).cos).toBe(-1);
    close(tan(0.3), Math.tan(0.3));
  });

  it('agrees with Math on arctangents in every quadrant', () => {
    const rng = createRng(747);
    for (let sample = 0; sample < 20_000; sample++) {
      const x = rng.float(-1000, 1000);
      const y = rng.float(-1000, 1000);
      close(atan(x / 37), Math.atan(x / 37));
      close(atan2(y, x), Math.atan2(y, x));
    }
    close(atan2(0, -1), Math.PI);
    expect(atan2(0, 0)).toBe(0);
    close(asin(0.5), Math.asin(0.5));
    close(acos(-0.25), Math.acos(-0.25));
  });

  it('agrees with Math on exponentials, logarithms and powers', () => {
    const rng = createRng(1982);
    for (let sample = 0; sample < 20_000; sample++) {
      const x = rng.float(-30, 30);
      close(exp(x), Math.exp(x), 1e-14);
      const y = rng.float(1e-6, 1e6);
      close(ln(y), Math.log(y), 1e-15);
    }
    // The atmosphere: (T / T0) ^ 5.25588.
    close(pow(0.7519, 5.25588), Math.pow(0.7519, 5.25588), 1e-14);
    expect(pow(2, 0)).toBe(1);
  });

  it('measures angles the short way round', () => {
    expect(angleDifference(10, 350)).toBe(20);
    expect(angleDifference(350, 10)).toBe(-20);
    expect(angleDifference(180, 0)).toBe(180);
    expect(normaliseDegrees(-90)).toBe(270);
  });
});

// The engine must give every browser the same flight, so it keeps away from
// the functions each browser rounds its own way (ADR 0023).
describe('the engine', () => {
  const folder = import.meta.dirname;
  const sources = readdirSync(folder).filter(
    (name) => name.endsWith('.ts') && !name.endsWith('.test.ts') && name !== 'exact-math.ts',
  );
  const forbidden =
    /Math\.(sin|cos|tan|asin|acos|atan|atan2|exp|expm1|log|log2|log10|log1p|pow|hypot|cbrt|sinh|cosh|tanh|random)\b|\*\*/;

  it.each(sources)('%s uses only exact arithmetic', (name) => {
    const code = readFileSync(join(folder, name), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(forbidden);
  });
});
