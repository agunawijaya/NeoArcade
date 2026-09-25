import { STREET_Y } from './constants';
import { pointInCircle, pointInRect, type Circle, type Rect } from './geometry';
import type { Building } from './skyline';

/**
 * The destructible city: building blocks minus every hole blasted into them.
 * Holes are kept as shapes, not pixels, so collisions stay exact and the
 * engine never needs a canvas.
 */
export interface Terrain {
  buildings: Building[];
  /** Round holes left by explosions. */
  craters: Circle[];
  /** Roof sections knocked off by a Golden Banana. */
  cuts: Rect[];
}

export function createTerrain(buildings: Building[]): Terrain {
  return { buildings, craters: [], cuts: [] };
}

export function copyTerrain(terrain: Terrain): Terrain {
  return { buildings: terrain.buildings, craters: [...terrain.craters], cuts: [...terrain.cuts] };
}

export function buildingRect(building: Building): Rect {
  return { x: building.x, y: building.top, width: building.width, height: STREET_Y - building.top };
}

/** The index of the building that is solid at this point, or -1. */
export function solidBuildingAt(terrain: Terrain, x: number, y: number): number {
  if (terrain.craters.some((crater) => pointInCircle(x, y, crater))) return -1;
  if (terrain.cuts.some((cut) => pointInRect(x, y, cut))) return -1;
  return terrain.buildings.findIndex((building) => pointInRect(x, y, buildingRect(building)));
}

/**
 * Checks the banana's centre and the four points of its outline, which is
 * how the original felt ahead of the banana with POINT.
 */
export function discHitsTerrain(terrain: Terrain, x: number, y: number, radius: number): number {
  const probes = [
    [x, y],
    [x + radius, y],
    [x - radius, y],
    [x, y + radius],
    [x, y - radius],
  ] as const;
  for (const [probeX, probeY] of probes) {
    const index = solidBuildingAt(terrain, probeX, probeY);
    if (index !== -1) return index;
  }
  return -1;
}
