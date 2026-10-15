import type { ElevationGrid, TerrainSource } from '../engine/terrain';
import { AIRPORT_PATCHES, REGION_GRID, type PackedGrid } from './terrain-data';

/**
 * Unpacks the committed terrain (gzip in base64) with the platform's own
 * DecompressionStream, which browsers and Node both have, so the game and
 * the tests read the same bytes the same way.
 */
async function gunzip(base64: string): Promise<ArrayBuffer> {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

async function unpackGrid(packed: PackedGrid): Promise<ElevationGrid> {
  return {
    south: packed.south,
    west: packed.west,
    rows: packed.rows,
    cols: packed.cols,
    step: packed.step,
    heights: new Int16Array(await gunzip(packed.heights)),
  };
}

let loading: Promise<TerrainSource> | null = null;

/** The region's elevation, its water and the airport patches, unpacked once. */
export function loadTerrainSource(): Promise<TerrainSource> {
  loading ??= (async () => {
    const [region, water, patches] = await Promise.all([
      unpackGrid(REGION_GRID),
      gunzip(REGION_GRID.water),
      Promise.all(
        AIRPORT_PATCHES.map(async (patch) => ({
          ident: patch.ident,
          ...(await unpackGrid(patch)),
        })),
      ),
    ]);
    return { region: { ...region, water: new Uint8Array(water) }, patches };
  })();
  return loading;
}
