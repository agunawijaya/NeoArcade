import { css, litRgb, rgb, shade, type Lighting } from './colour';

/**
 * The far distance: mountains, mesas, ridges, a city. Each is an endless
 * strip worked out from seeded noise, so it never repeats and needs no
 * stored geometry; the view scrolls it slowly for parallax.
 */
export type FarKind =
  | 'mountains'
  | 'snowpeaks'
  | 'volcano'
  | 'mesas'
  | 'buttes'
  | 'cliffs'
  | 'ridges'
  | 'hills'
  | 'flat'
  | 'badlands'
  | 'skyline'
  | 'water';

export interface FarLayer {
  kind: FarKind;
  colour: string;
  /** Tallest point, as a share of the height above the horizon. */
  height: number;
  /** 0 nearest … 1 farthest: farther layers move slower and fade more. */
  depth: number;
  seed: number;
  snow?: boolean;
}

function hash(seed: number, index: number): number {
  let h = (seed * 374761393 + index * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(seed: number, u: number): number {
  const i = Math.floor(u);
  const t = u - i;
  const smooth = t * t * (3 - 2 * t);
  return hash(seed, i) * (1 - smooth) + hash(seed, i + 1) * smooth;
}

function fractal(seed: number, u: number, octaves: number): number {
  let total = 0;
  let amplitude = 1;
  let frequency = 1;
  let norm = 0;
  for (let octave = 0; octave < octaves; octave++) {
    total += valueNoise(seed + octave * 101, u * frequency) * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2.1;
  }
  return total / norm;
}

/** Height of a layer, 0–1 of its maximum, at a position along the strip in pixels. */
export function profile(layer: FarLayer, u: number): number {
  switch (layer.kind) {
    case 'mountains':
    case 'snowpeaks': {
      // Broad massifs from slow noise, sharpened into peaks by ridged detail.
      const massif = fractal(layer.seed, u / 900, 2);
      const ridged = 1 - Math.abs(fractal(layer.seed + 7, u / 240, 4) * 2 - 1);
      return Math.max(0.04, massif * 0.55 + ridged * ridged * 0.55 - 0.12);
    }
    case 'volcano': {
      const period = 2600;
      const local = ((u % period) + period) % period;
      const centre = period * 0.5;
      const cone = Math.max(0, 1 - Math.abs(local - centre) / (period * 0.32));
      return Math.max(cone * cone * 0.95 + 0.05, fractal(layer.seed, u / 300, 3) * 0.35);
    }
    case 'mesas':
    case 'buttes': {
      const n = fractal(layer.seed, u / (layer.kind === 'mesas' ? 420 : 260), 2);
      const threshold = layer.kind === 'mesas' ? 0.5 : 0.58;
      const edge = Math.max(0, Math.min(1, (n - threshold) * 18));
      return 0.12 + edge * (0.72 + valueNoise(layer.seed + 9, u / 900) * 0.25);
    }
    case 'cliffs': {
      const n = fractal(layer.seed, u / 700, 3);
      const terrace = Math.round(n * 4) / 4;
      return 0.35 + terrace * 0.6;
    }
    case 'ridges':
      return 0.3 + fractal(layer.seed, u / 520, 3) * 0.7;
    case 'hills':
      return 0.2 + fractal(layer.seed, u / 380, 2) * 0.8;
    case 'flat':
      return 0.25 + fractal(layer.seed, u / 60, 2) * 0.45;
    case 'badlands': {
      const n = fractal(layer.seed, u / 160, 3);
      return 0.15 + Math.max(0, n - 0.4) * 1.6;
    }
    case 'skyline':
    case 'water':
      return 0;
  }
}

export interface FarFrame {
  width: number;
  horizon: number;
  /** Pixels of world scrolled so far. */
  scroll: number;
  light: Lighting;
  night: number;
  /** 0–1 how strongly to draw (when one landscape gives way to the next). */
  alpha: number;
}

export function paintFarLayer(ctx: CanvasRenderingContext2D, layer: FarLayer, frame: FarFrame) {
  const { width, horizon, light } = frame;
  const u0 = frame.scroll * (0.08 * (1 - layer.depth) + 0.012);
  const top = horizon * layer.height;
  const colour = litRgb(layer.colour, light, 0.35 + layer.depth * 0.55);
  ctx.globalAlpha = frame.alpha;
  if (layer.kind === 'skyline') {
    paintSkyline(ctx, layer, frame, u0, colour);
  } else if (layer.kind === 'water') {
    ctx.fillStyle = css(colour);
    ctx.fillRect(0, horizon - horizon * 0.03, width, horizon * 0.03 + 2);
  } else {
    const shape = new Path2D();
    shape.moveTo(0, horizon + 1);
    const step = layer.kind === 'mesas' || layer.kind === 'buttes' ? 3 : 5;
    for (let x = 0; x <= width + step; x += step) {
      shape.lineTo(x, horizon - profile(layer, u0 + x) * top);
    }
    shape.lineTo(width + step, horizon + 1);
    shape.closePath();
    // Lighter towards the foot, where more air lies between the eye and the rock.
    const haze = litRgb(layer.colour, light, 0.65 + layer.depth * 0.35);
    const fill = ctx.createLinearGradient(0, horizon - top, 0, horizon);
    fill.addColorStop(0, css(colour));
    fill.addColorStop(1, css(haze));
    ctx.fillStyle = fill;
    ctx.fill(shape);
    if (layer.kind === 'mesas' || layer.kind === 'cliffs') paintStrata(ctx, layer, frame, u0, top);
    if (layer.snow || layer.kind === 'snowpeaks') paintSnowcaps(ctx, shape, layer, frame, u0, top);
  }
  ctx.globalAlpha = 1;
}

function paintStrata(
  ctx: CanvasRenderingContext2D,
  layer: FarLayer,
  frame: FarFrame,
  u0: number,
  top: number,
) {
  ctx.fillStyle = `rgba(255, 235, 210, ${0.12 * frame.light.day})`;
  for (let x = 0; x <= frame.width; x += 3) {
    const height = profile(layer, u0 + x) * top;
    if (height < top * 0.3) continue;
    ctx.fillRect(x, frame.horizon - height * 0.62, 3, height * 0.08);
    ctx.fillRect(x, frame.horizon - height * 0.35, 3, height * 0.05);
  }
}

function paintSnowcaps(
  ctx: CanvasRenderingContext2D,
  shape: Path2D,
  layer: FarLayer,
  frame: FarFrame,
  u0: number,
  top: number,
) {
  const line = layer.kind === 'volcano' ? 0.6 : layer.kind === 'snowpeaks' ? 0.5 : 0.66;
  ctx.save();
  ctx.clip(shape);
  ctx.fillStyle = css(litRgb('#f3f6fb', frame.light, 0.25 + layer.depth * 0.45));
  ctx.beginPath();
  ctx.moveTo(0, 0);
  for (let x = 0; x <= frame.width + 8; x += 8) {
    // A ragged snowline: lower in the gullies, higher on the ridges.
    const wobble = (valueNoise(layer.seed + 31, (u0 + x) / 40) - 0.5) * 0.12;
    ctx.lineTo(x, frame.horizon - (line + wobble) * top);
  }
  ctx.lineTo(frame.width + 8, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function paintSkyline(
  ctx: CanvasRenderingContext2D,
  layer: FarLayer,
  frame: FarFrame,
  u0: number,
  colour: readonly [number, number, number],
) {
  const { horizon, width } = frame;
  const block = 22;
  const first = Math.floor(u0 / block) - 1;
  const face = css(colour);
  const lit = css(litRgb(shade(rgb(layer.colour), 0.22), frame.light, 0.35 + layer.depth * 0.55));
  for (let index = first; index * block - u0 < width + block; index++) {
    // Gaps between the blocks, so it reads as a town and not a wall.
    if (hash(layer.seed + 7, index) > 0.78) continue;
    const x = index * block - u0;
    const tall = hash(layer.seed, index);
    const height = horizon * layer.height * (0.2 + tall * tall * 0.8);
    const w = block * (0.7 + hash(layer.seed + 3, index) * 0.6);
    ctx.fillStyle = face;
    ctx.fillRect(x, horizon - height, w, height + 1);
    if (tall > 0.85)
      ctx.fillRect(x + w * 0.45, horizon - height - height * 0.15, w * 0.08, height * 0.15);
    // The sunny side of each block.
    ctx.fillStyle = lit;
    ctx.fillRect(x, horizon - height, Math.max(2, w * 0.28), height + 1);
    if (frame.night > 0.3) {
      ctx.fillStyle = `rgba(255, 214, 140, ${0.55 * frame.night})`;
      for (let row = 6; row < height - 4; row += 7) {
        for (let column = 3; column < w - 3; column += 5) {
          if (hash(layer.seed + row, index * 31 + column) > 0.62)
            ctx.fillRect(x + column, horizon - height + row, 2, 2);
        }
      }
    }
  }
}
