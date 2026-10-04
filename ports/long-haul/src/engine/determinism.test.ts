import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { driveHour } from './hour';
import { buyFuel, finishStop, openStop } from './stop';
import { testTrip } from './test-trips';
import type { Trip } from './trip';

/** A driver who always makes the same choices, so two runs can be compared. */
function driveWholeTrip(seed: number): Trip {
  const trip = testTrip({ seed, route: 'north', cargo: 'oranges', load: 42_000 });
  while (trip.status === 'driving' && trip.hourCount < 400) {
    if (trip.stopOffered) {
      const { visit } = openStop(trip);
      buyFuel(trip, visit, Math.max(0, 180 - Math.floor(trip.fuel)));
      finishStop(trip, visit, trip.awake > 12 ? { hours: 7, motel: false } : null);
      continue;
    }
    const speed = trip.condition === 'clear' ? 64 : 50;
    driveHour(trip, speed);
  }
  return trip;
}

describe('determinism', () => {
  it('replays a whole trip exactly from its seed and choices', () => {
    for (const seed of [1, 42, 1982, 777_777]) {
      expect(JSON.stringify(driveWholeTrip(seed))).toBe(JSON.stringify(driveWholeTrip(seed)));
    }
  });

  it('gives different seeds different trips', () => {
    expect(JSON.stringify(driveWholeTrip(1))).not.toBe(JSON.stringify(driveWholeTrip(2)));
  });

  it('keeps the engine to arithmetic every browser rounds alike', () => {
    const folder = import.meta.dirname;
    const forbidden =
      /Math\.(sin|cos|tan|asin|acos|atan2?|exp|expm1|log\w*|pow|sqrt|cbrt|hypot|random)\b|(?<![/*])\*\*(?![/*])/;
    for (const file of readdirSync(folder)) {
      if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue;
      const source = readFileSync(join(folder, file), 'utf8');
      expect(forbidden.test(source), file).toBe(false);
    }
  });
});
