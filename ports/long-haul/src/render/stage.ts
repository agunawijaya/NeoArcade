import { createPostFx, type PostFx } from '@shared/fx';

/**
 * The driving canvas: kept at device resolution, drawn by whichever view is
 * active, then given a light bloom (headlights and neon at night) and a
 * soft vignette by `@shared/fx`.
 */
const MAX_PIXEL_RATIO = 2;

export class Stage {
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly fx: PostFx;
  private pixelRatio = 1;
  width = 1;
  height = 1;
  private night = -1;

  constructor(private readonly container: HTMLElement) {
    const context = this.canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas 2D is not available.');
    this.ctx = context;
    this.fx = createPostFx(this.canvas, {
      bloom: { strength: 0.3, threshold: 0.8, radius: 1.5 },
      vignette: 0.22,
    });
    this.fx.canvas.classList.add('stage__canvas');
    this.fx.canvas.setAttribute('aria-hidden', 'true');
    container.prepend(this.fx.canvas);
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
  }

  get surface(): HTMLCanvasElement {
    return this.fx.canvas;
  }

  /** More glow at night, when there are lamps worth glowing. */
  setNight(night: number) {
    const rounded = Math.round(night * 10) / 10;
    if (rounded === this.night) return;
    this.night = rounded;
    this.fx.update({ bloom: { strength: 0.18 + rounded * 0.5, threshold: 0.82 - rounded * 0.18 } });
  }

  paint(draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void) {
    this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    draw(this.ctx, this.width, this.height);
    this.fx.render();
  }

  private resize() {
    this.pixelRatio = Math.min(MAX_PIXEL_RATIO, window.devicePixelRatio || 1);
    this.width = Math.max(1, this.container.clientWidth);
    this.height = Math.max(1, this.container.clientHeight);
    this.canvas.width = Math.round(this.width * this.pixelRatio);
    this.canvas.height = Math.round(this.height * this.pixelRatio);
  }
}
