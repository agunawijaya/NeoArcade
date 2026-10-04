import { MAP_HEIGHT, MAP_WIDTH } from '../map/projection';
import {
  MAP_PALETTES,
  fitCamera,
  paintMap,
  wholeCountry,
  type MapCamera,
  type MapLayers,
  type MapStyle,
} from '../render/map-painter';
import { SizedCanvas } from './dom';

/**
 * A map on screen: the painter, a camera, and (when interactive) drag,
 * pinch, wheel and keyboard to move it. The planner, the full map and the
 * mini-map all use one.
 */
export interface MapCanvasOptions {
  className: string;
  interactive: boolean;
  label: string;
  style: () => MapStyle;
  layers: () => MapLayers;
  reducedMotion: () => boolean;
  /** Called with a map point when the player clicks or taps without dragging. */
  onPick?: (x: number, y: number) => void;
}

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 6;

export class MapCanvas {
  readonly canvas: SizedCanvas;
  private camera: MapCamera = { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2, scale: 1 };
  private base = 1;
  private fitted = false;
  private time = 0;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private dragged = 0;
  private pinch: { distance: number; scale: number } | null = null;

  constructor(private readonly options: MapCanvasOptions) {
    this.canvas = new SizedCanvas(options.className);
    const element = this.canvas.element;
    element.setAttribute('role', 'img');
    element.setAttribute('aria-label', options.label);
    if (options.interactive) {
      element.tabIndex = 0;
      element.addEventListener('pointerdown', this.onPointerDown);
      element.addEventListener('pointermove', this.onPointerMove);
      element.addEventListener('pointerup', this.onPointerUp);
      element.addEventListener('pointercancel', this.onPointerUp);
      element.addEventListener('wheel', this.onWheel, { passive: false });
      element.addEventListener('keydown', this.onKey);
    } else if (options.onPick) {
      element.addEventListener('click', () => options.onPick?.(this.camera.x, this.camera.y));
    }
  }

  get element(): HTMLCanvasElement {
    return this.canvas.element;
  }

  /** Frames a box of map units (a route, a region), or the whole country. */
  frame(box?: { minX: number; minY: number; maxX: number; maxY: number }, margin = 28) {
    this.canvas.fit();
    const { width, height } = this.canvas;
    this.camera = box ? fitCamera(box, width, height, margin) : wholeCountry(width, height);
    this.base = wholeCountry(width, height).scale;
    this.fitted = true;
  }

  /** Keeps a point in view at a zoom, for the mini-map following the rig. */
  follow(x: number, y: number, zoom: number) {
    this.canvas.fit();
    this.base = wholeCountry(this.canvas.width, this.canvas.height).scale;
    this.camera = { x, y, scale: this.base * zoom };
    this.fitted = true;
  }

  draw(dt = 0) {
    this.time += dt;
    const resized = this.canvas.fit();
    if (!this.fitted || (resized && !this.options.interactive)) this.frame();
    const { width, height, pixelRatio, ctx } = this.canvas;
    paintMap(ctx, {
      width,
      height,
      pixelRatio,
      camera: this.camera,
      palette: MAP_PALETTES[this.options.style()],
      layers: this.options.layers(),
      time: this.time,
      reducedMotion: this.options.reducedMotion(),
    });
  }

  zoomBy(factor: number, aroundX = this.canvas.width / 2, aroundY = this.canvas.height / 2) {
    const before = this.toMap(aroundX, aroundY);
    const scale = Math.min(
      this.base * MAX_ZOOM,
      Math.max(this.base * MIN_ZOOM, this.camera.scale * factor),
    );
    this.camera = { ...this.camera, scale };
    const after = this.toMap(aroundX, aroundY);
    this.camera = {
      ...this.camera,
      x: this.camera.x + before.x - after.x,
      y: this.camera.y + before.y - after.y,
    };
    this.clamp();
  }

  panBy(dx: number, dy: number) {
    this.camera = {
      ...this.camera,
      x: this.camera.x - dx / this.camera.scale,
      y: this.camera.y - dy / this.camera.scale,
    };
    this.clamp();
  }

  private clamp() {
    this.camera = {
      ...this.camera,
      x: Math.max(0, Math.min(MAP_WIDTH, this.camera.x)),
      y: Math.max(0, Math.min(MAP_HEIGHT, this.camera.y)),
    };
  }

  /** Screen pixels (CSS) to map units. */
  toMap(px: number, py: number): { x: number; y: number } {
    return {
      x: this.camera.x + (px - this.canvas.width / 2) / this.camera.scale,
      y: this.camera.y + (py - this.canvas.height / 2) / this.camera.scale,
    };
  }

  private local(event: PointerEvent | WheelEvent) {
    const bounds = this.canvas.element.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    this.canvas.element.setPointerCapture(event.pointerId);
    this.pointers.set(event.pointerId, this.local(event));
    this.dragged = 0;
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()] as [
        { x: number; y: number },
        { x: number; y: number },
      ];
      this.pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale: this.camera.scale };
    }
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    const previous = this.pointers.get(event.pointerId);
    if (!previous) return;
    const now = this.local(event);
    this.pointers.set(event.pointerId, now);
    if (this.pointers.size === 2 && this.pinch) {
      const [a, b] = [...this.pointers.values()] as [
        { x: number; y: number },
        { x: number; y: number },
      ];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const target = (this.pinch.scale * distance) / Math.max(1, this.pinch.distance);
      this.zoomBy(target / this.camera.scale, (a.x + b.x) / 2, (a.y + b.y) / 2);
      this.dragged += 10;
      return;
    }
    this.dragged += Math.abs(now.x - previous.x) + Math.abs(now.y - previous.y);
    this.panBy(now.x - previous.x, now.y - previous.y);
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    const at = this.pointers.get(event.pointerId);
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (at && this.dragged < 6 && this.options.onPick) {
      const point = this.toMap(at.x, at.y);
      this.options.onPick(point.x, point.y);
    }
  };

  private readonly onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const at = this.local(event);
    this.zoomBy(event.deltaY < 0 ? 1.15 : 1 / 1.15, at.x, at.y);
  };

  private readonly onKey = (event: KeyboardEvent) => {
    const step = 60;
    const handled: Record<string, () => void> = {
      ArrowLeft: () => this.panBy(step, 0),
      ArrowRight: () => this.panBy(-step, 0),
      ArrowUp: () => this.panBy(0, step),
      ArrowDown: () => this.panBy(0, -step),
      '+': () => this.zoomBy(1.25),
      '=': () => this.zoomBy(1.25),
      '-': () => this.zoomBy(0.8),
      '0': () => this.frame(),
    };
    const action = handled[event.key];
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    action();
  };
}
