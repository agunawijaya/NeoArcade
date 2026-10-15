import type { CockpitAction, CockpitView, Region } from './actions';
import { drawMainView, mainBoresight, mainLayout } from './main-panel';
import { PALETTES, type Lighting } from './palette';
import { drawPedestal } from './pedestal';
import { drawEngineer, drawOverhead } from './stations';
import type { CockpitModel } from './view-model';
import { Windscreen } from './windscreen';

/**
 * The flight deck drawn over the 3D view: one canvas, redrawn each frame
 * for the view the player has chosen. It turns pointer gestures on its
 * regions into actions — a click on a button, a wheel or a drag on a
 * knob, a drag on a lever — and tells the world view where to point the
 * eye and how wide to make the lens. A double click on the panel zooms in
 * on the instruments under it, for small screens.
 */
export interface Eye {
  /** Draw the world at all: the full-screen panels cover it. */
  world: boolean;
  horizontalFov: number;
  boresight: number;
  headYawDeg: number;
  headPitchDeg: number;
}

const HEAD: Record<CockpitView, { yaw: number; pitch: number; fov: number }> = {
  main: { yaw: 0, pitch: 0, fov: 64 },
  outside: { yaw: 0, pitch: 0, fov: 72 },
  left: { yaw: -78, pitch: -6, fov: 76 },
  right: { yaw: 70, pitch: -6, fov: 76 },
  pedestal: { yaw: 0, pitch: -30, fov: 64 },
  overhead: { yaw: 0, pitch: 40, fov: 64 },
  engineer: { yaw: 120, pitch: -10, fov: 64 },
};

const FULL_PANELS: CockpitView[] = ['pedestal', 'overhead', 'engineer'];
/** The full-screen panels leave the sides to the view buttons and the tools. */
const PANEL_GUTTER = 88;
/** Pixels of drag per knob click, and the zoom on a double click. */
const DRAG_PER_CLICK = 10;
const ZOOM = 2.2;

export class Cockpit {
  readonly canvas: HTMLCanvasElement;
  view: CockpitView = 'main';
  private context: CanvasRenderingContext2D;
  private regions: Region[] = [];
  private windscreen = new Windscreen();
  private size = { width: 1, height: 1, ratio: 1 };
  private head = { yaw: 0, pitch: 0 };
  private fade = 0;
  private zoom: { x: number; y: number } | null = null;
  private gesture: { region: Region; lastY: number; moved: number; travelled: number } | null =
    null;
  /** A drag that starts away from every control flies the aircraft, like a yoke. */
  private stick: { x: number; y: number } | null = null;
  onStick: ((pitch: number, roll: number) => void) | null = null;
  /** The Captain's Hat cosmetic: a cap left on the glareshield. */
  showCap = false;
  private blinkClock = 0;

  constructor(
    container: HTMLElement,
    private onAction: (action: CockpitAction) => void,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'cockpit';
    container.append(this.canvas);
    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot draw the cockpit (no Canvas 2D).');
    this.context = context;
    this.canvas.addEventListener('pointerdown', this.pointerDown);
    this.canvas.addEventListener('pointermove', this.pointerMove);
    this.canvas.addEventListener('pointerup', this.pointerUp);
    this.canvas.addEventListener('pointercancel', this.pointerUp);
    this.canvas.addEventListener('wheel', this.wheel, { passive: false });
    this.canvas.addEventListener('dblclick', this.doubleClick);
  }

  resize(width: number, height: number, ratio: number) {
    this.size = { width, height, ratio };
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  setView(view: CockpitView, reducedMotion: boolean) {
    if (view === this.view) return;
    this.view = view;
    this.zoom = null;
    this.fade = reducedMotion ? 1 : 0;
  }

  /** Where the eye looks for this view, eased toward it unless motion is reduced. */
  eye(dt: number, reducedMotion: boolean): Eye {
    const target = HEAD[this.view];
    const ease = reducedMotion ? 1 : Math.min(1, dt * 6);
    this.head.yaw += (target.yaw - this.head.yaw) * ease;
    this.head.pitch += (target.pitch - this.head.pitch) * ease;
    const layout = mainLayout(this.size.width, this.size.height);
    const full = FULL_PANELS.includes(this.view) && this.fade >= 1;
    return {
      world: !full,
      horizontalFov: target.fov,
      boresight: this.view === 'main' ? mainBoresight(layout) : 0.5,
      headYawDeg: this.head.yaw,
      headPitchDeg: this.head.pitch,
    };
  }

  draw(
    model: CockpitModel,
    lighting: Lighting,
    dt: number,
    reducedMotion: boolean,
    raining: boolean,
  ) {
    const { width, height, ratio } = this.size;
    const context = this.context;
    const palette = PALETTES[lighting];
    this.regions = [];
    this.blinkClock = (this.blinkClock + dt) % 1;
    this.fade = Math.min(1, this.fade + dt * 4);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    const airspeed = model.flight.readout.iasKt;
    this.windscreen.update(raining, airspeed, model.flight.panel.wipers, dt, reducedMotion);
    const blink = this.blinkClock < 0.6;

    if (this.view === 'main') {
      const layout = mainLayout(width, height);
      this.windscreen.draw(context, width, layout.glareTop, palette, airspeed);
      if (this.zoom) {
        const { x, y } = this.zoom;
        context.save();
        context.translate(x, y);
        context.scale(ZOOM, ZOOM);
        context.translate(-x, -y);
        drawMainView(context, model, layout, palette, this.regions, blink, this.showCap);
        context.restore();
        this.regions = this.regions.map((region) => ({
          ...region,
          x: x + (region.x - x) * ZOOM,
          y: y + (region.y - y) * ZOOM,
          width: region.width * ZOOM,
          height: region.height * ZOOM,
        }));
      } else {
        drawMainView(context, model, layout, palette, this.regions, blink, this.showCap);
      }
    } else if (this.view === 'left' || this.view === 'right') {
      this.windscreen.draw(context, width, height * 0.82, palette, airspeed);
      context.fillStyle = palette.frame;
      context.fillRect(0, height * 0.82, width, height * 0.18);
    } else if (FULL_PANELS.includes(this.view)) {
      context.globalAlpha = this.fade;
      const draw =
        this.view === 'pedestal'
          ? drawPedestal
          : this.view === 'overhead'
            ? drawOverhead
            : drawEngineer;
      const gutter = width > 640 ? PANEL_GUTTER : 0;
      context.fillStyle = palette.frame;
      context.fillRect(0, 0, width, height);
      context.translate(gutter, 0);
      const regions: Region[] = [];
      draw(context, model, width - gutter * 2, height, palette, regions);
      context.translate(-gutter, 0);
      this.regions = regions.map((region) => ({ ...region, x: region.x + gutter }));
      context.globalAlpha = 1;
    }
    if (lighting !== 'day') {
      context.fillStyle = palette.flood;
      context.fillRect(0, 0, width, height);
    }
  }

  /** The topmost region under a point: panels push regions in drawing order. */
  private regionAt(x: number, y: number): Region | null {
    for (let index = this.regions.length - 1; index >= 0; index--) {
      const region = this.regions[index] as Region;
      if (
        x >= region.x &&
        x <= region.x + region.width &&
        y >= region.y &&
        y <= region.y + region.height
      )
        return region;
    }
    return null;
  }

  private local(event: PointerEvent | WheelEvent | MouseEvent) {
    const bounds = this.canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  private pointerDown = (event: PointerEvent) => {
    const { x, y } = this.local(event);
    const region = this.regionAt(x, y);
    event.preventDefault();
    this.canvas.setPointerCapture(event.pointerId);
    if (!region) {
      this.stick = { x, y };
      return;
    }
    this.gesture = { region, lastY: y, moved: 0, travelled: 0 };
    if (region.drag) this.onAction(region.drag(this.fractionIn(region, y)));
  };

  private pointerMove = (event: PointerEvent) => {
    const { x, y } = this.local(event);
    if (this.stick) {
      const reach = Math.min(this.size.width, this.size.height) * 0.18;
      const roll = Math.max(-1, Math.min(1, (x - this.stick.x) / reach));
      const pitch = Math.max(-1, Math.min(1, (y - this.stick.y) / reach));
      this.onStick?.(pitch, roll);
      return;
    }
    if (!this.gesture) {
      this.canvas.style.cursor = this.regionAt(x, y) ? 'pointer' : '';
      return;
    }
    const { region } = this.gesture;
    if (region.drag) {
      this.onAction(region.drag(this.fractionIn(region, y)));
      return;
    }
    if (region.knob) {
      // Dragging up turns a knob clockwise, a click every few pixels.
      this.gesture.moved += this.gesture.lastY - y;
      this.gesture.travelled += Math.abs(this.gesture.lastY - y);
      this.gesture.lastY = y;
      const clicks = Math.trunc(this.gesture.moved / DRAG_PER_CLICK);
      if (clicks !== 0) {
        this.gesture.moved -= clicks * DRAG_PER_CLICK;
        this.onAction({ kind: 'knob', knob: region.knob, clicks });
      }
    }
  };

  private pointerUp = (event: PointerEvent) => {
    if (this.stick) {
      this.stick = null;
      this.onStick?.(0, 0);
    }
    const gesture = this.gesture;
    this.gesture = null;
    if (!gesture) return;
    if (this.canvas.hasPointerCapture(event.pointerId))
      this.canvas.releasePointerCapture(event.pointerId);
    const { region } = gesture;
    if (region.click) this.onAction(region.click);
    // A tap on a knob turns it one click: up from its top half, down from its bottom half.
    if (region.knob && gesture.travelled < 4) {
      const { y } = this.local(event);
      this.onAction({
        kind: 'knob',
        knob: region.knob,
        clicks: y < region.y + region.height / 2 ? 1 : -1,
      });
    }
  };

  private wheel = (event: WheelEvent) => {
    const { x, y } = this.local(event);
    const region = this.regionAt(x, y);
    if (!region?.knob) return;
    event.preventDefault();
    this.onAction({ kind: 'knob', knob: region.knob, clicks: event.deltaY < 0 ? 1 : -1 });
  };

  private doubleClick = (event: MouseEvent) => {
    if (this.view !== 'main') return;
    const { x, y } = this.local(event);
    const layout = mainLayout(this.size.width, this.size.height);
    if (y < layout.panelTop && !this.zoom) return;
    this.zoom = this.zoom ? null : { x, y };
  };

  private fractionIn(region: Region, y: number) {
    return Math.min(1, Math.max(0, 1 - (y - region.y) / region.height));
  }

  dispose() {
    this.canvas.remove();
  }
}
