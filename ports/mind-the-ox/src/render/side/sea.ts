import type { WaterSpan } from '../../engine/map';
import type { World } from '../../engine/world';
import type { Palette } from '../palette';
import type { SideCamera } from './camera';
import type { Sink } from './landscape';
import { mix, shade, withAlpha } from './colour';

/**
 * The sea from the side, as a cut-away like the land's: the open water
 * running back to a horizon behind the line of play, and below the line
 * the sea in section, light near the surface and dark below, down to a
 * sandy bed that rises to meet the beaches. The swell along the surface is
 * only for the eye; the engine keeps the sea flat.
 */

/** The sea's horizon stands this far over its level, in world units. */
const HORIZON_RISE = 26;
/** Over this much land the open sea behind fades into the coast. */
const COAST_FADE = 220;
/** The swell's height on screen for each sea state, world units, and its length. */
const SWELL_HEIGHT = [0.45, 1.1, 2.1] as const;
const SWELL_LENGTH = 46;
/** The bed slopes down from a beach at this rate, to at most this depth. */
const BED_SLOPE = 0.16;
const BED_DEPTH = 26;
const STEP_PX = 4;

export function seaSpans(world: World): readonly WaterSpan[] {
  return world.map.sea?.spans ?? [];
}

/** 1 over open water, easing to 0 over the land near a coast. */
function wetness(world: World, x: number): number {
  let wettest = 0;
  for (const span of seaSpans(world)) {
    if (x >= span.left && x <= span.right) return 1;
    const away = x < span.left ? span.left - x : x - span.right;
    wettest = Math.max(wettest, 1 - away / COAST_FADE);
  }
  return Math.max(0, wettest);
}

/** The swell's height at x, for drawing the surface; the same everywhere for the same moment. */
export function swellAt(world: World, x: number, time: number): number {
  const height = SWELL_HEIGHT[world.rules.seaState];
  return (
    height * (Math.sin(x / SWELL_LENGTH + time * 0.9) * 0.65 + Math.sin(x / 17 - time * 1.7) * 0.35)
  );
}

/** How deep the bed lies under x: shallow by the beaches, sloping down to the open sea. */
export function bedDepth(span: WaterSpan, x: number): number {
  const fromLeft = span.shores[0] === 'beach' ? x - span.left : BED_DEPTH / BED_SLOPE;
  const fromRight = span.shores[1] === 'beach' ? span.right - x : BED_DEPTH / BED_SLOPE;
  return Math.min(BED_DEPTH, 1.5 + Math.min(fromLeft, fromRight) * BED_SLOPE);
}

/** How the hills behind sink towards the sea's horizon wherever there is sea in front. */
export function hillSink(world: World, camera: SideCamera): Sink | undefined {
  const sea = world.map.sea;
  if (!sea) return undefined;
  return {
    floor: sea.level + HORIZON_RISE - 6,
    wetness: (screenX) => smooth(wetness(world, camera.worldX(screenX))),
  };
}

/** Keeps what follows (the land's cut-away and its scenery) off the sea. */
export function clipToLand(ctx: CanvasRenderingContext2D, camera: SideCamera, world: World) {
  const spans = visibleSpans(world, camera);
  if (spans.length === 0) return;
  const { width, height } = camera.viewport;
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  for (const span of spans) {
    const left = camera.x(span.left);
    ctx.rect(left, 0, camera.x(span.right) - left, height);
  }
  ctx.clip('evenodd');
}

/**
 * Behind the line of play, where there is sea: the open water from the
 * horizon down to the line, pale and hazy far off, deeper near, with the
 * sun's path of sparkles and the slow lines of the swell.
 */
export function paintSeaBackdrop(
  ctx: CanvasRenderingContext2D,
  camera: SideCamera,
  palette: Palette,
  world: World,
  time: number,
) {
  const sea = world.map.sea;
  if (!sea) return;
  const { width } = camera.viewport;
  const lineY = camera.y(sea.level);
  const horizonY = camera.y(sea.level + HORIZON_RISE);
  const tops: number[] = [];
  for (let sx = 0; sx <= width + STEP_PX; sx += STEP_PX) {
    const wet = wetness(world, camera.worldX(sx));
    tops.push(lineY + (horizonY - lineY) * smooth(wet));
  }
  if (tops.every((top) => top >= lineY - 0.5)) return;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, lineY + 2);
  tops.forEach((top, index) => ctx.lineTo(index * STEP_PX, top));
  ctx.lineTo(width + STEP_PX, lineY + 2);
  ctx.closePath();
  const water = ctx.createLinearGradient(0, horizonY, 0, lineY);
  water.addColorStop(0, mix(palette.sea.far, palette.haze, 0.25));
  water.addColorStop(0.35, palette.sea.far);
  water.addColorStop(1, palette.sea.near);
  ctx.fillStyle = water;
  ctx.fill();
  ctx.clip();

  // The horizon: a thin bright line where sea meets sky.
  ctx.strokeStyle = withAlpha(mix(palette.sea.far, palette.sea.glint, 0.5), 0.6);
  ctx.lineWidth = Math.max(1, camera.scale * 0.3);
  ctx.beginPath();
  ctx.moveTo(0, horizonY + 0.5);
  ctx.lineTo(width, horizonY + 0.5);
  ctx.stroke();

  paintSwellLines(ctx, camera, palette, horizonY, lineY, time);
  paintSunPath(ctx, camera, palette, horizonY, lineY, time);
  ctx.restore();
}

/** Lines of swell on the open water, finer and closer together towards the horizon. */
function paintSwellLines(
  ctx: CanvasRenderingContext2D,
  camera: SideCamera,
  palette: Palette,
  horizonY: number,
  lineY: number,
  time: number,
) {
  const { width } = camera.viewport;
  const rows = 14;
  for (let row = 1; row <= rows; row++) {
    const depth = row / rows;
    // Perspective: rows bunch up towards the horizon.
    const y = horizonY + (lineY - horizonY) * depth * depth;
    const length = camera.scale * (3 + depth * 12);
    const gap = length * 2.6;
    const drift = (time * (4 + depth * 10) + row * 37) % gap;
    ctx.strokeStyle = withAlpha(
      row % 3 === 0 ? palette.sea.foam : shade(palette.sea.near, -0.18),
      0.08 + depth * 0.18,
    );
    ctx.lineWidth = Math.max(0.6, camera.scale * (0.12 + depth * 0.3));
    ctx.beginPath();
    for (
      let x = -gap + drift - ((camera.left * camera.scale * depth * 0.6) % gap);
      x < width;
      x += gap
    ) {
      const wobble = Math.sin(x * 0.013 + row) * length * 0.3;
      ctx.moveTo(x + wobble, y);
      ctx.lineTo(x + wobble + length, y);
    }
    ctx.stroke();
  }
}

/** The sun's (or moon's) reflection: a column of glints under it, twinkling. */
function paintSunPath(
  ctx: CanvasRenderingContext2D,
  camera: SideCamera,
  palette: Palette,
  horizonY: number,
  lineY: number,
  time: number,
) {
  const centre = camera.viewport.width * palette.sun.x;
  const strength = palette.sun.moon ? 0.55 : 0.75;
  ctx.fillStyle = withAlpha(palette.sea.glint, strength);
  for (let index = 0; index < 90; index++) {
    const hash = Math.abs(Math.sin(index * 12.9898) * 43758.5453) % 1;
    const depth = (index + 0.5) / 90;
    const y = horizonY + (lineY - horizonY) * depth;
    const spread = camera.scale * (4 + depth * 46);
    const x = centre + (hash - 0.5) * 2 * spread;
    const twinkle = Math.sin(time * (2 + hash * 3) + index) * 0.5 + 0.5;
    if (twinkle < 0.35) continue;
    const size = camera.scale * (0.25 + depth * 1.6) * twinkle;
    ctx.globalAlpha = 0.25 + twinkle * 0.6;
    ctx.fillRect(x - size, y, size * 2, Math.max(0.6, size * 0.28));
  }
  ctx.globalAlpha = 1;
}

/**
 * The sea in section, below the line of play: lit water under the surface
 * darkening with depth, shafts of light (by day), and the bed with its
 * sand, rocks and weed. It is drawn over the land's cut-away wherever there
 * is water, and before the ships, whose hulls sit in it.
 */
export function paintSeaSection(
  ctx: CanvasRenderingContext2D,
  camera: SideCamera,
  palette: Palette,
  world: World,
  time: number,
) {
  const sea = world.map.sea;
  if (!sea) return;
  const bottom = camera.viewport.height;
  for (const span of visibleSpans(world, camera)) {
    const columns = spanColumns(camera, span);
    if (columns.length < 2) continue;
    ctx.save();
    ctx.beginPath();
    columns.forEach(({ sx, x }, index) => {
      const y = camera.y(sea.level + swellAt(world, x, time));
      if (index === 0) ctx.moveTo(sx, y);
      else ctx.lineTo(sx, y);
    });
    const last = columns[columns.length - 1] as { sx: number };
    const first = columns[0] as { sx: number };
    ctx.lineTo(last.sx, bottom);
    ctx.lineTo(first.sx, bottom);
    ctx.closePath();
    const water = ctx.createLinearGradient(0, camera.y(sea.level), 0, camera.y(sea.level - 18));
    water.addColorStop(0, palette.sea.shallow);
    water.addColorStop(1, palette.sea.deep);
    ctx.fillStyle = water;
    ctx.fill();
    ctx.clip();
    if (palette.daylight > 0.5) paintLightShafts(ctx, camera, palette, sea.level, time);
    paintBed(ctx, camera, palette, span, columns, sea.level);
    ctx.restore();
  }
}

function visibleSpans(world: World, camera: SideCamera): WaterSpan[] {
  return seaSpans(world).filter(
    (span) => span.right >= camera.worldX(-20) && span.left <= camera.right + 20,
  );
}

function spanColumns(camera: SideCamera, span: WaterSpan): { sx: number; x: number }[] {
  const columns: { sx: number; x: number }[] = [];
  const from = Math.max(-STEP_PX, camera.x(span.left));
  const to = Math.min(camera.viewport.width + STEP_PX, camera.x(span.right));
  for (let sx = from; sx < to; sx += STEP_PX) columns.push({ sx, x: camera.worldX(sx) });
  columns.push({ sx: to, x: camera.worldX(to) });
  return columns;
}

function paintLightShafts(
  ctx: CanvasRenderingContext2D,
  camera: SideCamera,
  palette: Palette,
  level: number,
  time: number,
) {
  const top = camera.y(level);
  const depth = camera.scale * 18;
  for (let index = 0; index < 7; index++) {
    const drift = (time * 6 + index * 211) % (camera.viewport.width + 200);
    const x = drift - 100 - ((camera.left * camera.scale * 0.2) % 200);
    const shaft = ctx.createLinearGradient(0, top, 0, top + depth);
    shaft.addColorStop(0, withAlpha(palette.sea.glint, 0.16));
    shaft.addColorStop(1, withAlpha(palette.sea.glint, 0));
    ctx.fillStyle = shaft;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x + camera.scale * 5, top);
    ctx.lineTo(x + camera.scale * 11, top + depth);
    ctx.lineTo(x + camera.scale * 3, top + depth);
    ctx.closePath();
    ctx.fill();
  }
}

/** The sandy bed, rising to the beaches, strewn with rocks and swaying weed. */
function paintBed(
  ctx: CanvasRenderingContext2D,
  camera: SideCamera,
  palette: Palette,
  span: WaterSpan,
  columns: { sx: number; x: number }[],
  level: number,
) {
  const bottom = camera.viewport.height;
  const bedY = (x: number) =>
    camera.y(level - bedDepth(span, x) + Math.sin(x * 0.07) * 0.8 + Math.sin(x * 0.23) * 0.4);
  const sand = ctx.createLinearGradient(0, camera.y(level - 4), 0, bottom);
  sand.addColorStop(0, mix(palette.sea.bed, palette.sea.shallow, 0.25));
  sand.addColorStop(1, mix(palette.sea.bed, palette.sea.deep, 0.6));
  ctx.fillStyle = sand;
  ctx.beginPath();
  columns.forEach(({ sx, x }, index) => {
    if (index === 0) ctx.moveTo(sx, bedY(x));
    else ctx.lineTo(sx, bedY(x));
  });
  const last = columns[columns.length - 1] as { sx: number };
  const first = columns[0] as { sx: number };
  ctx.lineTo(last.sx, bottom);
  ctx.lineTo(first.sx, bottom);
  ctx.closePath();
  ctx.fill();

  // Rocks and weed, fixed to the world.
  const start = Math.floor(Math.max(span.left, camera.worldX(0)) / 7);
  const end = Math.ceil(Math.min(span.right, camera.right) / 7);
  for (let index = start; index <= end; index++) {
    const hash = Math.abs(Math.sin(index * 78.233) * 43758.5453) % 1;
    if (hash > 0.22) continue;
    const x = index * 7 + hash * 7;
    const y = bedY(x);
    if (hash < 0.1) {
      ctx.fillStyle = withAlpha(shade(palette.sea.bed, -0.35), 0.7);
      ctx.beginPath();
      ctx.ellipse(
        camera.x(x),
        y,
        camera.scale * (0.8 + hash * 8),
        camera.scale * (0.5 + hash * 4),
        0,
        Math.PI,
        0,
      );
      ctx.fill();
    } else {
      ctx.strokeStyle = withAlpha(mix(palette.grass[2], palette.sea.deep, 0.4), 0.55);
      ctx.lineWidth = Math.max(1, camera.scale * 0.35);
      ctx.beginPath();
      ctx.moveTo(camera.x(x), y);
      ctx.quadraticCurveTo(
        camera.x(x + 1.5),
        y - camera.scale * 2.5,
        camera.x(x + (hash - 0.15) * 20),
        y - camera.scale * (3 + hash * 14),
      );
      ctx.stroke();
    }
  }
}

/**
 * Over everything below the line (the hulls and torpedoes in the water):
 * a veil of sea, so what is under the surface looks under it; then the
 * surface itself, its swell edged with foam, and the surf on the beaches.
 */
export function paintSeaSurface(
  ctx: CanvasRenderingContext2D,
  camera: SideCamera,
  palette: Palette,
  world: World,
  time: number,
) {
  const sea = world.map.sea;
  if (!sea) return;
  const bottom = camera.viewport.height;
  for (const span of visibleSpans(world, camera)) {
    const columns = spanColumns(camera, span);
    if (columns.length < 2) continue;
    const surface = columns.map(({ sx, x }) => ({
      sx,
      y: camera.y(sea.level + swellAt(world, x, time)),
    }));
    const last = columns[columns.length - 1] as { sx: number };
    const first = columns[0] as { sx: number };

    ctx.beginPath();
    surface.forEach(({ sx, y }, index) => (index === 0 ? ctx.moveTo(sx, y) : ctx.lineTo(sx, y)));
    ctx.lineTo(last.sx, bottom);
    ctx.lineTo(first.sx, bottom);
    ctx.closePath();
    const veil = ctx.createLinearGradient(0, camera.y(sea.level), 0, camera.y(sea.level - 14));
    veil.addColorStop(0, withAlpha(palette.sea.shallow, 0.42));
    veil.addColorStop(1, withAlpha(palette.sea.deep, 0.62));
    ctx.fillStyle = veil;
    ctx.fill();

    // The surface: a lit edge, then broken foam along the crests.
    ctx.strokeStyle = withAlpha(mix(palette.sea.near, palette.sea.glint, 0.45), 0.9);
    ctx.lineWidth = Math.max(1, camera.scale * 0.45);
    ctx.beginPath();
    surface.forEach(({ sx, y }, index) => (index === 0 ? ctx.moveTo(sx, y) : ctx.lineTo(sx, y)));
    ctx.stroke();
    ctx.strokeStyle = withAlpha(palette.sea.foam, 0.65);
    ctx.lineWidth = Math.max(1, camera.scale * 0.3);
    ctx.beginPath();
    columns.forEach(({ x }, index) => {
      const crest = swellAt(world, x, time) > SWELL_HEIGHT[world.rules.seaState] * 0.35;
      const point = surface[index] as { sx: number; y: number };
      if (crest) ctx.lineTo(point.sx, point.y - camera.scale * 0.2);
      else ctx.moveTo(point.sx, point.y);
    });
    ctx.stroke();
    paintSurf(ctx, camera, palette, span, sea.level, time);
  }
}

/** Surf running up a beach and drawing back. */
function paintSurf(
  ctx: CanvasRenderingContext2D,
  camera: SideCamera,
  palette: Palette,
  span: WaterSpan,
  level: number,
  time: number,
) {
  const edges = [
    { x: span.left, out: -1, shore: span.shores[0] },
    { x: span.right, out: 1, shore: span.shores[1] },
  ];
  for (const { x, out, shore } of edges) {
    const reach = shore === 'beach' ? 6 + Math.sin(time * 1.3 + x) * 3 : 1.5;
    const left = Math.min(x, x + out * reach) - (shore === 'beach' ? 4 : 2);
    const right = Math.max(x, x + out * reach) + (shore === 'beach' ? 4 : 2);
    ctx.fillStyle = withAlpha(palette.sea.foam, shore === 'beach' ? 0.75 : 0.9);
    ctx.beginPath();
    ctx.ellipse(
      camera.x((left + right) / 2),
      camera.y(level + 0.4),
      ((right - left) / 2) * camera.scale,
      camera.scale * (shore === 'beach' ? 0.7 : 1.4 + Math.sin(time * 2.2 + x) * 0.6),
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}

function smooth(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}
