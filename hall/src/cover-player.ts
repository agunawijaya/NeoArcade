import type { CoverDefinition, CoverScene, CoverSetup } from './cover-api';
import { fallbackCover } from './fallback-cover';
import { onMotionPreferenceChange, prefersReducedMotion } from './motion';
import { animate, stopAnimating } from './ticker';

/** Runs one cover on one canvas: sizing, idle stills, waking up on hover. */
export interface CoverPlayer {
  setAlive(alive: boolean): void;
  dispose(): void;
}

// How quickly a cover powers up and down, per second.
const ENERGY_RATE = 5;
const MAX_PIXEL_RATIO = 2;

export function playCover(
  canvas: HTMLCanvasElement,
  definition: CoverDefinition,
  setup: CoverSetup,
): CoverPlayer {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { setAlive() {}, dispose() {} };

  let scene = createScene(definition, setup);
  let time = definition.posterTime ?? 0;
  let energy = 0;
  let alive = false;
  let visible = true;
  let width = 0;
  let height = 0;

  const draw = (delta: number) => {
    if (width === 0 || height === 0) return;
    const pixelRatio = canvas.width / width;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    const frame = { width, height, time, delta, energy, reducedMotion: prefersReducedMotion() };
    try {
      scene.draw(ctx, frame);
    } catch (error) {
      // A broken cover must not take the Hall down with it.
      console.error('A cover failed to draw; switching to the generic one.', error);
      scene = fallbackCover.create(setup);
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      scene.draw(ctx, frame);
    }
  };

  const tick = (delta: number): boolean => {
    const target = alive ? 1 : 0;
    energy += (target - energy) * (1 - Math.exp(-delta * ENERGY_RATE));
    const settled = Math.abs(target - energy) < 0.002;
    if (settled) energy = target;
    time += delta;
    draw(delta);
    return visible && (alive || !settled);
  };

  const wake = () => {
    if (prefersReducedMotion()) {
      stopAnimating(tick);
      energy = alive ? 1 : 0;
      draw(0);
    } else if (visible) {
      animate(tick);
    }
  };

  const resizeObserver = new ResizeObserver(([entry]) => {
    if (!entry) return;
    width = entry.contentRect.width;
    height = entry.contentRect.height;
    const pixelRatio = Math.min(MAX_PIXEL_RATIO, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(width * pixelRatio));
    canvas.height = Math.max(1, Math.round(height * pixelRatio));
    draw(0);
  });
  resizeObserver.observe(canvas);

  const visibilityObserver = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
    if (visible && alive) wake();
  });
  visibilityObserver.observe(canvas);

  const stopListening = onMotionPreferenceChange(wake);

  return {
    setAlive(next) {
      if (next === alive) return;
      alive = next;
      wake();
    },
    dispose() {
      stopAnimating(tick);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      stopListening();
    },
  };
}

function createScene(definition: CoverDefinition, setup: CoverSetup): CoverScene {
  try {
    return definition.create(setup);
  } catch (error) {
    console.error('A cover failed to start; using the generic one.', error);
    return fallbackCover.create(setup);
  }
}
