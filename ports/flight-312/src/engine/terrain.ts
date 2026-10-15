import { AIRPORTS } from '../data/airport-data';
import { localFrame, type LatLon } from './geo';
import { FEET_PER_METRE } from './units';

/**
 * The ground under the flight: elevation from NOAA's ETOPO1 on a
 * two-minute grid, finer one-minute patches around the airports, and the
 * airports themselves levelled to their field elevation so a runway is
 * never on a slope the data invented. Water is a mask from Natural Earth.
 *
 * The grids arrive decoded (the game and the tests unpack them once with
 * the platform's DecompressionStream), so the engine itself never touches
 * compression.
 */
export interface ElevationGrid {
  south: number;
  west: number;
  rows: number;
  cols: number;
  step: number;
  /** Metres, row 0 at the south edge. */
  heights: Int16Array;
}

export interface TerrainSource {
  region: ElevationGrid & { water: Uint8Array };
  patches: (ElevationGrid & { ident: string })[];
}

export interface Terrain {
  elevationFt(point: LatLon): number;
  isWater(point: LatLon): boolean;
}

/** The ground is levelled this far beyond an airport's farthest runway end, then blended over the next stretch. */
const FLAT_MARGIN_FT = 3_000;
const BLEND_FT = 6_000;

function sample(grid: ElevationGrid, point: LatLon): number | null {
  const y = (point.lat - grid.south) / grid.step;
  const x = (point.lon - grid.west) / grid.step;
  if (y < 0 || x < 0 || y > grid.rows - 1 || x > grid.cols - 1) return null;
  const row = Math.floor(y) < grid.rows - 1 ? Math.floor(y) : grid.rows - 2;
  const col = Math.floor(x) < grid.cols - 1 ? Math.floor(x) : grid.cols - 2;
  const fy = y - row;
  const fx = x - col;
  const at = (r: number, c: number) => grid.heights[r * grid.cols + c] as number;
  const south = at(row, col) + (at(row, col + 1) - at(row, col)) * fx;
  const north = at(row + 1, col) + (at(row + 1, col + 1) - at(row + 1, col)) * fx;
  return (south + (north - south) * fy) * FEET_PER_METRE;
}

export function createTerrain(source: TerrainSource): Terrain {
  const fields = AIRPORTS.map((data) => {
    const frame = localFrame({ lat: data.lat, lon: data.lon });
    const farthest = Math.max(
      ...data.runways.flatMap((strip) =>
        strip.ends.map((end) => {
          const { north, east } = frame.toLocal(end);
          return Math.sqrt(north * north + east * east);
        }),
      ),
    );
    return {
      frame,
      flatRadiusFt: farthest + FLAT_MARGIN_FT,
      elevationFt: data.elevationFt,
      patch: source.patches.find((patch) => patch.ident === data.ident),
    };
  });

  const raw = (point: LatLon): number => {
    for (const field of fields) {
      if (!field.patch) continue;
      const fine = sample(field.patch, point);
      if (fine !== null) return fine;
    }
    return sample(source.region, point) ?? 0;
  };

  return {
    elevationFt(point) {
      const ground = raw(point);
      for (const field of fields) {
        const { north, east } = field.frame.toLocal(point);
        const distance = Math.sqrt(north * north + east * east);
        if (distance >= field.flatRadiusFt + BLEND_FT) continue;
        if (distance <= field.flatRadiusFt) return field.elevationFt;
        const t = (distance - field.flatRadiusFt) / BLEND_FT;
        const smooth = t * t * (3 - 2 * t);
        return field.elevationFt + (ground - field.elevationFt) * smooth;
      }
      return ground;
    },
    isWater(point) {
      const grid = source.region;
      const row = Math.round((point.lat - grid.south) / grid.step);
      const col = Math.round((point.lon - grid.west) / grid.step);
      if (row < 0 || col < 0 || row >= grid.rows || col >= grid.cols) return false;
      return grid.water[row * grid.cols + col] === 1;
    },
  };
}

/** Flat ground at one elevation, for tests and for practice modes that need nothing more. */
export function flatTerrain(elevationFt = 0): Terrain {
  return { elevationFt: () => elevationFt, isWater: () => false };
}
