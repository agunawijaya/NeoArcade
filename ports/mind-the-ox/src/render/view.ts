import type { Plane, World } from '../engine/world';
import type { ThemeId } from '../themes';
import type { Livery, Palette } from './palette';
import type { Particle } from './particles';
import type { Scenery } from './scenery';

export type CameraView = 'side' | 'diorama';

/**
 * The one small interface behind both camera views (ADR "camera views"):
 * each paints the same Frame its own way, and nothing it does feeds back
 * into the engine, so every view plays exactly the same game.
 */
export interface ViewRenderer {
  readonly id: CameraView;
  /** The element to put on screen: a canvas, or a stack of them. */
  readonly element: HTMLElement;
  render(frame: Frame, viewport: Viewport): void;
  /**
   * The stretch of the playing field the view shows around a camera
   * position; the fairness tests hold every view to the side view's.
   */
  fieldOfView(viewport: Viewport, cameraX: number): WorldWindow;
  resize(viewport: Viewport, pixelRatio: number): void;
  /** The four-colour CGA picture, on or off. */
  setFilter(cga: boolean): void;
  dispose(): void;
}

export interface Viewport {
  /** CSS pixels. */
  width: number;
  height: number;
  /** Room kept for the HUD above the playing field, and the world strip below it. */
  insetTop: number;
  insetBottom: number;
}

export interface WorldWindow {
  left: number;
  right: number;
  bottom: number;
  top: number;
}

/** A plane as the views see it this frame: the engine's state plus how far through a roll it is. */
export interface PlaneFrame {
  plane: Plane;
  /** Radians about the plane's own length: 0 the usual way up for its heading, π rolled over, eased in between. */
  roll: number;
  /** Seconds the engine has been running, for the propeller. */
  spin: number;
  /** How hard the engine is working, 0…1, for the propeller blur and exhaust. */
  power: number;
}

/** A mark on the pilot's goggles: a bird, a bullet hole, or worse. */
export interface Splat {
  kind: 'bird' | 'hole' | 'ox';
  /** Where on the screen, as fractions of its width and height. */
  x: number;
  y: number;
  size: number;
  /** Seconds since it landed. */
  age: number;
  seed: number;
}

/** A pilot in the water, and the boat a destroyer sends to fetch them. */
export interface Rescue {
  x: number;
  /**
   * The destroyer that picks them up, by id; null for a cartoon pilot,
   * who pops up in a rubber ring and paddles off on a raft of their own.
   */
  ship: number | null;
  /** Seconds since the splash. */
  age: number;
}

export interface Frame {
  /** Wall-clock seconds, for idle animation. */
  time: number;
  world: World;
  theme: ThemeId;
  palette: Palette;
  scenery: Scenery;
  /** The world x at the middle of the screen, eased after the followed plane. */
  cameraX: number;
  /** The plane the camera follows, if any. */
  focus: Plane | null;
  planes: readonly PlaneFrame[];
  /** Each plane's paint job for this theme and light; a plane missing here wears its side's. */
  liveries: ReadonlyMap<number, Livery>;
  particles: readonly Particle[];
  splats: readonly Splat[];
  rescues: readonly Rescue[];
  /** 0…1 through the winner's flight into the sun, or null. */
  sun: number | null;
  /** 0…1 through THE END, or null. */
  theEnd: number | null;
  reducedMotion: boolean;
}
