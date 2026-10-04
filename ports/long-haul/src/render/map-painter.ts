import type { WeatherSystem } from '../engine/living-weather';
import { systemCentre, systemStrength } from '../engine/living-weather';
import { stateZone, type ZoneId } from '../data/zones';
import { ALBERS, LAKES, MAP_HEIGHT, MAP_WIDTH, NEIGHBOURS, STATE_SHAPES } from '../map/geography';
import { project, type MapPoint } from '../map/projection';
import type { RouteVertex } from '../map/route-geometry';
import { sunAltitude } from './sun';

/**
 * Draws the United States: the paper road atlas by day, a dark chart by
 * night, the folded atlas on the dashboard. One painter serves the map
 * screen, the corner mini-map and the cab's atlas; each passes a camera and
 * the layers it wants.
 */
export type MapStyle = 'paper' | 'night' | 'atlas';

export interface MapPalette {
  sea: string;
  neighbours: string;
  land: string;
  zones: Readonly<Record<ZoneId, string>>;
  border: string;
  coast: string;
  lake: string;
  network: string;
  route: string;
  routeCasing: string;
  option: string;
  trail: readonly [slow: string, steady: string, fast: string];
  town: string;
  townText: string;
  hubText: string;
  stateText: string;
  night: string;
  rig: string;
  highlight: string;
}

export const MAP_PALETTES: Readonly<Record<MapStyle, MapPalette>> = {
  paper: {
    sea: '#cfe2e6',
    neighbours: '#ebe5d6',
    land: '#f7f1e3',
    zones: { pacific: '#eef3e3', mountain: '#f7ecdc', central: '#eaf0ef', eastern: '#f5e9e7' },
    border: 'rgba(122, 106, 84, 0.55)',
    coast: '#8fb3bd',
    lake: '#c3dde3',
    network: 'rgba(170, 70, 60, 0.32)',
    route: '#c8322a',
    routeCasing: '#fff8ea',
    option: 'rgba(55, 92, 160, 0.55)',
    trail: ['#2f7fc1', '#2b9a5a', '#8e3fbf'],
    town: '#3a3226',
    townText: '#3a3226',
    hubText: '#1f1a12',
    stateText: 'rgba(110, 96, 74, 0.45)',
    night: 'rgba(24, 30, 64, 0.32)',
    rig: '#1d8f52',
    highlight: '#f2b705',
  },
  night: {
    sea: '#0b1220',
    neighbours: '#121a29',
    land: '#18202f',
    zones: { pacific: '#1a2433', mountain: '#1e2230', central: '#18232f', eastern: '#1e202f' },
    border: 'rgba(140, 160, 200, 0.22)',
    coast: '#2f4f6a',
    lake: '#0f1a2b',
    network: 'rgba(255, 170, 90, 0.18)',
    route: '#ff8c42',
    routeCasing: 'rgba(10, 14, 24, 0.9)',
    option: 'rgba(120, 180, 255, 0.55)',
    trail: ['#5fb4ff', '#43d68a', '#d36cff'],
    town: '#d7deea',
    townText: '#c3ccdb',
    hubText: '#f2efe6',
    stateText: 'rgba(180, 196, 226, 0.22)',
    night: 'rgba(0, 4, 16, 0.42)',
    rig: '#43d68a',
    highlight: '#ffd166',
  },
  atlas: {
    sea: '#c9dfe0',
    neighbours: '#e6dcc3',
    land: '#f3e7c9',
    zones: { pacific: '#eaeccd', mountain: '#f3e2c0', central: '#e5e6c9', eastern: '#efdfc5' },
    border: 'rgba(120, 96, 64, 0.5)',
    coast: '#93b1b4',
    lake: '#bcd6d6',
    network: 'rgba(180, 60, 50, 0.35)',
    route: '#c0392b',
    routeCasing: '#fbf3df',
    option: 'rgba(60, 90, 150, 0.5)',
    trail: ['#2d5f9a', '#3a3a3a', '#7a3a9a'],
    town: '#3d3020',
    townText: '#3d3020',
    hubText: '#2a2014',
    stateText: 'rgba(120, 96, 64, 0.4)',
    night: 'rgba(30, 20, 40, 0.18)',
    rig: '#b03a1a',
    highlight: '#e0a000',
  },
};

export interface MapCamera {
  /** Map units at the centre of the canvas. */
  x: number;
  y: number;
  /** Pixels per map unit. */
  scale: number;
}

/** A camera that fits a box of map units into a canvas, with a margin in pixels. */
export function fitCamera(
  box: { minX: number; minY: number; maxX: number; maxY: number },
  width: number,
  height: number,
  margin = 24,
): MapCamera {
  const spanX = Math.max(20, box.maxX - box.minX);
  const spanY = Math.max(20, box.maxY - box.minY);
  const scale = Math.min((width - margin * 2) / spanX, (height - margin * 2) / spanY);
  return { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2, scale };
}

export function wholeCountry(width: number, height: number, margin = 12): MapCamera {
  return fitCamera(
    { minX: 20, minY: 10, maxX: MAP_WIDTH - 20, maxY: MAP_HEIGHT - 10 },
    width,
    height,
    margin,
  );
}

export type MarkerKind =
  | 'stop'
  | 'sleep'
  | 'ticket'
  | 'blowout'
  | 'weather'
  | 'toll'
  | 'scale'
  | 'construction'
  | 'radar'
  | 'detour'
  | 'slide'
  | 'crash'
  | 'police';

export interface MapMarker extends MapPoint {
  kind: MarkerKind;
}

export interface MapTown extends MapPoint {
  name: string;
  rank: 'hub' | 'stop' | 'line';
}

export interface MapRoute {
  line: readonly RouteVertex[];
  tone: 'active' | 'option' | 'faded';
  colour?: string;
}

export interface TrailPoint extends MapPoint {
  speed: number;
}

export interface MapLayers {
  network?: readonly (readonly MapPoint[])[];
  routes?: readonly MapRoute[];
  /** The part of the active route about to be driven, leg by leg. */
  highlight?: readonly MapPoint[];
  trail?: readonly TrailPoint[];
  markers?: readonly MapMarker[];
  towns?: readonly MapTown[];
  rig?: (MapPoint & { heading: number }) | null;
  weather?: { systems: readonly WeatherSystem[]; hour: number } | null;
  /** UTC milliseconds; shades the side of the country where the sun is down. */
  nightAt?: number | null;
  zoneBands?: boolean;
  stateNames?: boolean;
  /** A ring that grows from a point: a waypoint just reached. */
  pulse?: { point: MapPoint; age: number } | null;
}

interface Shapes {
  states: { code: string; zone: ZoneId; path: Path2D; label: readonly [number, number] }[];
  neighbours: Path2D;
  lakes: Path2D;
  all: Path2D;
}

let shapes: Shapes | null = null;

function loadShapes(): Shapes {
  if (shapes) return shapes;
  const all = new Path2D();
  const states = STATE_SHAPES.map((state) => {
    const path = new Path2D(state.path);
    all.addPath(path);
    return { code: state.code, zone: stateZone(state.code), path, label: state.label };
  });
  shapes = { states, neighbours: new Path2D(NEIGHBOURS), lakes: new Path2D(LAKES), all };
  return shapes;
}

/** Puts the camera on the context: from here on, draw in map units. */
function applyCamera(
  ctx: CanvasRenderingContext2D,
  camera: MapCamera,
  width: number,
  height: number,
  pixelRatio: number,
) {
  const s = camera.scale * pixelRatio;
  ctx.setTransform(
    s,
    0,
    0,
    s,
    (width / 2 - camera.x * camera.scale) * pixelRatio,
    (height / 2 - camera.y * camera.scale) * pixelRatio,
  );
}

export interface PaintOptions {
  width: number;
  height: number;
  pixelRatio: number;
  camera: MapCamera;
  palette: MapPalette;
  layers: MapLayers;
  /** Seconds, for the rig's pulse and other small motions. */
  time: number;
  reducedMotion: boolean;
}

export function paintMap(ctx: CanvasRenderingContext2D, options: PaintOptions) {
  const { width, height, pixelRatio, camera, palette, layers } = options;
  const { states, neighbours, lakes, all } = loadShapes();
  const px = 1 / camera.scale;

  ctx.save();
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.fillStyle = palette.sea;
  ctx.fillRect(0, 0, width, height);
  applyCamera(ctx, camera, width, height, pixelRatio);

  ctx.fillStyle = palette.neighbours;
  ctx.fill(neighbours);

  // A soft coastline: the land drawn once thick in the coast colour, then filled.
  ctx.lineJoin = 'round';
  ctx.strokeStyle = palette.coast;
  ctx.lineWidth = 3 * px;
  ctx.stroke(all);
  for (const state of states) {
    ctx.fillStyle = layers.zoneBands === false ? palette.land : palette.zones[state.zone];
    ctx.fill(state.path);
  }
  ctx.fillStyle = palette.lake;
  ctx.fill(lakes);
  ctx.strokeStyle = palette.coast;
  ctx.lineWidth = 0.8 * px;
  ctx.stroke(lakes);

  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 0.9 * px;
  ctx.setLineDash([3 * px, 2 * px]);
  for (const state of states) ctx.stroke(state.path);
  ctx.setLineDash([]);

  if (layers.stateNames) drawStateNames(ctx, states, palette, px, camera.scale);
  if (layers.weather) drawWeather(ctx, layers.weather.systems, layers.weather.hour, px);
  if (layers.network) drawNetwork(ctx, layers.network, palette, px);
  for (const route of layers.routes ?? []) drawRoute(ctx, route, palette, px);
  if (layers.highlight)
    drawHighlight(ctx, layers.highlight, palette, px, options.time, options.reducedMotion);
  if (layers.trail) drawTrail(ctx, layers.trail, palette, px);
  if (layers.nightAt !== undefined && layers.nightAt !== null)
    drawNight(ctx, layers.nightAt, palette);
  if (layers.towns) drawTowns(ctx, layers.towns, palette, px, camera.scale);
  for (const marker of layers.markers ?? []) drawMarker(ctx, marker, px);
  if (layers.pulse) drawPulse(ctx, layers.pulse, palette, px);
  if (layers.rig) drawRig(ctx, layers.rig, palette, px, options.time, options.reducedMotion);
  ctx.restore();
}

function drawStateNames(
  ctx: CanvasRenderingContext2D,
  states: Shapes['states'],
  palette: MapPalette,
  px: number,
  scale: number,
) {
  if (scale < 0.7) return;
  ctx.fillStyle = palette.stateText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${11 * px}px system-ui, sans-serif`;
  for (const state of states) ctx.fillText(state.code, state.label[0], state.label[1]);
}

function smoothLine(ctx: CanvasRenderingContext2D, points: readonly MapPoint[]) {
  const [first, ...rest] = points;
  if (!first) return;
  ctx.moveTo(first.x, first.y);
  if (rest.length === 0) return;
  for (let index = 0; index < rest.length - 1; index++) {
    const point = rest[index] as MapPoint;
    const next = rest[index + 1] as MapPoint;
    ctx.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
  }
  const last = rest[rest.length - 1] as MapPoint;
  ctx.lineTo(last.x, last.y);
}

function drawNetwork(
  ctx: CanvasRenderingContext2D,
  network: readonly (readonly MapPoint[])[],
  palette: MapPalette,
  px: number,
) {
  ctx.strokeStyle = palette.network;
  ctx.lineWidth = 1.6 * px;
  ctx.lineCap = 'round';
  for (const line of network) {
    ctx.beginPath();
    smoothLine(ctx, line);
    ctx.stroke();
  }
}

function drawRoute(
  ctx: CanvasRenderingContext2D,
  route: MapRoute,
  palette: MapPalette,
  px: number,
) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (route.tone === 'active') {
    ctx.strokeStyle = palette.routeCasing;
    ctx.lineWidth = 5.5 * px;
    ctx.beginPath();
    smoothLine(ctx, route.line);
    ctx.stroke();
  }
  ctx.strokeStyle = route.colour ?? (route.tone === 'active' ? palette.route : palette.option);
  ctx.lineWidth = (route.tone === 'active' ? 3 : route.tone === 'option' ? 2.4 : 1.4) * px;
  if (route.tone === 'faded') ctx.setLineDash([4 * px, 3 * px]);
  ctx.beginPath();
  smoothLine(ctx, route.line);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawHighlight(
  ctx: CanvasRenderingContext2D,
  points: readonly MapPoint[],
  palette: MapPalette,
  px: number,
  time: number,
  reducedMotion: boolean,
) {
  ctx.strokeStyle = palette.highlight;
  ctx.lineWidth = 6 * px;
  ctx.globalAlpha = reducedMotion ? 0.7 : 0.55 + 0.25 * Math.sin(time * 4);
  ctx.beginPath();
  smoothLine(ctx, points);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawTrail(
  ctx: CanvasRenderingContext2D,
  trail: readonly TrailPoint[],
  palette: MapPalette,
  px: number,
) {
  ctx.lineCap = 'round';
  ctx.lineWidth = 3.4 * px;
  for (let index = 1; index < trail.length; index++) {
    const from = trail[index - 1] as TrailPoint;
    const to = trail[index] as TrailPoint;
    ctx.strokeStyle =
      to.speed < 50 ? palette.trail[0] : to.speed <= 62 ? palette.trail[1] : palette.trail[2];
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
}

function drawTowns(
  ctx: CanvasRenderingContext2D,
  towns: readonly MapTown[],
  palette: MapPalette,
  px: number,
  scale: number,
) {
  ctx.textBaseline = 'middle';
  for (const town of towns) {
    const radius = (town.rank === 'hub' ? 3.6 : town.rank === 'line' ? 1.6 : 2.4) * px;
    ctx.fillStyle = palette.routeCasing;
    ctx.beginPath();
    ctx.arc(town.x, town.y, radius + 1.2 * px, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = palette.town;
    ctx.beginPath();
    ctx.arc(town.x, town.y, radius, 0, Math.PI * 2);
    ctx.fill();
    const showName = town.rank === 'hub' || (town.rank === 'stop' && scale > 1.6);
    if (!showName) continue;
    const size = town.rank === 'hub' ? 12 : 10.5;
    ctx.font = `${town.rank === 'hub' ? 700 : 500} ${size * px}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.lineWidth = 3 * px;
    ctx.strokeStyle = palette.routeCasing;
    ctx.strokeText(town.name, town.x + radius + 3 * px, town.y);
    ctx.fillStyle = town.rank === 'hub' ? palette.hubText : palette.townText;
    ctx.fillText(town.name, town.x + radius + 3 * px, town.y);
  }
}

const WEATHER_TINTS: Readonly<Record<WeatherSystem['kind'], string>> = {
  snow: '210, 228, 255',
  rain: '70, 130, 210',
  storm: '90, 80, 170',
  fog: '200, 200, 196',
};

function drawWeather(
  ctx: CanvasRenderingContext2D,
  systems: readonly WeatherSystem[],
  hour: number,
  px: number,
) {
  for (const system of systems) {
    const strength = systemStrength(system, hour);
    if (strength <= 0.04) continue;
    const centre = systemCentre(system, hour);
    const tint = WEATHER_TINTS[system.kind];
    for (const [ring, alpha] of [
      [1, 0.14],
      [0.72, 0.16],
      [0.42, 0.2],
    ] as const) {
      ctx.fillStyle = `rgba(${tint}, ${alpha * strength})`;
      ctx.beginPath();
      for (let step = 0; step <= 28; step++) {
        const angle = (step / 28) * Math.PI * 2;
        const point = project(
          centre.lon + Math.cos(angle) * system.rLon * ring,
          centre.lat + Math.sin(angle) * system.rLat * ring,
        );
        if (step === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      }
      ctx.fill();
    }
    const middle = project(centre.lon, centre.lat);
    drawWeatherGlyph(ctx, system.kind, middle, px, strength);
  }
}

function drawWeatherGlyph(
  ctx: CanvasRenderingContext2D,
  kind: WeatherSystem['kind'],
  at: MapPoint,
  px: number,
  strength: number,
) {
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.scale(px, px);
  ctx.globalAlpha = Math.min(1, 0.4 + strength);
  ctx.strokeStyle = kind === 'snow' ? '#5b7fae' : kind === 'fog' ? '#7c7c78' : '#2f5f9e';
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  if (kind === 'snow') {
    for (let arm = 0; arm < 3; arm++) {
      const angle = (arm * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(-Math.cos(angle) * 6, -Math.sin(angle) * 6);
      ctx.lineTo(Math.cos(angle) * 6, Math.sin(angle) * 6);
      ctx.stroke();
    }
  } else if (kind === 'fog') {
    for (const y of [-4, 0, 4]) {
      ctx.beginPath();
      ctx.moveTo(-7 + (y === 0 ? 2 : 0), y);
      ctx.lineTo(7 - (y === 0 ? 0 : 2), y);
      ctx.stroke();
    }
  } else {
    ctx.beginPath();
    ctx.arc(-4, -1, 4, Math.PI * 0.9, Math.PI * 1.9);
    ctx.arc(2, -3, 5, Math.PI * 1.1, Math.PI * 0.1);
    ctx.lineTo(-6, 3);
    ctx.closePath();
    ctx.fill();
    for (const x of [-4, 0, 4]) {
      ctx.beginPath();
      ctx.moveTo(x, 5);
      ctx.lineTo(x - 1.5, 9);
      ctx.stroke();
    }
    if (kind === 'storm') {
      ctx.strokeStyle = '#e0a400';
      ctx.beginPath();
      ctx.moveTo(1, 2);
      ctx.lineTo(-1, 6);
      ctx.lineTo(2, 6);
      ctx.lineTo(0, 10);
      ctx.stroke();
    }
  }
  ctx.restore();
}

let nightCache: { at: number; canvas: HTMLCanvasElement } | null = null;
const NIGHT_COLUMNS = 125;
const NIGHT_ROWS = 78;

/**
 * The night side, as a soft low-resolution overlay: each cell's darkness
 * comes from the sun's height there, so the terminator curves with the
 * season and twilight fades across it.
 */
function drawNight(ctx: CanvasRenderingContext2D, utcMs: number, palette: MapPalette) {
  const hourKey = Math.round(utcMs / 600_000);
  if (!nightCache || nightCache.at !== hourKey) {
    const canvas = nightCache?.canvas ?? document.createElement('canvas');
    canvas.width = NIGHT_COLUMNS;
    canvas.height = NIGHT_ROWS;
    const context = canvas.getContext('2d');
    if (!context) return;
    const image = context.createImageData(NIGHT_COLUMNS, NIGHT_ROWS);
    for (let row = 0; row < NIGHT_ROWS; row++) {
      for (let column = 0; column < NIGHT_COLUMNS; column++) {
        const [lon, lat] = unproject(
          ((column + 0.5) / NIGHT_COLUMNS) * MAP_WIDTH,
          ((row + 0.5) / NIGHT_ROWS) * MAP_HEIGHT,
        );
        const altitude = sunAltitude(lat, lon, utcMs);
        const dark = Math.max(0, Math.min(1, (2 - altitude) / 14));
        const offset = (row * NIGHT_COLUMNS + column) * 4;
        image.data[offset] = 255;
        image.data[offset + 1] = 255;
        image.data[offset + 2] = 255;
        image.data[offset + 3] = Math.round(dark * 255);
      }
    }
    context.putImageData(image, 0, 0);
    // Tint the mask with the palette's night colour.
    context.globalCompositeOperation = 'source-in';
    context.fillStyle = palette.night.replace(/[\d.]+\)$/, '1)');
    context.fillRect(0, 0, NIGHT_COLUMNS, NIGHT_ROWS);
    context.globalCompositeOperation = 'source-over';
    nightCache = { at: hourKey, canvas };
  }
  const alpha = Number(/([\d.]+)\)$/.exec(palette.night)?.[1] ?? 0.3);
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(nightCache.canvas, 0, 0, MAP_WIDTH, MAP_HEIGHT);
  ctx.globalAlpha = 1;
}

/** Map units back to degrees (the inverse of `project`). */
export function unproject(mapX: number, mapY: number): [lon: number, lat: number] {
  const RADIANS = Math.PI / 180;
  const n = (Math.sin(ALBERS.parallel1 * RADIANS) + Math.sin(ALBERS.parallel2 * RADIANS)) / 2;
  const C =
    Math.cos(ALBERS.parallel1 * RADIANS) ** 2 + 2 * n * Math.sin(ALBERS.parallel1 * RADIANS);
  const rho0 = Math.sqrt(C - 2 * n * Math.sin(ALBERS.originLat * RADIANS)) / n;
  const x = mapX / ALBERS.scale + ALBERS.minX;
  const y = ALBERS.maxY - mapY / ALBERS.scale;
  const rho = Math.hypot(x, rho0 - y);
  const theta = Math.atan2(x, rho0 - y);
  const sine = (C - rho * rho * n * n) / (2 * n);
  const lat = Math.asin(Math.max(-1, Math.min(1, sine))) / RADIANS;
  const lon = ALBERS.originLon + theta / n / RADIANS;
  return [lon, lat];
}

const MARKER_COLOURS: Readonly<Record<MarkerKind, string>> = {
  stop: '#1d8f52',
  sleep: '#5b5bd6',
  ticket: '#d62f2f',
  blowout: '#333333',
  weather: '#4f7fbf',
  toll: '#b8860b',
  scale: '#7a5c2e',
  construction: '#e07b00',
  radar: '#c2185b',
  detour: '#8e44ad',
  slide: '#795548',
  crash: '#000000',
  police: '#1e5bd6',
};

function drawMarker(ctx: CanvasRenderingContext2D, marker: MapMarker, px: number) {
  ctx.save();
  ctx.translate(marker.x, marker.y);
  ctx.scale(px, px);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = MARKER_COLOURS[marker.kind];
  ctx.beginPath();
  ctx.arc(0, 0, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.4;
  ctx.font = '700 7px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const letters: Partial<Record<MarkerKind, string>> = {
    stop: 'S',
    sleep: 'Z',
    ticket: '!',
    toll: '$',
    scale: 'W',
    radar: 'R',
    detour: 'D',
    crash: 'X',
    police: 'P',
    construction: 'C',
    slide: 'R',
    weather: '*',
    blowout: 'T',
  };
  ctx.fillText(letters[marker.kind] ?? '', 0, 0.5);
  ctx.restore();
}

function drawPulse(
  ctx: CanvasRenderingContext2D,
  pulse: NonNullable<MapLayers['pulse']>,
  palette: MapPalette,
  px: number,
) {
  const t = Math.min(1, pulse.age / 1.4);
  ctx.strokeStyle = palette.highlight;
  ctx.globalAlpha = 1 - t;
  ctx.lineWidth = 2.5 * px;
  ctx.beginPath();
  ctx.arc(pulse.point.x, pulse.point.y, (6 + 26 * t) * px, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawRig(
  ctx: CanvasRenderingContext2D,
  rig: MapPoint & { heading: number },
  palette: MapPalette,
  px: number,
  time: number,
  reducedMotion: boolean,
) {
  const glow = reducedMotion ? 0.5 : 0.5 + 0.3 * Math.sin(time * 3);
  ctx.save();
  ctx.translate(rig.x, rig.y);
  ctx.scale(px, px);
  ctx.fillStyle = palette.rig;
  ctx.globalAlpha = 0.25 * glow;
  ctx.beginPath();
  ctx.arc(0, 0, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.rotate(rig.heading);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(-6, 7);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-6, -7);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = palette.rig;
  ctx.beginPath();
  ctx.moveTo(8, 0);
  ctx.lineTo(-4.5, 5.2);
  ctx.lineTo(-2, 0);
  ctx.lineTo(-4.5, -5.2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
