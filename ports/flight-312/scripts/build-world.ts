import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { format } from 'prettier';

/**
 * Builds Flight 312's world from public-domain sources, once, into files
 * that are committed (ADR 0024). The game never fetches anything.
 *
 * - OurAirports (public domain): runways of the departure and destination
 *   airports, and the VORs the 1982 program names, matched by position.
 * - NOAA ETOPO1 through ERDDAP (U.S. Government data, free to use and
 *   redistribute): elevation on a 2-arc-minute grid over the region, and
 *   1-arc-minute patches around each airport.
 * - Natural Earth 1:10m (public domain): land, lakes, rivers, urban areas
 *   and towns, clipped to the region and simplified.
 *
 *   npx tsx ports/flight-312/scripts/build-world.ts
 */
const print = (text = '') => process.stdout.write(`${text}\n`);
const cache = join(tmpdir(), 'flight-312-world');
mkdirSync(cache, { recursive: true });
const out = join(import.meta.dirname, '..', 'src', 'data');

const REGION = { south: 37, north: 48, west: -90.5, east: -68.5 };
const GRID_STEP = 2 / 60;
const PATCH_STEP = 1 / 60;
const PATCH_HALF = { lat: 0.4, lon: 0.55 };

const AIRPORTS = ['KPHL', 'KJFK', 'KBOS', 'CYAM', 'KPSB', 'KBUF'] as const;

/** The program's sixteen stations, as its tables give them (longitude west, positive). */
const PROGRAM_VORS: [number, number, number][] = [
  [115.9, 40.633, 73.773],
  [113.8, 40.202, 74.495],
  [112.7, 42.358, 70.99301],
  [117.7, 41.282, 70.027],
  [117.8, 42.74301, 73.802],
  [112.2, 46.41201, 84.315],
  [117.4, 38.35, 81.77001],
  [115.5, 40.917, 77.99301],
  [116.4, 42.928, 78.64701],
  [113.6, 41.358, 82.162],
  [116.9, 42.96701, 83.74201],
  [117.0, 44.555, 88.19501],
  [112.3, 41.547, 88.318],
  [117.9, 39.495, 76.97801],
  [115.7, 42.048, 83.458],
  [112.8, 39.637, 75.303],
];

/** Surface levels of the great lakes in metres, whose bed ETOPO1 records instead. */
const LAKE_LEVELS: Record<string, number> = {
  'Lake Superior': 183,
  'Lake Michigan': 176,
  'Lake Huron': 176,
  'Lake Erie': 174,
  'Lake Ontario': 75,
  'Lake Saint Clair': 175,
  'Georgian Bay': 176,
};

async function download(name: string, url: string): Promise<string> {
  const file = join(cache, name);
  if (!existsSync(file)) {
    print(`downloading ${name}…`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    writeFileSync(file, await response.text());
  }
  return readFileSync(file, 'utf8');
}

// ——— OurAirports ———

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i] as string;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  const [header, ...body] = rows;
  return body.map((cells) =>
    Object.fromEntries((header ?? []).map((key, i) => [key, cells[i] ?? ''])),
  );
}

function nauticalMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * 60;
  const dLon = (lon2 - lon1) * 60 * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180));
  return Math.hypot(dLat, dLon);
}

async function stations() {
  const base = 'https://davidmegginson.github.io/ourairports-data';
  const navaids = parseCsv(await download('navaids.csv', `${base}/navaids.csv`)).filter((row) =>
    ['VOR', 'VORTAC', 'VOR-DME'].includes(row.type ?? ''),
  );
  return PROGRAM_VORS.map(([frequency, lat, lonWest], index) => {
    const lon = -lonWest;
    const nearest = navaids
      .map((row) => ({
        row,
        distance: nauticalMiles(lat, lon, Number(row.latitude_deg), Number(row.longitude_deg)),
      }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (!nearest || nearest.distance > 1) throw new Error(`station ${index}: no VOR within 1 nm`);
    const { row } = nearest;
    print(
      `${String(index).padStart(2)} ${frequency.toFixed(1)}  ${row.ident} ${row.name} (${row.type}, today ${(Number(row.frequency_khz) / 1000).toFixed(2)}), ${nearest.distance.toFixed(2)} nm`,
    );
    return {
      index,
      ident: row.ident,
      name: titleCase(row.name ?? ''),
      variation: Number(row.magnetic_variation_deg),
      elevationFt: Number(row.elevation_ft || 0),
      todayMhz: Number(row.frequency_khz) / 1000,
      offsetNm: Number(nearest.distance.toFixed(2)),
    };
  });
}

function titleCase(name: string): string {
  return name.replace(/\w\S*/g, (word) => word[0]?.toUpperCase() + word.slice(1).toLowerCase());
}

async function airports() {
  const base = 'https://davidmegginson.github.io/ourairports-data';
  const airportRows = parseCsv(await download('airports.csv', `${base}/airports.csv`));
  const runwayRows = parseCsv(await download('runways.csv', `${base}/runways.csv`));
  return AIRPORTS.map((ident) => {
    const airport = airportRows.find((row) => row.ident === ident);
    if (!airport) throw new Error(`${ident} is not in airports.csv`);
    const runways = runwayRows
      .filter((row) => row.airport_ident === ident && row.closed !== '1' && row.le_latitude_deg)
      .map((row) => ({
        ends: [end(row, 'le'), end(row, 'he')] as const,
        lengthFt: Number(row.length_ft),
        widthFt: Number(row.width_ft),
        surface: row.surface ?? '',
      }));
    return {
      ident,
      name: airport.name ?? ident,
      city: airport.municipality ?? '',
      lat: round(Number(airport.latitude_deg), 6),
      lon: round(Number(airport.longitude_deg), 6),
      elevationFt: Number(airport.elevation_ft),
      runways,
    };
  });
}

function end(row: Record<string, string>, prefix: 'le' | 'he') {
  return {
    ident: row[`${prefix}_ident`] ?? '',
    lat: round(Number(row[`${prefix}_latitude_deg`]), 6),
    lon: round(Number(row[`${prefix}_longitude_deg`]), 6),
    elevationFt: Number(row[`${prefix}_elevation_ft`] || 0),
    headingTrue: Number(row[`${prefix}_heading_degT`] || 0),
    displacedFt: Number(row[`${prefix}_displaced_threshold_ft`] || 0),
  };
}

// ——— ETOPO1 ———

interface Grid {
  south: number;
  west: number;
  rows: number;
  cols: number;
  step: number;
  heights: Int16Array;
}

async function elevation(
  name: string,
  south: number,
  north: number,
  west: number,
  east: number,
  stride: number,
): Promise<Grid> {
  const url =
    'https://coastwatch.pfeg.noaa.gov/erddap/griddap/etopo180.csv?altitude' +
    `%5B(${south}):${stride}:(${north})%5D%5B(${west}):${stride}:(${east})%5D`;
  const text = await download(`${name}.csv`, url);
  const lines = text.trim().split('\n').slice(2);
  const lats = new Set<string>();
  const lons = new Set<string>();
  const values: number[] = [];
  for (const line of lines) {
    const [lat, lon, altitude] = line.split(',');
    lats.add(lat as string);
    lons.add(lon as string);
    values.push(Number(altitude));
  }
  const rows = lats.size;
  const cols = lons.size;
  if (rows * cols !== values.length) throw new Error(`${name}: ragged grid`);
  return {
    south: Number([...lats][0]),
    west: Number([...lons][0]),
    rows,
    cols,
    step: (stride * 1) / 60,
    heights: Int16Array.from(values),
  };
}

// ——— Natural Earth ———

type Ring = [number, number][];
interface Feature {
  properties: Record<string, unknown>;
  // Natural Earth leaves a few features without a shape.
  geometry:
    | { type: 'Polygon'; coordinates: Ring[] }
    | { type: 'MultiPolygon'; coordinates: Ring[][] }
    | { type: 'LineString'; coordinates: Ring }
    | { type: 'MultiLineString'; coordinates: Ring[] }
    | { type: 'Point'; coordinates: [number, number] };
}

async function layer(name: string): Promise<Feature[]> {
  const base = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
  const text = await download(`${name}.geojson`, `${base}/${name}.geojson`);
  return (JSON.parse(text) as { features: Feature[] }).features;
}

function polygonsOf(feature: Feature): Ring[][] {
  if (!feature.geometry) return [];
  if (feature.geometry.type === 'Polygon') return [feature.geometry.coordinates];
  if (feature.geometry.type === 'MultiPolygon') return feature.geometry.coordinates;
  return [];
}

function linesOf(feature: Feature): Ring[] {
  if (!feature.geometry) return [];
  if (feature.geometry.type === 'LineString') return [feature.geometry.coordinates];
  if (feature.geometry.type === 'MultiLineString') return feature.geometry.coordinates;
  return [];
}

const MARGIN = 0.6;
const inRegion = ([lon, lat]: [number, number]) =>
  lat >= REGION.south - MARGIN &&
  lat <= REGION.north + MARGIN &&
  lon >= REGION.west - MARGIN &&
  lon <= REGION.east + MARGIN;

function touchesRegion(ring: Ring): boolean {
  return ring.some(inRegion);
}

/** Douglas–Peucker in degrees, longitude scaled by the latitude. */
function simplify(points: Ring, tolerance: number): Ring {
  if (points.length < 3) return points;
  const scale = Math.cos(((REGION.south + REGION.north) / 2) * (Math.PI / 180));
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop() as [number, number];
    const [ax, ay] = points[first] as [number, number];
    const [bx, by] = points[last] as [number, number];
    let worst = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const [px, py] = points[i] as [number, number];
      const dx = (bx - ax) * scale;
      const dy = by - ay;
      const length = Math.hypot(dx, dy);
      // A closed ring starts and ends on the same point: measure from that point instead of a line.
      const distance =
        length < 1e-9
          ? Math.hypot((px - ax) * scale, py - ay)
          : Math.abs((px - ax) * scale * dy - (py - ay) * dx) / length;
      if (distance > worst) {
        worst = distance;
        index = i;
      }
    }
    if (worst > tolerance && index > 0) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/**
 * Cuts a polygon ring to the region (Sutherland–Hodgman, one edge of the
 * box at a time), so the continent's coastline arrives as the stretch the
 * game flies over and not all of North America.
 */
function clipToRegion(ring: Ring): Ring {
  const box = {
    south: REGION.south - MARGIN,
    north: REGION.north + MARGIN,
    west: REGION.west - MARGIN,
    east: REGION.east + MARGIN,
  };
  const edges: {
    inside: (point: [number, number]) => boolean;
    cross: (a: [number, number], b: [number, number]) => [number, number];
  }[] = [
    { inside: ([lon]) => lon >= box.west, cross: (a, b) => atLongitude(a, b, box.west) },
    { inside: ([lon]) => lon <= box.east, cross: (a, b) => atLongitude(a, b, box.east) },
    { inside: ([, lat]) => lat >= box.south, cross: (a, b) => atLatitude(a, b, box.south) },
    { inside: ([, lat]) => lat <= box.north, cross: (a, b) => atLatitude(a, b, box.north) },
  ];
  let points = ring;
  for (const edge of edges) {
    const clipped: Ring = [];
    points.forEach((point, index) => {
      const previous = points[(index + points.length - 1) % points.length] as [number, number];
      if (edge.inside(point)) {
        if (!edge.inside(previous)) clipped.push(edge.cross(previous, point));
        clipped.push(point);
      } else if (edge.inside(previous)) {
        clipped.push(edge.cross(previous, point));
      }
    });
    points = clipped;
    if (points.length === 0) break;
  }
  return points;
}

function atLongitude(
  [lon1, lat1]: [number, number],
  [lon2, lat2]: [number, number],
  lon: number,
): [number, number] {
  return [lon, lat1 + ((lon - lon1) / (lon2 - lon1)) * (lat2 - lat1)];
}

function atLatitude(
  [lon1, lat1]: [number, number],
  [lon2, lat2]: [number, number],
  lat: number,
): [number, number] {
  return [lon1 + ((lat - lat1) / (lat2 - lat1)) * (lon2 - lon1), lat];
}

const TOLERANCE = 0.004;
const encodeRing = (ring: Ring) =>
  simplify(ring, TOLERANCE).flatMap(([lon, lat]) => [round(lon, 3), round(lat, 3)]);

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Marks the grid cells whose centres fall inside the rings (even–odd rule), row by row. */
function rasterise(grid: Grid, rings: Ring[], mark: (index: number) => void) {
  for (let row = 0; row < grid.rows; row++) {
    const lat = grid.south + row * grid.step;
    const crossings: number[] = [];
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [x1, y1] = ring[i] as [number, number];
        const [x2, y2] = ring[j] as [number, number];
        if (y1 > lat !== y2 > lat) crossings.push(x1 + ((lat - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    crossings.sort((a, b) => a - b);
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      const from = Math.ceil(((crossings[k] as number) - grid.west) / grid.step);
      const to = Math.floor(((crossings[k + 1] as number) - grid.west) / grid.step);
      for (let col = Math.max(0, from); col <= Math.min(grid.cols - 1, to); col++) {
        mark(row * grid.cols + col);
      }
    }
  }
}

function pack(bytes: Uint8Array): string {
  return gzipSync(bytes, { level: 9 }).toString('base64');
}

async function main() {
  print('The program’s stations, matched to OurAirports:');
  const vors = await stations();
  const airportData = await airports();

  const grid = await elevation(
    'etopo-region',
    REGION.south,
    REGION.north,
    REGION.west,
    REGION.east,
    2,
  );
  print(`terrain grid: ${grid.rows} × ${grid.cols} at ${GRID_STEP * 60}′`);

  const land = (await layer('ne_10m_land')).flatMap(polygonsOf).flat().filter(touchesRegion);
  const lakeFeatures = (await layer('ne_10m_lakes')).filter((feature) =>
    polygonsOf(feature).some((polygon) => polygon.some(touchesRegion)),
  );
  const lakeRings = lakeFeatures.flatMap(polygonsOf).flat().filter(touchesRegion);

  // Water: everything outside land, or inside a lake.
  const water = new Uint8Array(grid.rows * grid.cols).fill(1);
  rasterise(grid, land, (index) => (water[index] = 0));
  rasterise(grid, lakeRings, (index) => (water[index] = 1));
  for (let index = 0; index < water.length; index++) {
    if (water[index] && (grid.heights[index] as number) < 0) grid.heights[index] = 0;
  }
  for (const feature of lakeFeatures) {
    const level = LAKE_LEVELS[String(feature.properties.name ?? '')];
    if (level === undefined) continue;
    rasterise(grid, polygonsOf(feature).flat(), (index) => (grid.heights[index] = level));
  }
  for (let index = 0; index < grid.heights.length; index++) {
    if ((grid.heights[index] as number) < 0) grid.heights[index] = 0;
  }

  const patches = await Promise.all(
    airportData.map(async (airport) => {
      const patch = await elevation(
        `etopo-${airport.ident}`,
        round(airport.lat - PATCH_HALF.lat, 2),
        round(airport.lat + PATCH_HALF.lat, 2),
        round(airport.lon - PATCH_HALF.lon, 2),
        round(airport.lon + PATCH_HALF.lon, 2),
        1,
      );
      for (let index = 0; index < patch.heights.length; index++) {
        if ((patch.heights[index] as number) < 0) patch.heights[index] = 0;
      }
      return { ident: airport.ident, ...patch, step: PATCH_STEP };
    }),
  );

  const rivers = [
    ...(await layer('ne_10m_rivers_lake_centerlines')),
    ...(await layer('ne_10m_rivers_north_america')),
  ]
    .flatMap((feature) =>
      linesOf(feature).map((line) => ({
        rank: Number(feature.properties.scalerank ?? 10),
        line,
      })),
    )
    .filter(({ line }) => touchesRegion(line));
  const urban = (await layer('ne_10m_urban_areas'))
    .flatMap(polygonsOf)
    .flat()
    .filter(touchesRegion);
  const places = (await layer('ne_10m_populated_places_simple'))
    .filter((feature) => feature.geometry?.type === 'Point')
    .map((feature) => ({
      name: String(feature.properties.name),
      lon: (feature.geometry as { coordinates: [number, number] }).coordinates[0],
      lat: (feature.geometry as { coordinates: [number, number] }).coordinates[1],
      population: Number(feature.properties.pop_max ?? 0),
    }))
    .filter((place) => inRegion([place.lon, place.lat]) && place.population >= 20_000);

  const header = (what: string) =>
    `// Generated by scripts/build-world.ts from ${what}. Do not edit by hand.\n`;

  const heights = new Uint8Array(grid.heights.buffer.slice(0));
  await write(
    'terrain-data.ts',
    `${header('NOAA ETOPO1 (U.S. Government data) and Natural Earth (public domain)')}
/** Elevation in metres on a grid, row 0 at the south edge; Int16 little-endian, gzipped, base64. */
export interface PackedGrid {
  south: number;
  west: number;
  rows: number;
  cols: number;
  step: number;
  heights: string;
}

export const REGION_GRID: PackedGrid & { water: string } = ${JSON.stringify({
      south: grid.south,
      west: grid.west,
      rows: grid.rows,
      cols: grid.cols,
      step: GRID_STEP,
      heights: pack(heights),
      water: pack(water),
    })};

/** Finer elevation around each airport. */
export const AIRPORT_PATCHES: (PackedGrid & { ident: string })[] = ${JSON.stringify(
      patches.map((patch) => ({
        ident: patch.ident,
        south: patch.south,
        west: patch.west,
        rows: patch.rows,
        cols: patch.cols,
        step: patch.step,
        heights: pack(new Uint8Array(patch.heights.buffer.slice(0))),
      })),
    )};
`,
  );

  await write(
    'geography-data.ts',
    `${header('Natural Earth 1:10m (public domain)')}
/** Rings and lines as flat [lon, lat, lon, lat, …] arrays in degrees. */
export const LAND: number[][] = ${JSON.stringify(
      land.map((ring) => encodeRing(clipToRegion(ring))).filter((ring) => ring.length >= 6),
    )};

export const LAKES: { name: string; ring: number[] }[] = ${JSON.stringify(
      lakeFeatures.flatMap((feature) =>
        polygonsOf(feature)
          .map((polygon) => polygon[0] as Ring)
          .filter(touchesRegion)
          .map((ring) => ({
            name: String(feature.properties.name ?? ''),
            ring: encodeRing(clipToRegion(ring)),
          }))
          .filter(({ ring }) => ring.length >= 6),
      ),
    )};

/** Rivers, with Natural Earth's scale rank: the lower, the more important. */
export const RIVERS: { rank: number; line: number[] }[] = ${JSON.stringify(
      rivers
        .map(({ rank, line }) => ({ rank, line: encodeRing(line) }))
        .filter(({ line }) => line.length >= 4),
    )};

export const URBAN: number[][] = ${JSON.stringify(
      urban.map((ring) => encodeRing(clipToRegion(ring))).filter((ring) => ring.length >= 6),
    )};

export const PLACES: { name: string; lat: number; lon: number; population: number }[] = ${JSON.stringify(
      places.map((place) => ({
        name: place.name,
        lat: round(place.lat, 3),
        lon: round(place.lon, 3),
        population: place.population,
      })),
    )};
`,
  );

  await write(
    'airport-data.ts',
    `${header('OurAirports (public domain)')}
export interface RunwayEndData {
  ident: string;
  lat: number;
  lon: number;
  elevationFt: number;
  headingTrue: number;
  displacedFt: number;
}

export interface AirportData {
  ident: string;
  name: string;
  city: string;
  lat: number;
  lon: number;
  elevationFt: number;
  runways: { ends: readonly [RunwayEndData, RunwayEndData]; lengthFt: number; widthFt: number; surface: string }[];
}

export const AIRPORTS: AirportData[] = ${JSON.stringify(airportData)};

/** The program's sixteen stations as identified today: index in its tables, ident, variation (° east). */
export const STATION_IDENTITIES: { index: number; ident: string; name: string; variation: number; elevationFt: number; todayMhz: number; offsetNm: number }[] = ${JSON.stringify(vors)};
`,
  );
}

async function write(name: string, source: string) {
  const formatted = await format(source, {
    parser: 'typescript',
    printWidth: 100,
    singleQuote: true,
  });
  writeFileSync(join(out, name), formatted);
  print(`wrote src/data/${name} (${(formatted.length / 1024).toFixed(0)} KB)`);
}

await main();
