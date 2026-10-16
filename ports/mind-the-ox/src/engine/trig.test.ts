import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CLASSIC_STEP,
  DOWN,
  LEFT,
  RIGHT,
  TURN,
  UP,
  climbFactor,
  cosine,
  headingDelta,
  headingOf,
  sine,
} from './trig';

describe('headings', () => {
  it('match Math.sin on every table entry and land exactly on the axes', () => {
    for (let heading = 0; heading < TURN; heading++) {
      expect(Math.abs(sine(heading) - Math.sin((heading / TURN) * 2 * Math.PI))).toBeLessThan(
        1e-14,
      );
    }
    expect(sine(UP)).toBe(1);
    expect(sine(DOWN)).toBe(-1);
    expect(cosine(RIGHT)).toBe(1);
    expect(cosine(LEFT)).toBe(-1);
    expect(sine(LEFT)).toBe(0);
  });

  it('interpolate between entries closely enough for smooth turning', () => {
    for (let heading = 0.5; heading < TURN; heading += 17.3) {
      expect(Math.abs(sine(heading) - Math.sin((heading / TURN) * 2 * Math.PI))).toBeLessThan(1e-6);
    }
  });

  it('shape gravity like the 1984 table: a quarter per sixteenth of steepness', () => {
    expect([0, 1, 2, 3, 4, 5, 8, 12, 15].map((step) => climbFactor(step * CLASSIC_STEP))).toEqual([
      0, 0.25, 0.5, 0.75, 1, 0.75, 0, -1, -0.25,
    ]);
  });

  it('find the heading of a direction without atan2', () => {
    for (const heading of [0, 100, 1024, 1500, 2048, 2900, 3072, 4000]) {
      const found = headingOf(cosine(heading) * 7, sine(heading) * 7);
      expect(Math.abs(headingDelta(found, heading))).toBeLessThan(0.05);
    }
  });

  it('measure the shortest turn between two headings', () => {
    expect(headingDelta(100, 300)).toBe(200);
    expect(headingDelta(4000, 100)).toBe(196);
    expect(headingDelta(100, 4000)).toBe(-196);
  });
});

/**
 * The Daily Sortie must fly the same everywhere, so the engine keeps to
 * arithmetic that every JavaScript engine rounds alike (see ADR 0012 for
 * why Math.sin and friends are out).
 */
describe('the engine’s arithmetic', () => {
  it('never calls a function that browsers are free to round differently', () => {
    const folder = join(__dirname);
    const forbidden =
      /Math\.(sin|cos|tan|asin|acos|atan2?|exp|expm1|log\w*|pow|cbrt|hypot|sinh|cosh|tanh)\b|\*\*/;
    for (const file of readdirSync(folder).filter(
      (name) => name.endsWith('.ts') && !name.endsWith('.test.ts'),
    )) {
      const code = readFileSync(join(folder, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(code, file).not.toMatch(forbidden);
    }
  });
});
