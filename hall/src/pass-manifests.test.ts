import { describe, expect, it } from 'vitest';
import rawCatalog from '../catalog.json';
import { parseCatalog } from './catalog';
import { loadPassShelves } from './pass-manifests';

describe('loadPassShelves', () => {
  it('names shelves after the catalog, in catalog order', async () => {
    const { games } = parseCatalog(rawCatalog);
    const shelves = await loadPassShelves(games);
    expect(shelves.games.slice(0, games.length).map((game) => game.slug)).toEqual(
      games.map((game) => game.slug),
    );
  });

  it('adds the Pass Lab on the dev server only', async () => {
    const shelves = await loadPassShelves([]);
    const hasLab = shelves.manifests.some((manifest) => manifest.game === 'pass-lab');
    expect(hasLab).toBe(import.meta.env.DEV);
  });
});
