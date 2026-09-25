/**
 * Fixed-timestep game loop. The simulation always advances in equal steps, so
 * physics behaves the same at 30, 60 or 144 Hz; rendering happens once per
 * display frame and gets `alpha` to interpolate between the last two steps.
 */
export interface LoopOptions {
  /** Advances the simulation by exactly one step. */
  update(stepSeconds: number): void;
  /**
   * Draws a frame. `alpha` (0..1) is how far real time has moved past the last
   * simulated step; `frameSeconds` is the unscaled time since the last frame,
   * for effects that should not slow down with `timeScale`.
   */
  render(alpha: number, frameSeconds: number): void;
  /** Length of one simulation step. Defaults to 1/60 s. */
  stepSeconds?: number;
  /**
   * Longest stretch of time a single frame may simulate. A tab that was in
   * the background would otherwise try to catch up on minutes of play.
   */
  maxFrameSeconds?: number;
  scheduler?: FrameScheduler;
}

export interface FrameScheduler {
  request(callback: (nowMs: number) => void): number;
  cancel(handle: number): void;
}

export interface GameLoop {
  start(): void;
  stop(): void;
  readonly running: boolean;
  /** 1 is normal speed; 0.25 is a slow-motion replay; 0 freezes the simulation. */
  timeScale: number;
}

const animationFrames: FrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

export function createLoop({
  update,
  render,
  stepSeconds = 1 / 60,
  maxFrameSeconds = 0.25,
  scheduler = animationFrames,
}: LoopOptions): GameLoop {
  let handle: number | null = null;
  let lastMs: number | null = null;
  let accumulated = 0;
  let timeScale = 1;

  const frame = (nowMs: number) => {
    handle = scheduler.request(frame);
    const frameSeconds = lastMs === null ? 0 : Math.min((nowMs - lastMs) / 1000, maxFrameSeconds);
    lastMs = nowMs;

    accumulated += frameSeconds * timeScale;
    while (accumulated >= stepSeconds) {
      update(stepSeconds);
      accumulated -= stepSeconds;
    }
    render(accumulated / stepSeconds, frameSeconds);
  };

  return {
    start() {
      if (handle !== null) return;
      lastMs = null;
      handle = scheduler.request(frame);
    },
    stop() {
      if (handle === null) return;
      scheduler.cancel(handle);
      handle = null;
    },
    get running() {
      return handle !== null;
    },
    get timeScale() {
      return timeScale;
    },
    set timeScale(value: number) {
      timeScale = Math.max(0, value);
    },
  };
}
