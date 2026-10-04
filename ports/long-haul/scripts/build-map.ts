import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Results go to stdout, ready to paste into the docs. */
const print = (text = '') => process.stdout.write(`${text}\n`);

/**
 * Builds Long Haul's map of the United States from Natural Earth, which is
 * in the public domain (https://www.naturalearthdata.com/about/terms-of-use/).
 * It downloads the 1:50m states, countries and lakes once into a temporary
 * folder, projects them with an Albers equal-area conic, simplifies them and
 * writes compact SVG path strings to src/map/geography.ts, which is
 * committed. The game never fetches anything at runtime.
 *
 *   npx tsx ports/long-haul/scripts/build-map.ts
 */
const SOURCE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
const LAYERS = {
  states: 'ne_50m_admin_1_states_provinces',
  countries: 'ne_50m_admin_0_countries',
  lakes: 'ne_50m_lakes',
} as const;

type Ring = [number, number][];
type Polygon = Ring[];
interface Feature {
  properties: Record<string, unknown>;
  geometry:
    { type: 'Polygon'; coordinates: Polygon } | { type: 'MultiPolygon'; coordinates: Polygon[] };
}

async function layer(name: string): Promise<Feature[]> {
  const folder = join(tmpdir(), 'long-haul-geo');
  mkdirSync(folder, { recursive: true });
  const file = join(folder, `${name}.geojson`);
  if (!existsSync(file)) {
    print(`downloading ${name}…`);
    const response = await fetch(`${SOURCE}/${name}.geojson`);
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    writeFileSync(file, await response.text());
  }
  return (JSON.parse(readFileSync(file, 'utf8')) as { features: Feature[] }).features;
}

// Albers equal-area conic for the lower 48: standard parallels 29.5° and 45.5°.
const RADIANS = Math.PI / 180;
const PARALLEL_1 = 29.5 * RADIANS;
const PARALLEL_2 = 45.5 * RADIANS;
const ORIGIN_LAT = 37.5 * RADIANS;
const ORIGIN_LON = -96;
const n = (Math.sin(PARALLEL_1) + Math.sin(PARALLEL_2)) / 2;
const C = Math.cos(PARALLEL_1) ** 2 + 2 * n * Math.sin(PARALLEL_1);
const rho0 = Math.sqrt(C - 2 * n * Math.sin(ORIGIN_LAT)) / n;

function albers(lon: number, lat: number): [number, number] {
  const rho = Math.sqrt(C - 2 * n * Math.sin(lat * RADIANS)) / n;
  const theta = n * (lon - ORIGIN_LON) * RADIANS;
  return [rho * Math.sin(theta), rho0 - rho * Math.cos(theta)];
}

// The frame: the lower 48 with a margin of Canada, Mexico and sea around them.
const WIDTH = 1000;
const corners = [
  albers(-124.8, 48.5),
  albers(-124.5, 32.5),
  albers(-66.9, 44.8),
  albers(-80.5, 25),
  albers(-97.4, 25.8),
  albers(-95.2, 49.4),
  albers(-117, 32.5),
];
const xs = corners.map(([x]) => x);
const ys = corners.map(([, y]) => y);
const margin = 0.03;
const minX = Math.min(...xs) - margin;
const maxX = Math.max(...xs) + margin;
const minY = Math.min(...ys) - margin;
const maxY = Math.max(...ys) + margin;
const scale = WIDTH / (maxX - minX);
const HEIGHT = Math.round((maxY - minY) * scale);

function toMap(lon: number, lat: number): [number, number] {
  const [x, y] = albers(lon, lat);
  return [(x - minX) * scale, (maxY - y) * scale];
}

/** Douglas–Peucker on a closed ring. */
function simplify(ring: Ring, tolerance: number): Ring {
  if (ring.length < 4) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = 1;
  keep[ring.length - 1] = 1;
  const stack: [number, number][] = [[0, ring.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop() as [number, number];
    const [ax, ay] = ring[start] as [number, number];
    const [bx, by] = ring[end] as [number, number];
    let worst = -1;
    let worstDistance = tolerance;
    for (let index = start + 1; index < end; index++) {
      const [px, py] = ring[index] as [number, number];
      const dx = bx - ax;
      const dy = by - ay;
      const length = Math.hypot(dx, dy);
      const distance =
        length === 0
          ? Math.hypot(px - ax, py - ay)
          : Math.abs(dy * px - dx * py + bx * ay - by * ax) / length;
      if (distance > worstDistance) {
        worst = index;
        worstDistance = distance;
      }
    }
    if (worst !== -1) {
      keep[worst] = 1;
      stack.push([start, worst], [worst, end]);
    }
  }
  return ring.filter((_, index) => keep[index] === 1);
}

/** Sutherland–Hodgman against the frame, so Canada does not reach the Arctic. */
function clip(ring: Ring, pad: number): Ring {
  const edges: ((point: [number, number]) => boolean)[] = [
    ([x]) => x >= -pad,
    ([x]) => x <= WIDTH + pad,
    ([, y]) => y >= -pad,
    ([, y]) => y <= HEIGHT + pad,
  ];
  const cut = (a: [number, number], b: [number, number], edge: number): [number, number] => {
    const bounds = [-pad, WIDTH + pad, -pad, HEIGHT + pad];
    const limit = bounds[edge] as number;
    const axis = edge < 2 ? 0 : 1;
    const t = (limit - a[axis]) / (b[axis] - a[axis]);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };
  let output = ring;
  edges.forEach((inside, edge) => {
    const input = output;
    output = [];
    for (let index = 0; index < input.length; index++) {
      const current = input[index] as [number, number];
      const previous = input[(index + input.length - 1) % input.length] as [number, number];
      if (inside(current)) {
        if (!inside(previous)) output.push(cut(previous, current, edge));
        output.push(current);
      } else if (inside(previous)) {
        output.push(cut(previous, current, edge));
      }
    }
  });
  return output;
}

function area(ring: Ring): number {
  let sum = 0;
  for (let index = 0; index < ring.length; index++) {
    const [x1, y1] = ring[index] as [number, number];
    const [x2, y2] = ring[(index + 1) % ring.length] as [number, number];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/** Rings as a compact path: one absolute move, then relative lines at a tenth of a unit. */
function toPath(rings: Ring[]): string {
  return rings
    .map((ring) => {
      const points = ring.map(([x, y]) => [Math.round(x * 10), Math.round(y * 10)] as const);
      const [first, ...rest] = points;
      if (!first) return '';
      let path = `M${first[0] / 10} ${first[1] / 10}l`;
      let [px, py] = first;
      const steps: string[] = [];
      for (const [x, y] of rest) {
        if (x === px && y === py) continue;
        steps.push(`${(x - px) / 10} ${(y - py) / 10}`);
        px = x;
        py = y;
      }
      path += steps.join(' ').replace(/ -/g, '-');
      return `${path}z`;
    })
    .join('');
}

function polygonsOf(feature: Feature): Polygon[] {
  return feature.geometry.type === 'Polygon'
    ? [feature.geometry.coordinates]
    : feature.geometry.coordinates;
}

function projectFeature(
  feature: Feature,
  tolerance: number,
  minArea: number,
  pad: number | null,
): Ring[] {
  const rings: Ring[] = [];
  for (const polygon of polygonsOf(feature)) {
    for (const ring of polygon) {
      let projected = ring.map(([lon, lat]) => toMap(lon, lat));
      if (pad !== null) projected = clip(projected, pad);
      if (projected.length < 3) continue;
      const simple = simplify(projected, tolerance);
      if (simple.length >= 3 && area(simple) >= minArea) rings.push(simple);
    }
  }
  return rings;
}

const states = (await layer(LAYERS.states)).filter(
  (feature) =>
    feature.properties.iso_a2 === 'US' && !['AK', 'HI'].includes(String(feature.properties.postal)),
);
const countries = (await layer(LAYERS.countries)).filter((feature) =>
  ['CAN', 'MEX', 'CUB', 'BHS'].includes(String(feature.properties.ADM0_A3)),
);
const lakes = (await layer(LAYERS.lakes)).filter((feature) => {
  const name = String(feature.properties.name ?? '');
  return [
    'Lake Superior',
    'Lake Michigan',
    'Lake Huron',
    'Lake Erie',
    'Lake Ontario',
    'Lake Saint Clair',
    'Great Salt Lake',
    'Lake Okeechobee',
    'Lake of the Woods',
    'Lake Winnipeg',
    'Lake Tahoe',
    'Lake Pontchartrain',
    'Lake Champlain',
  ].includes(name);
});

const stateShapes = states
  .map((feature) => {
    const [labelX, labelY] = toMap(
      Number(feature.properties.longitude),
      Number(feature.properties.latitude),
    );
    return {
      code: String(feature.properties.postal),
      name: String(feature.properties.name),
      label: [Math.round(labelX * 10) / 10, Math.round(labelY * 10) / 10],
      path: toPath(projectFeature(feature, 0.45, 0.6, null)),
    };
  })
  .sort((a, b) => a.code.localeCompare(b.code));
const neighbours = toPath(countries.flatMap((feature) => projectFeature(feature, 0.6, 2, 30)));
const lakePaths = toPath(lakes.flatMap((feature) => projectFeature(feature, 0.4, 0.5, 30)));

const lines = [
  '// Generated by ports/long-haul/scripts/build-map.ts from Natural Earth 1:50m',
  '// (public domain, naturalearthdata.com). Do not edit by hand: run the script.',
  '',
  '/** The map is drawn in these units; the projection below turns degrees into them. */',
  `export const MAP_WIDTH = ${WIDTH};`,
  `export const MAP_HEIGHT = ${HEIGHT};`,
  '',
  '/** Albers equal-area conic, standard parallels 29.5° and 45.5°, centred on 96° W. */',
  'export const ALBERS = {',
  '  parallel1: 29.5,',
  '  parallel2: 45.5,',
  '  originLat: 37.5,',
  `  originLon: ${ORIGIN_LON},`,
  `  minX: ${minX},`,
  `  maxY: ${maxY},`,
  `  scale: ${scale},`,
  '} as const;',
  '',
  'export interface StateShape {',
  '  code: string;',
  '  name: string;',
  '  /** Where its name sits, in map units. */',
  '  label: readonly [number, number];',
  '  path: string;',
  '}',
  '',
  'export const STATE_SHAPES: readonly StateShape[] = [',
  ...stateShapes.map(
    (shape) =>
      `  { code: '${shape.code}', name: '${shape.name}', label: [${shape.label.join(', ')}], path: '${shape.path}' },`,
  ),
  '];',
  '',
  '/** Canada, Mexico and the islands at the edge of the map. */',
  `export const NEIGHBOURS = '${neighbours}';`,
  '',
  '/** The Great Lakes and a few more that a road atlas would show. */',
  `export const LAKES = '${lakePaths}';`,
  '',
];
const output = new URL('../src/map/geography.ts', import.meta.url);
const prettier = await import('prettier');
const options = (await prettier.resolveConfig(output)) ?? {};
const text = await prettier.format(lines.join('\n'), { ...options, parser: 'typescript' });
writeFileSync(output, text);
const kb = (Buffer.byteLength(text) / 1024).toFixed(0);
print(`wrote src/map/geography.ts: ${stateShapes.length} states, ${kb} KB, ${WIDTH} × ${HEIGHT}`);
