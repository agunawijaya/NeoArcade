import { CGA_PALETTE, createPostFx, type PostFx } from '@shared/fx';
import type { ScreenFilter } from '../settings';
import type { Palette } from './palette';
import type { Frame, RoadView, Viewport } from './view';

const MAX_PIXEL_RATIO = 2;

/**
 * The canvas on screen. It keeps the scene canvas at device resolution, works
 * out the viewport the views draw into (with room for the HUD) and runs the
 * post-processing: a soft bloom and grade, and on request a CRT tube or the
 * four-colour CGA Easter egg.
 */
export class Stage {
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly fx: PostFx;
  private filter: ScreenFilter = 'none';
  private graded: Palette | null = null;
  private pixelRatio = 1;
  viewport: Viewport = { width: 1, height: 1, insetTop: 0, insetBottom: 0 };

  constructor(private readonly container: HTMLElement) {
    const context = this.canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas 2D is not available.');
    this.ctx = context;
    this.fx = createPostFx(this.canvas, {
      bloom: { strength: 0.35, threshold: 0.78, radius: 1.6 },
      vignette: 0.28,
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

  setFilter(filter: ScreenFilter) {
    this.filter = filter;
    this.fx.update({
      crt:
        filter === 'none'
          ? false
          : { curvature: 0.08, scanlines: 0.3, mask: 0.12, aberration: 0.0012 },
      palette: filter === 'cga' ? CGA_PALETTE : false,
    });
    if (this.graded) this.applyGrade(this.graded);
  }

  render(view: RoadView, frame: Frame) {
    this.grade(frame.palette);
    const ctx = this.ctx;
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    view.draw(ctx, frame, this.viewport);
    this.fx.render();
  }

  /** Paints something other than the road, such as the title backdrop. */
  paint(draw: (ctx: CanvasRenderingContext2D, viewport: Viewport) => void) {
    const ctx = this.ctx;
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    draw(ctx, this.viewport);
    this.fx.render();
  }

  private grade(palette: Palette) {
    if (this.graded === palette) return;
    this.graded = palette;
    this.applyGrade(palette);
  }

  private applyGrade(palette: Palette) {
    const { grade, daylight } = palette;
    // In four colours the mid-tones round down to black, and a grey donkey
    // vanishes into the road; a brighter picture keeps it cyan or magenta.
    const cga = this.filter === 'cga';
    this.fx.update({
      grade: cga
        ? { ...grade, exposure: grade.exposure * 1.5, contrast: grade.contrast * 1.1 }
        : { ...grade },
      // Bright scenes would glow all over; at night the lights bloom more.
      bloom: { strength: 0.25 + (1 - daylight) * 0.45, threshold: 0.7 + daylight * 0.15 },
    });
  }

  private resize() {
    this.pixelRatio = Math.min(MAX_PIXEL_RATIO, window.devicePixelRatio || 1);
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.canvas.width = Math.round(width * this.pixelRatio);
    this.canvas.height = Math.round(height * this.pixelRatio);
    this.viewport = { width, height, ...hudInsets(width, height) };
  }
}

/** The HUD's top bar, which the road ahead must never slide under. */
export function hudInsets(
  width: number,
  height: number,
): Pick<Viewport, 'insetTop' | 'insetBottom'> {
  const compact = height < 500 || width < 560;
  return { insetTop: compact ? 56 : 76, insetBottom: compact ? 8 : 16 };
}
