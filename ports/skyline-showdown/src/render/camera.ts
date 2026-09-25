import { WORLD_HEIGHT, WORLD_WIDTH } from '../engine/constants';
import type { Point } from '../engine/geometry';
import type { VisibleArea } from './backdrop';

const CENTRE: Point = { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };

/**
 * Fits the 640 × 350 playfield to any screen, street at the bottom and extra
 * room going to the sky, then adds the cinematic touches: a gentle follow of
 * the banana, a push-in for replays and the occasional shake.
 */
export class Camera {
  /** Canvas size in device pixels and pixels per CSS pixel. */
  private width = 1;
  private height = 1;
  private pixelRatio = 1;
  private baseScale = 1;
  private origin: Point = { x: 0, y: 0 };

  private focus: Point = { ...CENTRE };
  private zoom = 1;
  private targetFocus: Point = { ...CENTRE };
  private targetZoom = 1;
  private easing = 3;
  private shakeLeft = 0;
  private shakeStrength = 0;
  private shakeOffset: Point = { x: 0, y: 0 };
  reducedMotion = false;

  resize(width: number, height: number, pixelRatio: number) {
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    this.baseScale = Math.min(width / WORLD_WIDTH, height / WORLD_HEIGHT);
    this.origin = {
      x: (width - WORLD_WIDTH * this.baseScale) / 2,
      y: height - WORLD_HEIGHT * this.baseScale,
    };
  }

  /** Device pixels per world unit at zoom 1; what offscreen layers are painted at. */
  get paintScale(): number {
    return this.baseScale;
  }

  rest(immediately = false) {
    this.aim(CENTRE, 1, 2.5, immediately);
  }

  /** Leans a little towards a point of interest. */
  follow(point: Point, strength = 0.18, zoom = 1.05) {
    if (this.reducedMotion) return;
    this.aim(
      {
        x: CENTRE.x + (point.x - CENTRE.x) * strength,
        y: CENTRE.y + (Math.max(-80, point.y) - CENTRE.y) * strength,
      },
      zoom,
      2.2,
    );
  }

  pushIn(point: Point, zoom: number) {
    if (this.reducedMotion) return;
    this.aim(point, zoom, 1.6);
  }

  aim(focus: Point, zoom: number, easing: number, immediately = false) {
    this.targetFocus = { ...focus };
    this.targetZoom = zoom;
    this.easing = easing;
    if (immediately) {
      this.focus = { ...focus };
      this.zoom = zoom;
    }
  }

  shake(seconds: number, strength: number) {
    if (this.reducedMotion) return;
    this.shakeLeft = Math.max(this.shakeLeft, seconds);
    this.shakeStrength = Math.max(this.shakeStrength, strength);
  }

  update(delta: number) {
    const ease = 1 - Math.exp(-delta * this.easing);
    this.focus.x += (this.targetFocus.x - this.focus.x) * ease;
    this.focus.y += (this.targetFocus.y - this.focus.y) * ease;
    this.zoom += (this.targetZoom - this.zoom) * ease;

    this.shakeLeft = Math.max(0, this.shakeLeft - delta);
    if (this.shakeLeft > 0) {
      const amount = this.shakeStrength * Math.min(1, this.shakeLeft * 3);
      this.shakeOffset = { x: (Math.random() - 0.5) * amount, y: (Math.random() - 0.5) * amount };
    } else {
      this.shakeStrength = 0;
      this.shakeOffset = { x: 0, y: 0 };
    }
  }

  /** Device pixels per world unit right now. */
  get scale(): number {
    return this.baseScale * this.zoom;
  }

  /** Where world (0, 0) lands on the canvas, in device pixels. */
  get translation(): Point {
    const anchored = {
      x: this.focus.x * this.baseScale + this.origin.x,
      y: this.focus.y * this.baseScale + this.origin.y,
    };
    return {
      x: anchored.x - this.focus.x * this.scale + this.shakeOffset.x * this.baseScale,
      y: anchored.y - this.focus.y * this.scale + this.shakeOffset.y * this.baseScale,
    };
  }

  /** How far the view has panned from the middle, for parallax. */
  get panX(): number {
    return this.focus.x - CENTRE.x;
  }

  apply(ctx: CanvasRenderingContext2D) {
    const { x, y } = this.translation;
    ctx.setTransform(this.scale, 0, 0, this.scale, x, y);
  }

  visibleArea(): VisibleArea {
    const { x, y } = this.translation;
    return {
      left: -x / this.scale,
      top: -y / this.scale,
      right: (this.width - x) / this.scale,
      bottom: (this.height - y) / this.scale,
    };
  }

  /** A world point in CSS pixels, for placing DOM labels over the scene. */
  toScreen(point: Point): Point {
    const { x, y } = this.translation;
    return {
      x: (point.x * this.scale + x) / this.pixelRatio,
      y: (point.y * this.scale + y) / this.pixelRatio,
    };
  }

  /** A CSS-pixel point on the canvas back in world units, for pointer aiming. */
  toWorld(point: Point): Point {
    const { x, y } = this.translation;
    return {
      x: (point.x * this.pixelRatio - x) / this.scale,
      y: (point.y * this.pixelRatio - y) / this.scale,
    };
  }
}
