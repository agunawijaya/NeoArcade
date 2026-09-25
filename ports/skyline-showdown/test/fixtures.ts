import { STREET_Y } from '../src/engine/constants';
import type { Gorilla } from '../src/engine/gorillas';
import { simulateShot, type ShotSetup, type ThrowInput } from '../src/engine/shot';
import type { Building } from '../src/engine/skyline';
import { createTerrain } from '../src/engine/terrain';

/** A city of equal-width buildings with the given heights, left to right. */
export function cityOfHeights(heights: number[], width = 50): Building[] {
  return heights.map((height, index) => ({
    x: 2 + index * (width + 2),
    width,
    top: STREET_Y - height,
    windows: [],
  }));
}

export function gorillaOn(buildings: Building[], index: number): Gorilla {
  const building = buildings[index];
  const next = buildings[index + 1];
  if (!building || !next) throw new Error(`No building ${index}.`);
  return {
    x: Math.round(building.x + (next.x - building.x) / 2 - 14),
    y: building.top - 30,
    building: index,
  };
}

/** Twelve 50-wide buildings with the gorillas on the second and the eleventh. */
export function flatSetup(
  heights = Array.from({ length: 12 }, () => 60),
  overrides: Partial<ShotSetup> = {},
): ShotSetup {
  const buildings = cityOfHeights(heights);
  return {
    terrain: createTerrain(buildings),
    gorillas: [gorillaOn(buildings, 1), gorillaOn(buildings, buildings.length - 2)],
    wind: 0,
    gravity: 9.8,
    balloon: null,
    shields: [false, false],
    ...overrides,
  };
}

export function throwOf(
  thrower: 0 | 1,
  angle: number,
  velocity: number,
  powerUp: ThrowInput['powerUp'] = null,
): ThrowInput {
  return { thrower, angle, velocity, powerUp };
}

/** Brute-forces a throw whose result passes the test; for building scenarios in tests. */
export function findThrow(
  setup: ShotSetup,
  thrower: 0 | 1,
  accept: (shot: ReturnType<typeof simulateShot>) => boolean,
  powerUp: ThrowInput['powerUp'] = null,
): ThrowInput | null {
  for (let angle = 20; angle <= 85; angle += 1) {
    for (let velocity = 20; velocity <= 160; velocity += 1) {
      const input = throwOf(thrower, angle, velocity, powerUp);
      if (accept(simulateShot(setup, input))) return input;
    }
  }
  return null;
}
