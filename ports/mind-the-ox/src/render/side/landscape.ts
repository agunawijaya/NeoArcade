import { hillHeightAt, type Scenery } from '../scenery';
import type { Palette } from '../palette';
import type { SideCamera } from './camera';
import { mix, shade, withAlpha } from './colour';

const FAR_PARALLAX = 0.22;
const MIDDLE_PARALLAX = 0.36;
const MID_PARALLAX = 0.5;
/** Keeps hill lookups off the start of their arrays when the camera is near the left edge. */
const HILL_OFFSET = 2000;
/** The middle ridge reuses the far hills further along, so it never repeats them side by side. */
const MIDDLE_SHIFT = 731;
/** The near hills sink all the way under the sea's horizon, and a little more. */
const MID_SINK = 1.1;

/**
 * Where there is sea in front, the hills sink towards its horizon: how wet
 * the world is at a screen x (0 to 1), and the height they sink to. The
 * far ridge only partly, so mountains still stand beyond the water.
 */
export interface Sink {
  floor: number;
  wetness(screenX: number): number;
}

const NO_SINK: Sink = { floor: 0, wetness: () => 0 };

function sunk(height: number, screenX: number, sink: Sink, share: number): number {
  const wet = sink.wetness(screenX) * share;
  return wet <= 0 ? height : height - Math.max(0, height - sink.floor) * wet;
}

/**
 * The countryside receding behind the field: a hazy far ridge, a bluer
 * middle one, and nearer rolling hills patched with fields and hedgerows,
 * each scrolling slower than the play.
 */
export function paintHills(
  ctx: CanvasRenderingContext2D,
  camera: SideCamera,
  palette: Palette,
  scenery: Scenery,
  sink: Sink = NO_SINK,
) {
  paintRidge(
    ctx,
    camera,
    scenery.farHills,
    FAR_PARALLAX,
    0,
    6,
    palette.farHills,
    palette.haze,
    0.5,
    sink,
    0.45,
  );
  paintRidge(
    ctx,
    camera,
    scenery.farHills,
    MIDDLE_PARALLAX,
    MIDDLE_SHIFT,
    -16,
    [mix(palette.farHills[0], palette.midHills[0], 0.5), palette.farHills[1]],
    palette.haze,
    0.32,
    sink,
    0.8,
  );
  paintRidge(
    ctx,
    camera,
    scenery.midHills,
    MID_PARALLAX,
    0,
    0,
    palette.midHills,
    palette.haze,
    0.12,
    sink,
    MID_SINK,
  );
  paintPatchwork(ctx, camera, scenery.midHills, palette, sink);
  paintRidgeTrees(ctx, camera, scenery.midHills, palette, sink);
}

function ridgeHeight(
  hills: Float64Array,
  camera: SideCamera,
  screenX: number,
  parallax: number,
  shift: number,
  lift: number,
  sink: Sink,
  share: number,
) {
  const layerX =
    camera.centreX * parallax +
    (screenX - camera.viewport.width / 2) / camera.scale +
    HILL_OFFSET +
    shift;
  return sunk(hillHeightAt(hills, layerX) + lift, screenX, sink, share);
}

function paintRidge(
  ctx: CanvasRenderingContext2D,
  camera: SideCamera,
  hills: Float64Array,
  parallax: number,
  shift: number,
  lift: number,
  colours: readonly [string, string],
  haze: string,
  hazeShare: number,
  sink: Sink,
  share: number,
) {
  const { width } = camera.viewport;
  const bottom = camera.bandBottom;
  const top = camera.y(130);
  const gradient = ctx.createLinearGradient(0, top, 0, bottom);
  gradient.addColorStop(0, mix(colours[0], haze, hazeShare));
  gradient.addColorStop(1, mix(colours[1], haze, hazeShare * 0.6));
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(0, bottom);
  for (let screenX = 0; screenX <= width + 4; screenX += 4) {
    ctx.lineTo(
      screenX,
      camera.y(ridgeHeight(hills, camera, screenX, parallax, shift, lift, sink, share)),
    );
  }
  ctx.lineTo(width, bottom);
  ctx.closePath();
  ctx.fill();
}

/**
 * Fields on the near hills: bands of slightly different greens and golds
 * following the slope, divided by darker hedgerows, like a gouache of
 * northern France in summer.
 */
function paintPatchwork(
  ctx: CanvasRenderingContext2D,
  camera: SideCamera,
  hills: Float64Array,
  palette: Palette,
  sink: Sink,
) {
  const { width } = camera.viewport;
  const fieldWidth = 26;
  const startLayerX = camera.centreX * MID_PARALLAX - width / 2 / camera.scale + HILL_OFFSET;
  const first = Math.floor(startLayerX / fieldWidth) - 1;
  const last = first + Math.ceil(width / camera.scale / fieldWidth) + 3;
  const crops = [
    mix(palette.midHills[0], '#d8c06a', 0.35),
    shade(palette.midHills[0], 0.08),
    mix(palette.midHills[1], palette.soil[0], 0.25),
    palette.midHills[1],
  ];
  const screenOf = (layerX: number) => camera.parallaxX(layerX - HILL_OFFSET, MID_PARALLAX);
  const ridgeAt = (layerX: number) =>
    sunk(hillHeightAt(hills, layerX), screenOf(layerX), sink, MID_SINK);
  for (let index = first; index <= last; index++) {
    const hash = Math.abs(Math.sin(index * 33.71) * 13758.5453) % 1;
    const left = index * fieldWidth;
    const right = left + fieldWidth;
    for (const [topDrop, bottomDrop] of [
      [3, 10],
      [11, 20],
    ] as const) {
      const crop = crops[
        Math.floor(((hash * 7 + topDrop) % 1) * crops.length) % crops.length
      ] as string;
      const lit = mix(crop, palette.haze, 0.12);
      ctx.fillStyle = withAlpha(
        palette.daylight < 0.5 ? mix(lit, palette.midHills[1], 0.6) : lit,
        0.75,
      );
      ctx.beginPath();
      for (let layerX = left; layerX <= right; layerX += 3) {
        ctx.lineTo(screenOf(layerX), camera.y(ridgeAt(layerX) - topDrop));
      }
      for (let layerX = right; layerX >= left; layerX -= 3) {
        ctx.lineTo(screenOf(layerX), camera.y(ridgeAt(layerX) - bottomDrop));
      }
      ctx.closePath();
      ctx.fill();
    }
    // A hedgerow down the slope between fields.
    ctx.strokeStyle = withAlpha(mix(palette.hedge, palette.haze, 0.2), 0.8);
    ctx.lineWidth = Math.max(1, camera.scale * 0.55);
    ctx.beginPath();
    ctx.moveTo(screenOf(right), camera.y(ridgeAt(right) - 2.5));
    ctx.lineTo(screenOf(right), camera.y(ridgeAt(right) - 22));
    ctx.stroke();
  }
}

/** Little round trees and poplars along the nearer ridge, placed by position so they scroll with it. */
function paintRidgeTrees(
  ctx: CanvasRenderingContext2D,
  camera: SideCamera,
  hills: Float64Array,
  palette: Palette,
  sink: Sink,
) {
  const { width } = camera.viewport;
  const spacing = 7;
  const startLayerX = camera.centreX * MID_PARALLAX - width / 2 / camera.scale + HILL_OFFSET;
  const first = Math.floor(startLayerX / spacing);
  const last = first + Math.ceil(width / camera.scale / spacing) + 2;
  const dark = mix(palette.midHills[1], palette.foliage[2], 0.55);
  const light = mix(palette.midHills[0], palette.foliage[0], 0.45);
  for (let index = first; index <= last; index++) {
    const hash = Math.abs(Math.sin(index * 12.9898) * 43758.5453) % 1;
    if (hash > 0.5) continue;
    const layerX = index * spacing + hash * spacing;
    const screenX = camera.parallaxX(layerX - HILL_OFFSET, MID_PARALLAX);
    const drop = (hash * 37) % 1 < 0.5 ? 0.5 : 2 + ((hash * 91) % 1) * 9;
    if (sink.wetness(screenX) > 0.9) continue;
    const ground = camera.y(sunk(hillHeightAt(hills, layerX), screenX, sink, MID_SINK) - drop);
    const size = (1.3 + hash * 1.8) * camera.scale;
    ctx.fillStyle = dark;
    ctx.beginPath();
    if (hash < 0.12)
      ctx.ellipse(screenX, ground - size * 1.3, size * 0.32, size * 1.4, 0, 0, Math.PI * 2);
    else ctx.ellipse(screenX, ground - size * 0.55, size * 0.75, size * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = light;
    ctx.beginPath();
    if (hash < 0.12)
      ctx.ellipse(
        screenX - size * 0.08,
        ground - size * 1.5,
        size * 0.18,
        size * 0.9,
        0,
        0,
        Math.PI * 2,
      );
    else
      ctx.ellipse(
        screenX - size * 0.18,
        ground - size * 0.72,
        size * 0.42,
        size * 0.34,
        0,
        0,
        Math.PI * 2,
      );
    ctx.fill();
  }
}
