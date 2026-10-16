import { CEILING } from '../../engine/constants';
import type { Viewport, WorldWindow } from '../view';

/** The lowest and highest world heights the side view always shows: all the ground and the ceiling. */
export const FLOOR = 20;
export const SKY_TOP = CEILING + 14;

/**
 * Maps world units to screen pixels for the side view. The whole height of
 * the world always fits between the HUD and the strip map, as in 1984; the
 * width shown follows from the screen's shape.
 */
export class SideCamera {
  readonly scale: number;
  readonly left: number;
  readonly bandTop: number;
  readonly bandBottom: number;

  /** `centreY`, when given, puts that height in the middle of the band instead of fitting the whole world. */
  constructor(
    readonly viewport: Viewport,
    readonly centreX: number,
    readonly zoom = 1,
    readonly centreY: number | null = null,
  ) {
    this.bandTop = viewport.insetTop;
    this.bandBottom = viewport.height - viewport.insetBottom;
    this.scale = ((this.bandBottom - this.bandTop) / (SKY_TOP - FLOOR)) * zoom;
    this.left = centreX - viewport.width / 2 / this.scale;
  }

  /** The base mapping, before any cinematic zoom. */
  static fieldOfView(viewport: Viewport, centreX: number): WorldWindow {
    const camera = new SideCamera(viewport, centreX);
    return {
      left: camera.left,
      right: camera.left + viewport.width / camera.scale,
      bottom: FLOOR,
      top: SKY_TOP,
    };
  }

  x(worldX: number): number {
    return (worldX - this.left) * this.scale;
  }

  y(worldY: number): number {
    if (this.centreY !== null) {
      const middle = (this.bandTop + this.bandBottom) / 2;
      return middle - (worldY - this.centreY) * this.scale;
    }
    return this.bandBottom - (worldY - FLOOR) * this.scale;
  }

  /** World x at a screen x, for drawing only what is on screen. */
  worldX(screenX: number): number {
    return this.left + screenX / this.scale;
  }

  get right(): number {
    return this.worldX(this.viewport.width);
  }

  /** A layer that scrolls at `parallax` of the play's speed: where its x lands on screen. */
  parallaxX(layerX: number, parallax: number): number {
    return this.viewport.width / 2 + (layerX - this.centreX * parallax) * this.scale;
  }
}
