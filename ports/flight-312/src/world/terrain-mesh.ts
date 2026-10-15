import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  ShaderMaterial,
  Sphere,
  Vector3,
  type Texture,
} from 'three';
import { AIRPORTS } from '../data/airport-data';
import { REGION_GRID } from '../data/terrain-data';
import type { LatLon } from '../engine/geo';
import type { Terrain } from '../engine/terrain';
import { METRES_PER_FOOT, type SceneFrame } from './frame';
import { drawLandUse, landUseTexture, REGION_BOUNDS, type Bounds } from './landuse';
import {
  ATMOSPHERE_GLSL,
  atmosphere,
  METRES_PER_DEGREE,
  NOISE_GLSL,
  PROJECT_GLSL,
} from './shaders';

/**
 * The ground: the whole region on NOAA's two-minute grid in tiles, and
 * around each airport a finer square, flattened where the airport is, with
 * its own sharper map of water and towns. Under a fine square the coarse
 * ground is sunk out of sight. One shader paints it all: late-winter fields
 * and woods, snow to the north and on the high ground, frozen-grey water
 * with the sun's glint, towns grey by day and orange at night.
 */
const TILE_CELLS = 32;
/** Half the side of an airport's fine square, and its grid spacing, metres. */
const FINE_HALF_METRES = 12_000;
const FINE_SPACING_METRES = 150;
/** The coarse ground under a fine square sinks this far, and the square's edges hang a skirt as deep. */
const SINK_METRES = 70;

const PALETTE = {
  ploughed: new Color('#6b5a45'),
  stubble: new Color('#8f8366'),
  winterGrass: new Color('#5f6a49'),
  forest: new Color('#2c3427'),
  conifer: new Color('#222c24'),
  snow: new Color('#e8ecf1'),
  town: new Color('#77767a'),
  water: new Color('#2f4250'),
  townLights: new Color('#ffb46a'),
};

const VERTEX = /* glsl */ `
  attribute vec2 geo;
  attribute vec2 mapKm;
  varying vec2 vGeo;
  varying vec2 vMapKm;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying float vElevation;
  ${PROJECT_GLSL}
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() {
    vec3 world = projectToScene(geoOffset, position.y);
    vWorld = world;
    vGeo = geo;
    vMapKm = mapKm;
    vNormal = normal;
    vElevation = position.y;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D uLandUse;
  uniform vec4 uBounds;
  uniform vec3 uPloughed;
  uniform vec3 uStubble;
  uniform vec3 uWinterGrass;
  uniform vec3 uForest;
  uniform vec3 uConifer;
  uniform vec3 uSnow;
  uniform vec3 uTown;
  uniform vec3 uWater;
  uniform vec3 uTownLights;
  varying vec2 vGeo;
  varying vec2 vMapKm;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying float vElevation;
  ${ATMOSPHERE_GLSL}
  ${NOISE_GLSL}
  #include <common>
  #include <logdepthbuf_pars_fragment>

  vec3 fields(vec2 km, float detail) {
    vec2 m = km / 0.42;
    vec2 warp = vec2(valueNoise(m * 0.27), valueNoise(m * 0.27 + 7.3)) * 0.6;
    vec2 cell = floor(m + warp);
    vec2 inField = fract(m + warp);
    float pick = hash12(cell);
    vec3 crop = pick < 0.38 ? uPloughed : pick < 0.72 ? uStubble : uWinterGrass;
    crop *= 0.86 + 0.28 * hash12(cell + 3.7);
    // Furrows across the ploughed fields, and hedgerows and lanes along every edge.
    float furrows = 0.5 + 0.5 * sin(dot(inField, hash12(cell + 1.9) < 0.5 ? vec2(90.0, 0.0) : vec2(0.0, 90.0)));
    crop *= pick < 0.38 ? 0.9 + 0.14 * furrows : 1.0;
    float edge = min(min(inField.x, 1.0 - inField.x), min(inField.y, 1.0 - inField.y));
    crop = mix(uForest * 0.8, crop, smoothstep(0.006, 0.03, edge));
    vec3 average = (uPloughed + uStubble + uWinterGrass) / 3.0;
    return mix(average, crop, detail);
  }

  // Street lamps on a grid of blocks that turns from district to district: crisp points near
  // the eye, and further off, where one pixel spans several lamps, a glitter of the brightest.
  // The pixel's narrower footprint sets the scale, so a glint stays a point at a grazing angle.
  vec3 cityLights(vec2 km) {
    float pixelKm = min(length(dFdx(km)), length(dFdy(km)));
    float turn = hash12(floor(km / 2.5)) * 1.6;
    float c = cos(turn);
    float s = sin(turn);
    vec2 street = vec2(c * km.x - s * km.y, s * km.x + c * km.y);
    vec2 block = fract(street / 0.14);
    float onStreet = 1.0 - step(0.12, min(block.x, block.y));
    vec2 lampCell = floor(street / 0.03);
    float lamp = onStreet * (1.0 - smoothstep(0.05, 0.16, length(fract(street / 0.03) - 0.5)));
    vec3 tint = mix(vec3(0.8, 0.88, 1.0), uTownLights, step(0.15, hash12(lampCell)));
    float cellKm = 0.004 * exp2(ceil(log2(max(pixelKm * 1.2, 0.004) / 0.004)));
    vec2 glitterCell = floor(km / cellKm);
    float glitter = step(0.8, hash12(glitterCell)) * (0.4 + 0.6 * hash12(glitterCell + 1.3));
    float far = smoothstep(0.002, 0.006, pixelKm);
    return tint * mix(lamp * 1.5, 0.04 + glitter * 0.6, far) + uTownLights * 0.025;
  }

  void main() {
    #include <logdepthbuf_fragment>
    vec2 uv = (vGeo - uBounds.xy) / (uBounds.zw - uBounds.xy);
    vec4 cover = texture2D(uLandUse, uv);
    float water = smoothstep(0.3, 0.7, cover.r);
    float town = smoothstep(0.2, 0.8, cover.g) * (1.0 - water);
    vec3 normal = normalize(vNormal);
    float slope = 1.0 - normal.y;
    float pixelKm = length(fwidth(vMapKm));
    float detail = 1.0 - smoothstep(0.12, 0.5, pixelKm);

    vec3 land = fields(vMapKm, detail);
    float woods = fbm(vMapKm * 0.55) + slope * 2.4 + clamp((vElevation - 250.0) / 700.0, 0.0, 0.35);
    float forest = smoothstep(0.58, 0.72, woods);
    land = mix(land, mix(uForest, uConifer, smoothstep(43.0, 45.5, vGeo.y)), forest);

    float north = smoothstep(41.3, 44.2, vGeo.y);
    float high = smoothstep(450.0, 950.0, vElevation);
    float patchy = 0.7 + 0.6 * valueNoise(vMapKm * 0.9);
    float snow = clamp(max(north * 0.9, high) * patchy - forest * 0.5, 0.0, 1.0);
    land = mix(land, uSnow, snow);

    float blocks = hash12(floor(vMapKm / 0.09));
    land = mix(land, uTown * (0.8 + 0.35 * blocks) * mix(1.0, 1.15, snow), town * 0.85);

    vec3 view = normalize(cameraPosition - vWorld);
    vec2 ripple = vec2(valueNoise(vMapKm * 40.0 + uTime * 0.05), valueNoise(vMapKm * 40.0 + 11.0 - uTime * 0.04)) - 0.5;
    vec3 waterNormal = normalize(vec3(ripple.x * 0.08, 1.0, ripple.y * 0.08));
    vec3 albedo = mix(land, uWater, water);
    vec3 surfaceNormal = normalize(mix(normal, waterNormal, water));

    float diffuse = max(dot(surfaceNormal, uSunDirection), 0.0);
    vec3 colour = albedo * (uSunColor * diffuse + ambient(surfaceNormal) * 0.6);
    vec3 mirrored = reflect(-uSunDirection, waterNormal);
    float glint = pow(max(dot(mirrored, view), 0.0), 180.0) * water;
    colour += uSunColor * glint * 1.6;
    colour += uSkyLight * water * 0.12 * (1.0 - view.y);

    colour += cityLights(vMapKm) * town * uNight;

    float distance = length(cameraPosition - vWorld);
    gl_FragColor = vec4(applyFog(colour, distance, 1.0), 1.0);
    #include <colorspace_fragment>
  }
`;

export function terrainMaterial(landUse: Texture, bounds: Bounds): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      ...atmosphere,
      uLandUse: { value: landUse },
      uBounds: { value: [bounds.west, bounds.south, bounds.east, bounds.north] },
      uPloughed: { value: PALETTE.ploughed },
      uStubble: { value: PALETTE.stubble },
      uWinterGrass: { value: PALETTE.winterGrass },
      uForest: { value: PALETTE.forest },
      uConifer: { value: PALETTE.conifer },
      uSnow: { value: PALETTE.snow },
      uTown: { value: PALETTE.town },
      uWater: { value: PALETTE.water },
      uTownLights: { value: PALETTE.townLights },
    },
  });
}

/** A grid of points, built into a mesh around its centre. */
interface GridSpec {
  centre: LatLon;
  rows: number;
  cols: number;
  point(row: number, col: number): LatLon;
  height(row: number, col: number, point: LatLon): number;
  /** Hang a skirt from the edges, for a fine square laid over the coarse ground. */
  skirt: boolean;
}

const REGION_KM_COS = Math.cos(((REGION_BOUNDS.south + REGION_BOUNDS.north) / 2) * (Math.PI / 180));

function buildGrid(spec: GridSpec): BufferGeometry {
  const { rows, cols, centre } = spec;
  const ring = spec.skirt ? 2 * (rows + cols) - 4 : 0;
  const count = rows * cols + ring;
  const position = new Float32Array(count * 3);
  const geoOffset = new Float32Array(count * 2);
  const geo = new Float32Array(count * 2);
  const mapKm = new Float32Array(count * 2);
  const cosCentre = Math.cos(centre.lat * (Math.PI / 180));
  const write = (index: number, point: LatLon, height: number) => {
    const dLon = point.lon - centre.lon;
    const dLat = point.lat - centre.lat;
    position.set(
      [dLon * METRES_PER_DEGREE * cosCentre, height, -dLat * METRES_PER_DEGREE],
      index * 3,
    );
    geoOffset.set([dLon, dLat], index * 2);
    geo.set([point.lon, point.lat], index * 2);
    mapKm.set(
      [
        ((point.lon - REGION_BOUNDS.west) * METRES_PER_DEGREE * REGION_KM_COS) / 1000,
        ((point.lat - REGION_BOUNDS.south) * METRES_PER_DEGREE) / 1000,
      ],
      index * 2,
    );
  };
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const point = spec.point(row, col);
      write(row * cols + col, point, spec.height(row, col, point));
    }
  }
  const indices: number[] = [];
  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols - 1; col++) {
      const a = row * cols + col;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      // Counter-clockwise seen from above, so the faces point up.
      indices.push(a, b, c, b, d, c);
    }
  }
  if (spec.skirt) {
    // Walk the border once round and hang each point's twin a skirt's depth below it.
    const border: number[] = [];
    for (let col = 0; col < cols; col++) border.push(col);
    for (let row = 1; row < rows; row++) border.push(row * cols + cols - 1);
    for (let col = cols - 2; col >= 0; col--) border.push((rows - 1) * cols + col);
    for (let row = rows - 2; row > 0; row--) border.push(row * cols);
    border.forEach((top, step) => {
      const twin = rows * cols + step;
      position.set(
        [
          position[top * 3] as number,
          (position[top * 3 + 1] as number) - SINK_METRES,
          position[top * 3 + 2] as number,
        ],
        twin * 3,
      );
      geoOffset.set([geoOffset[top * 2] as number, geoOffset[top * 2 + 1] as number], twin * 2);
      geo.set([geo[top * 2] as number, geo[top * 2 + 1] as number], twin * 2);
      mapKm.set([mapKm[top * 2] as number, mapKm[top * 2 + 1] as number], twin * 2);
    });
    for (let step = 0; step < border.length; step++) {
      const top = border[step] as number;
      const nextTop = border[(step + 1) % border.length] as number;
      const twin = rows * cols + step;
      const nextTwin = rows * cols + ((step + 1) % border.length);
      indices.push(top, nextTop, twin, nextTop, nextTwin, twin);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  geometry.setAttribute('geoOffset', new BufferAttribute(geoOffset, 2));
  geometry.setAttribute('geo', new BufferAttribute(geo, 2));
  geometry.setAttribute('mapKm', new BufferAttribute(mapKm, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  // The Earth's curve takes the far ground below where the flat geometry says it is.
  const sphere = geometry.boundingSphere ?? new Sphere(new Vector3(), 1);
  sphere.radius += 20_000;
  geometry.boundingSphere = sphere;
  return geometry;
}

interface FineSquare {
  ident: string;
  centre: LatLon;
  halfLat: number;
  halfLon: number;
}

function fineSquares(): FineSquare[] {
  return AIRPORTS.map((data) => ({
    ident: data.ident,
    centre: { lat: data.lat, lon: data.lon },
    halfLat: FINE_HALF_METRES / METRES_PER_DEGREE,
    halfLon: FINE_HALF_METRES / (METRES_PER_DEGREE * Math.cos(data.lat * (Math.PI / 180))),
  }));
}

const insideSquare = (square: FineSquare, point: LatLon, margin: number) =>
  Math.abs(point.lat - square.centre.lat) < square.halfLat - margin * square.halfLat &&
  Math.abs(point.lon - square.centre.lon) < square.halfLon - margin * square.halfLon;

export interface TerrainView {
  group: Group;
  /** Moves the meshes under a new scene origin. */
  place(frame: SceneFrame): void;
  dispose(): void;
}

interface Placed {
  mesh: Mesh;
  centre: LatLon;
}

export function buildTerrain(
  terrain: Terrain,
  regionMapSize: { width: number; height: number },
): TerrainView {
  const group = new Group();
  group.name = 'terrain';
  const placed: Placed[] = [];
  const squares = fineSquares();
  const regionCanvas = drawLandUse(REGION_BOUNDS, regionMapSize.width, regionMapSize.height);
  const regionTexture = landUseTexture(regionCanvas);
  const regionMaterial = terrainMaterial(regionTexture, REGION_BOUNDS);
  const materials = [regionMaterial];
  const textures = [regionTexture];

  const step = REGION_GRID.step;
  const heightAt = (point: LatLon) => terrain.elevationFt(point) * METRES_PER_FOOT;
  for (let row0 = 0; row0 < REGION_GRID.rows - 1; row0 += TILE_CELLS) {
    for (let col0 = 0; col0 < REGION_GRID.cols - 1; col0 += TILE_CELLS) {
      const rows = Math.min(TILE_CELLS, REGION_GRID.rows - 1 - row0) + 1;
      const cols = Math.min(TILE_CELLS, REGION_GRID.cols - 1 - col0) + 1;
      const point = (row: number, col: number): LatLon => ({
        lat: REGION_GRID.south + (row0 + row) * step,
        lon: REGION_GRID.west + (col0 + col) * step,
      });
      const centre = point((rows - 1) / 2, (cols - 1) / 2);
      const geometry = buildGrid({
        centre,
        rows,
        cols,
        point,
        height: (_row, _col, at) => {
          const sunk = squares.some((square) => insideSquare(square, at, 0.04));
          return heightAt(at) - (sunk ? SINK_METRES : 0);
        },
        skirt: false,
      });
      const mesh = new Mesh(geometry, regionMaterial);
      group.add(mesh);
      placed.push({ mesh, centre });
    }
  }

  for (const square of squares) {
    const bounds: Bounds = {
      west: square.centre.lon - square.halfLon,
      east: square.centre.lon + square.halfLon,
      south: square.centre.lat - square.halfLat,
      north: square.centre.lat + square.halfLat,
    };
    const canvas = drawLandUse(bounds, 1024, 1024);
    const texture = landUseTexture(canvas);
    const material = terrainMaterial(texture, bounds);
    materials.push(material);
    textures.push(texture);
    const cells = Math.round((2 * FINE_HALF_METRES) / FINE_SPACING_METRES);
    const geometry = buildGrid({
      centre: square.centre,
      rows: cells + 1,
      cols: cells + 1,
      point: (row, col) => ({
        lat: bounds.south + (row / cells) * (bounds.north - bounds.south),
        lon: bounds.west + (col / cells) * (bounds.east - bounds.west),
      }),
      height: (_row, _col, at) => heightAt(at),
      skirt: true,
    });
    const mesh = new Mesh(geometry, material);
    mesh.name = `airport ground ${square.ident}`;
    group.add(mesh);
    placed.push({ mesh, centre: square.centre });
  }

  return {
    group,
    place(frame) {
      atmosphere.uCosLatitude.value = Math.cos(frame.origin.lat * (Math.PI / 180));
      for (const { mesh, centre } of placed) {
        const { east, north } = frame.flat(centre);
        mesh.position.set(east, 0, -north);
        mesh.updateMatrixWorld();
      }
    },
    dispose() {
      for (const { mesh } of placed) mesh.geometry.dispose();
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
    },
  };
}
