import { createRng } from '@shared/rng';
import { CEILING } from '../engine/constants';

/**
 * Fat summer cumulus, laid out once per map so both views share them. Each
 * cloud is a cluster of puffs; `parallax` says how far back it is (1 is the
 * line of play, above 1 drifts in front of it and is drawn see-through so
 * it never hides the fight).
 */
export interface Puff {
  dx: number;
  dy: number;
  radius: number;
}

export interface Cloud {
  id: number;
  x: number;
  y: number;
  parallax: number;
  puffs: Puff[];
  /** Half its width, for culling. */
  reach: number;
}

const LAYERS: readonly {
  parallax: number;
  count: number;
  size: [number, number];
  height: [number, number];
}[] = [
  { parallax: 0.12, count: 18, size: [7, 13], height: [CEILING * 0.38, CEILING * 0.7] },
  { parallax: 0.35, count: 16, size: [11, 19], height: [CEILING * 0.45, CEILING * 0.85] },
  { parallax: 0.7, count: 12, size: [15, 26], height: [CEILING * 0.55, CEILING * 0.95] },
  { parallax: 1.18, count: 8, size: [12, 18], height: [CEILING * 0.5, CEILING * 0.9] },
];

export function buildClouds(seed: number, worldWidth: number): Cloud[] {
  const rng = createRng(`mind-the-ox:clouds:${seed}`);
  const clouds: Cloud[] = [];
  let id = 0;
  for (const layer of LAYERS) {
    const span = worldWidth * layer.parallax + 1200;
    for (let index = 0; index < layer.count; index++) {
      const size = rng.float(layer.size[0], layer.size[1]);
      const puffs: Puff[] = [];
      const lobes = rng.int(4, 7);
      for (let lobe = 0; lobe < lobes; lobe++) {
        const along = (lobe / (lobes - 1) - 0.5) * size * 1.7;
        // Taller in the middle, flat along the bottom.
        const height = (1 - Math.abs(along) / (size * 1.1)) * size * 0.55;
        const radius = size * rng.float(0.32, 0.5) * (0.7 + height / size);
        puffs.push({ dx: along, dy: Math.max(radius * 0.55, height * rng.float(0.6, 1)), radius });
      }
      puffs.push({ dx: rng.float(-0.2, 0.2) * size, dy: size * 0.62, radius: size * 0.42 });
      // Small cauliflower bumps along the top.
      for (let bump = 0; bump < 5; bump++) {
        const along = rng.float(-0.8, 0.8) * size;
        const height = (1 - Math.abs(along) / (size * 1.1)) * size * 0.9;
        puffs.push({ dx: along, dy: height, radius: size * rng.float(0.16, 0.26) });
      }
      clouds.push({
        id: id++,
        x: ((index + rng.float(0.1, 0.9)) / layer.count) * span - 600,
        y: rng.float(layer.height[0], layer.height[1]),
        parallax: layer.parallax,
        puffs,
        reach: size * 1.4,
      });
    }
  }
  return clouds;
}
