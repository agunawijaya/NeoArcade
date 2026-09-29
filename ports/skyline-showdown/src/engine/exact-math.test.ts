import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRng } from '@shared/rng';
import { describe, expect, it } from 'vitest';
import { sinCosDegrees, squareRoot } from './exact-math';

describe('exact maths', () => {
  it('agrees with Math.sin and Math.cos to a few units in the last place', () => {
    const rng = createRng(3);
    for (let sample = 0; sample < 20_000; sample++) {
      const degrees = rng.float(-720, 720);
      const { sin, cos } = sinCosDegrees(degrees);
      const radians = (degrees * Math.PI) / 180;
      // Past a full turn Math loses a little in the conversion to radians; these reduce in degrees first.
      expect(Math.abs(sin - Math.sin(radians))).toBeLessThan(4e-15);
      expect(Math.abs(cos - Math.cos(radians))).toBeLessThan(4e-15);
    }
  });

  it('lands exactly on the axes', () => {
    expect(sinCosDegrees(0)).toEqual({ sin: 0, cos: 1 });
    expect(sinCosDegrees(90).sin).toBe(1);
    expect(sinCosDegrees(180).cos).toBe(-1);
    expect(sinCosDegrees(270).sin).toBe(-1);
    expect(sinCosDegrees(360)).toEqual(sinCosDegrees(0));
  });

  it('takes square roots to within a unit in the last place, and of nothing, nothing', () => {
    const rng = createRng(4);
    for (let sample = 0; sample < 20_000; sample++) {
      const value = rng.float(0, 500_000);
      expect(Math.abs(squareRoot(value) - Math.sqrt(value))).toBeLessThanOrEqual(
        Math.sqrt(value) * 2.3e-16,
      );
    }
    expect(squareRoot(0)).toBe(0);
    expect(squareRoot(-4)).toBe(0);
    expect(squareRoot(0.25)).toBe(0.5);
    expect(squareRoot(1e6)).toBe(1000);
  });
});

/**
 * The simulation must stay to arithmetic that every JavaScript engine
 * rounds the same way (ADR 0012). The CPU's planning (ai.ts) is outside:
 * a CPU's throws are recorded as numbers, never planned again elsewhere.
 */
const SIMULATION = [
  'constants.ts',
  'exact-math.ts',
  'geometry.ts',
  'gorillas.ts',
  'match.ts',
  'powerups.ts',
  'shot.ts',
  'skyline.ts',
  'terrain.ts',
  'twists.ts',
  'wind.ts',
  'worlds.ts',
];
const INEXACT =
  /Math\.(sin|cos|tan|asin|acos|atan2?|sinh|cosh|tanh|asinh|acosh|atanh|exp|expm1|log|log1p|log2|log10|pow|sqrt|cbrt|hypot)\b|\*\*/;

describe('the simulation', () => {
  for (const file of SIMULATION) {
    it(`uses only exact arithmetic in ${file}`, () => {
      const code = readFileSync(join(import.meta.dirname, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(code).not.toMatch(INEXACT);
    });
  }
});
