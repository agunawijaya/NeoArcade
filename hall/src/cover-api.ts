/**
 * The contract between the Hall and a game's animated cover. A port adds
 * hall/covers/<cover-id>.ts:
 *
 *   import { defineCover } from '../src/cover-api';
 *
 *   export default defineCover({
 *     posterTime: 2,
 *     create({ seed, accent }) {
 *       const stars = makeStars(seed);           // per-cabinet state lives here
 *       return {
 *         draw(ctx, { width, height, time, energy }) {
 *           // paint a complete frame; energy rises from 0 to 1 on hover/focus
 *         },
 *       };
 *     },
 *   });
 *
 * Covers are small canvas scenes, not the game: no DOM, no input, no audio,
 * no imports from the port (keep the Hall bundle small and independent).
 */
export interface CoverFrame {
  /** Size of the screen in CSS pixels. The context is already scaled for the device. */
  readonly width: number;
  readonly height: number;
  /** Seconds of animation. Starts at `posterTime` and only runs while the cabinet is alive. */
  readonly time: number;
  /** Seconds since the previous frame (0 for a still). */
  readonly delta: number;
  /** 0 while idle, easing to 1 while hovered, focused or shown in the detail panel. */
  readonly energy: number;
  /** The player asked for less motion: draw a calm still, the Hall will not animate. */
  readonly reducedMotion: boolean;
}

export interface CoverSetup {
  /** Stable per cabinet, for seeding procedural details. */
  readonly seed: number;
  /** The game's accent colour from the catalog, as #rrggbb. */
  readonly accent: string;
  readonly title: string;
}

export interface CoverScene {
  /** Paints a whole frame. Called every animation frame while alive, once when idle. */
  draw(ctx: CanvasRenderingContext2D, frame: CoverFrame): void;
}

export interface CoverDefinition {
  /** The moment of the animation shown as the idle still. Defaults to 0. */
  posterTime?: number;
  /** Called once per canvas that shows the cover. */
  create(setup: CoverSetup): CoverScene;
}

/** Identity helper that gives cover files type checking and a recognisable shape. */
export function defineCover(definition: CoverDefinition): CoverDefinition {
  return definition;
}
