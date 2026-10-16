import type { Camera } from './camera';
import type { Vec3 } from './geometry';
import type { Environment } from './light';
import { centreOf, drawPart, drawParts, type Part } from './parts';

/**
 * A vehicle seen from a camera that stays put, drawn every frame without
 * redrawing every panel: the body is painted once into a few bitmaps and
 * reused until the light, the size or the vehicle itself changes; only the
 * wheels, which turn, are drawn live between them. The body can ride up and
 * down on its springs by shifting the bitmaps.
 *
 * The bitmaps are layered by depth, so a wheel tucked under a fender is
 * drawn between the chassis behind it and the fender in front of it.
 */
type Step = { kind: 'layer'; index: number } | { kind: 'wheel'; index: number };

export interface SpriteFrame {
  /** Changes whenever the body would look different apart from the light. */
  shape: string;
  /** The light, bucketed: a change here repaints at most a few times a second. */
  light: string;
  camera: Camera;
  env: Environment;
  /** The box the vehicle fills in the world, to size the bitmaps. */
  min: Vec3;
  max: Vec3;
  body: () => Part[];
  /** This frame's wheels, in the same order every frame. */
  wheels: readonly Part[];
  /** Pixels the body rides above where it was painted (springs, bumps). */
  lift: number;
  /** Keep the bitmaps inside this rectangle: a mirror's glass, say. */
  within?: { x: number; y: number; width: number; height: number };
}

/**
 * The light moves slowly: a repaint for it can wait a second, and only one
 * vehicle repaints for it in any frame, so the work never piles up.
 */
const LIGHT_REPAINT_SECONDS = 1;
const FRAME_SECONDS = 0.012;
let lastRelight = -Infinity;

/**
 * Whether a picture last painted at `paintedAt` (seconds) may be repainted
 * for a change of light now; claims this frame's repaint when it may.
 */
export function mayRelight(paintedAt: number, now = performance.now() / 1000): boolean {
  if (now - paintedAt < LIGHT_REPAINT_SECONDS || now - lastRelight < FRAME_SECONDS) return false;
  lastRelight = now;
  return true;
}

export class VehicleSprite {
  private steps: Step[] = [];
  private layers: HTMLCanvasElement[] = [];
  private shape = '';
  private light = '';
  private paintedAt = -Infinity;
  private bounds = { x: 0, y: 0, width: 0, height: 0 };
  private pixelRatio = 1;

  draw(ctx: CanvasRenderingContext2D, frame: SpriteFrame) {
    // Rounded, so a picture drawn a hair larger or smaller is not repainted for it.
    const pixelRatio = Math.round((ctx.getTransform().a || 1) * 4) / 4 || 1;
    const now = performance.now() / 1000;
    const reshaped = frame.shape !== this.shape || pixelRatio !== this.pixelRatio;
    const relit = frame.light !== this.light && mayRelight(this.paintedAt, now);
    if (reshaped || relit) this.paint(frame, pixelRatio, now);
    for (const step of this.steps) {
      if (step.kind === 'wheel') {
        const wheel = frame.wheels[step.index];
        if (wheel) drawPart(ctx, wheel, frame.camera, frame.env);
        continue;
      }
      const layer = this.layers[step.index];
      if (!layer) continue;
      const { x, y, width, height } = this.bounds;
      ctx.drawImage(layer, x, y - frame.lift, width, height);
    }
  }

  private paint(frame: SpriteFrame, pixelRatio: number, now: number) {
    this.shape = frame.shape;
    this.light = frame.light;
    this.paintedAt = now;
    this.pixelRatio = pixelRatio;
    this.bounds = screenBounds(frame.camera, frame.min, frame.max);
    if (frame.within) this.bounds = intersect(this.bounds, frame.within);
    const body = frame.body();
    // Sort body and wheels together, then cut the body into runs between wheels.
    const entries = [
      ...body.map((part) => ({ part, wheel: -1 })),
      ...frame.wheels.map((part, index) => ({ part, wheel: index })),
    ]
      .map((entry) => ({
        ...entry,
        depth: frame.camera.project(centreOf(entry.part)).depth + (entry.part.bias ?? 0),
      }))
      .sort((a, b) => a.depth - b.depth);
    const runs: Part[][] = [];
    this.steps = [];
    let run: Part[] = [];
    for (const entry of entries) {
      if (entry.wheel < 0) {
        run.push(entry.part);
        continue;
      }
      if (run.length) {
        this.steps.push({ kind: 'layer', index: runs.length });
        runs.push(run);
        run = [];
      }
      this.steps.push({ kind: 'wheel', index: entry.wheel });
    }
    if (run.length) {
      this.steps.push({ kind: 'layer', index: runs.length });
      runs.push(run);
    }
    const { x, y, width, height } = this.bounds;
    this.layers = runs.map((parts, index) => {
      const canvas = this.layers[index] ?? document.createElement('canvas');
      const pixelsWide = Math.max(1, Math.ceil(width * pixelRatio));
      const pixelsHigh = Math.max(1, Math.ceil(height * pixelRatio));
      // Resizing a canvas reallocates it; a repaint of the same size only clears it.
      if (canvas.width !== pixelsWide || canvas.height !== pixelsHigh) {
        canvas.width = pixelsWide;
        canvas.height = pixelsHigh;
      }
      const layer = canvas.getContext('2d');
      if (layer) {
        layer.setTransform(1, 0, 0, 1, 0, 0);
        layer.clearRect(0, 0, pixelsWide, pixelsHigh);
        layer.setTransform(pixelRatio, 0, 0, pixelRatio, -x * pixelRatio, -y * pixelRatio);
        drawParts(layer, parts, frame.camera, frame.env);
      }
      return canvas;
    });
  }
}

function intersect(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  const x = Math.max(a.x, Math.floor(b.x));
  const y = Math.max(a.y, Math.floor(b.y));
  const right = Math.min(a.x + a.width, Math.ceil(b.x + b.width));
  const bottom = Math.min(a.y + a.height, Math.ceil(b.y + b.height));
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
}

/** The screen rectangle a world box lands in, with room for aerials and lean. */
export function screenBounds(camera: Camera, min: Vec3, max: Vec3) {
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  for (const x of [min[0], max[0]])
    for (const y of [min[1], max[1]])
      for (const z of [min[2], max[2]]) {
        const point = camera.project([x, y, z]);
        left = Math.min(left, point.x);
        right = Math.max(right, point.x);
        top = Math.min(top, point.y);
        bottom = Math.max(bottom, point.y);
      }
  const margin = 6;
  return {
    x: Math.floor(left - margin),
    y: Math.floor(top - margin),
    width: Math.ceil(right - left + margin * 2),
    height: Math.ceil(bottom - top + margin * 2),
  };
}
