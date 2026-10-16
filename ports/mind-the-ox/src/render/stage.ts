import { paintHud, type HudState } from './hud';
import type { Lighting } from './palette';
import { SideView } from './side-view';
import type { CameraView, Frame, ViewRenderer, Viewport, WorldWindow } from './view';

const MAX_PIXEL_RATIO = 2;

/** What the stage needs from a game in progress, one player's view at a time. */
export interface StageSource {
  frame(player: number, lighting: Lighting, halfWidth: number): Frame;
  hud(player: number, frame: Frame, window: WorldWindow): HudState;
}

interface Pane {
  element: HTMLElement;
  view: ViewRenderer;
  hud: HTMLCanvasElement;
  viewport: Viewport;
}

/**
 * The screen: one pane, or two stacked for a split screen, each with its
 * own camera view and its instrument panel and world strip painted over
 * it. Views are swapped here when the player changes camera; the diorama
 * is only loaded when first asked for.
 */
export class Stage {
  readonly element: HTMLElement;
  private panes: Pane[] = [];
  private camera: CameraView = 'side';
  private cga = false;
  private pixelRatio = 1;
  private building: Promise<void> = Promise.resolve();

  constructor(parent: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'stage';
    this.element.tabIndex = -1;
    this.element.setAttribute('aria-label', 'The battlefield');
    parent.prepend(this.element);
    new ResizeObserver(() => this.resize()).observe(this.element);
  }

  get paneCount(): number {
    return this.panes.length;
  }

  /** Lays out `count` panes with the given camera, building views as needed. */
  async configure(count: 1 | 2, camera: CameraView) {
    if (count === this.panes.length && camera === this.camera) return;
    this.camera = camera;
    this.building = this.building.then(() => this.rebuild(count));
    await this.building;
  }

  setFilter(cga: boolean) {
    this.cga = cga;
    for (const pane of this.panes) pane.view.setFilter(cga);
  }

  private async rebuild(count: 1 | 2) {
    const views: ViewRenderer[] = [];
    for (let index = 0; index < count; index++) views.push(await createView(this.camera));
    for (const pane of this.panes) {
      pane.element.remove();
      pane.view.dispose();
    }
    this.panes = views.map((view) => {
      const element = document.createElement('div');
      element.className = 'stage__pane';
      const hud = document.createElement('canvas');
      hud.className = 'stage__hud';
      hud.setAttribute('aria-hidden', 'true');
      element.append(view.element, hud);
      this.element.append(element);
      view.setFilter(this.cga);
      return { element, view, hud, viewport: { width: 1, height: 1, insetTop: 0, insetBottom: 0 } };
    });
    this.element.dataset.panes = String(count);
    this.resize();
  }

  resize() {
    this.pixelRatio = Math.min(MAX_PIXEL_RATIO, devicePixelRatio || 1);
    for (const pane of this.panes) {
      const width = Math.max(1, pane.element.clientWidth);
      const height = Math.max(1, pane.element.clientHeight);
      pane.viewport = { width, height, ...insets(width, height) };
      pane.view.resize(pane.viewport, this.pixelRatio);
      pane.hud.width = Math.round(width * this.pixelRatio);
      pane.hud.height = Math.round(height * this.pixelRatio);
    }
  }

  /** Paints every pane from the game's state; the demo behind the menus goes without instruments. */
  render(source: StageSource, lighting: Lighting, instruments = true) {
    this.panes.forEach((pane, player) => {
      const field = pane.view.fieldOfView(pane.viewport, 0);
      const frame = source.frame(player, lighting, (field.right - field.left) / 2);
      pane.view.render(frame, pane.viewport);
      const hud = pane.hud.getContext('2d');
      if (!hud) return;
      hud.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
      hud.clearRect(0, 0, pane.viewport.width, pane.viewport.height);
      if (!instruments) return;
      paintHud(
        hud,
        pane.viewport,
        source.hud(player, frame, pane.view.fieldOfView(pane.viewport, frame.cameraX)),
      );
    });
  }

  /** The stretch of world the first pane shows around a camera position, for the fairness tests. */
  fieldOfView(cameraX: number): WorldWindow | null {
    const pane = this.panes[0];
    return pane ? pane.view.fieldOfView(pane.viewport, cameraX) : null;
  }

  focus() {
    this.element.focus();
  }

  dispose() {
    for (const pane of this.panes) pane.view.dispose();
    this.panes = [];
    this.element.remove();
  }
}

async function createView(camera: CameraView): Promise<ViewRenderer> {
  if (camera === 'diorama') {
    const { DioramaView } = await import('./diorama-view');
    return new DioramaView();
  }
  return new SideView();
}

/** Room for the instrument panel above the field and the world strip below it. */
function insets(width: number, height: number): Pick<Viewport, 'insetTop' | 'insetBottom'> {
  const compact = height < 500 || width < 700;
  return { insetTop: compact ? 48 : 64, insetBottom: compact ? 40 : 58 };
}
