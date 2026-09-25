import { createPostFx, type PostFx } from '@shared/fx';
import { Camera } from './camera';
import type { Scene } from './scene';

const MAX_PIXEL_RATIO = 2;

/**
 * The canvas on screen: sizes the scene to its container, keeps offscreen
 * layers at the right resolution and runs the post-processing pass (bloom,
 * grading, vignette and the optional CRT look).
 */
export class Stage {
  readonly camera = new Camera();
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly fx: PostFx;
  private scene: Scene | null = null;
  private crt = false;
  private cssWidth = 1;
  private cssHeight = 1;

  constructor(private readonly container: HTMLElement) {
    const context = this.canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas 2D is not available.');
    this.ctx = context;
    this.fx = createPostFx(this.canvas, {
      bloom: { strength: 0.6, threshold: 0.62, radius: 1.7 },
      vignette: 0.38,
    });
    this.fx.canvas.classList.add('stage__canvas');
    this.fx.canvas.setAttribute('aria-hidden', 'true');
    container.prepend(this.fx.canvas);
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
  }

  /** The element pointer events land on. */
  get surface(): HTMLCanvasElement {
    return this.fx.canvas;
  }

  setScene(scene: Scene) {
    this.scene = scene;
    scene.resize(this.paintScale());
    this.applyGrade();
  }

  setCrt(on: boolean) {
    this.crt = on;
    this.fx.update({
      crt: on ? { curvature: 0.07, scanlines: 0.32, mask: 0.12, aberration: 0.0012 } : false,
    });
  }

  render() {
    if (!this.scene) return;
    this.scene.draw(this.ctx, this.camera);
    this.fx.render();
  }

  private resize() {
    const pixelRatio = Math.min(MAX_PIXEL_RATIO, window.devicePixelRatio || 1);
    this.cssWidth = Math.max(1, this.container.clientWidth);
    this.cssHeight = Math.max(1, this.container.clientHeight);
    this.canvas.width = Math.round(this.cssWidth * pixelRatio);
    this.canvas.height = Math.round(this.cssHeight * pixelRatio);
    this.camera.resize(this.canvas.width, this.canvas.height, pixelRatio);
    this.scene?.resize(this.paintScale());
    this.render();
  }

  /** Offscreen layers are painted a touch sharper than needed so replay push-ins stay crisp. */
  private paintScale(): number {
    return Math.min(4, this.camera.paintScale * 1.15);
  }

  private applyGrade() {
    if (!this.scene) return;
    const { grade } = this.scene.palette;
    this.fx.update({ grade: { ...grade }, crt: this.crt ? {} : false });
    this.setCrt(this.crt);
  }
}
