import { describe, expect, it } from 'vitest';
import { createRng } from './index';

describe('createRng', () => {
  it('repeats the same sequence for the same seed', () => {
    const first = createRng(1990);
    const second = createRng(1990);
    const a = Array.from({ length: 50 }, () => first.next());
    const b = Array.from({ length: 50 }, () => second.next());
    expect(a).toEqual(b);
  });

  it('gives different sequences for different seeds', () => {
    expect(createRng(1).next()).not.toEqual(createRng(2).next());
  });

  it('accepts readable string seeds', () => {
    expect(createRng('sunset').next()).toEqual(createRng('sunset').next());
    expect(createRng('sunset').next()).not.toEqual(createRng('sunrise').next());
  });

  it('keeps next() inside [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 10_000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('includes both ends in int() and spreads values evenly', () => {
    const rng = createRng(42);
    const counts = new Map<number, number>();
    for (let i = 0; i < 66_000; i++) {
      const value = rng.int(-5, 5);
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    expect([...counts.keys()].sort((a, b) => a - b)).toEqual([
      -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5,
    ]);
    for (const count of counts.values()) {
      expect(count / 66_000).toBeCloseTo(1 / 11, 2);
    }
  });

  it('keeps float() inside its range', () => {
    const rng = createRng(3);
    for (let i = 0; i < 1000; i++) {
      const value = rng.float(38, 74);
      expect(value).toBeGreaterThanOrEqual(38);
      expect(value).toBeLessThan(74);
    }
  });

  it('honours chance() probabilities', () => {
    const rng = createRng(11);
    let hits = 0;
    for (let i = 0; i < 30_000; i++) if (rng.chance(1 / 3)) hits++;
    expect(hits / 30_000).toBeCloseTo(1 / 3, 1);
    expect(createRng(5).chance(0)).toBe(false);
    expect(createRng(5).chance(1)).toBe(true);
  });

  it('picks items from a list and refuses an empty one', () => {
    const rng = createRng(9);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(rng.pick(['up', 'down', 'v']));
    expect(seen).toEqual(new Set(['up', 'down', 'v']));
    expect(() => rng.pick([])).toThrow(RangeError);
  });

  it('clones into an independent generator at the same point', () => {
    const rng = createRng(123);
    rng.next();
    const copy = rng.clone();
    expect(copy.state).toBe(rng.state);
    const fromCopy = [copy.next(), copy.next()];
    expect([rng.next(), rng.next()]).toEqual(fromCopy);
  });
});
