import { describe, expect, it } from 'vitest';
import { createLoop, type FrameScheduler } from './index';

/** Hands frames out only when the test says so. */
function manualScheduler() {
  let pending: ((nowMs: number) => void) | null = null;
  let nextHandle = 1;
  const scheduler: FrameScheduler = {
    request(callback) {
      pending = callback;
      return nextHandle++;
    },
    cancel() {
      pending = null;
    },
  };
  return {
    scheduler,
    frameAt(nowMs: number) {
      const callback = pending;
      pending = null;
      callback?.(nowMs);
    },
    get hasPendingFrame() {
      return pending !== null;
    },
  };
}

function recordingLoop(options: { stepSeconds?: number; maxFrameSeconds?: number } = {}) {
  const clock = manualScheduler();
  const steps: number[] = [];
  const renders: { alpha: number; frameSeconds: number }[] = [];
  const loop = createLoop({
    ...options,
    scheduler: clock.scheduler,
    update: (step) => steps.push(step),
    render: (alpha, frameSeconds) => renders.push({ alpha, frameSeconds }),
  });
  return { clock, steps, renders, loop };
}

describe('createLoop', () => {
  it('runs a whole number of fixed steps per frame and interpolates the rest', () => {
    const { clock, steps, renders, loop } = recordingLoop({ stepSeconds: 0.01 });
    loop.start();
    clock.frameAt(1000);
    expect(steps).toHaveLength(0);

    clock.frameAt(1025);
    expect(steps).toEqual([0.01, 0.01]);
    expect(renders.at(-1)?.alpha).toBeCloseTo(0.5);
    expect(renders.at(-1)?.frameSeconds).toBeCloseTo(0.025);
  });

  it('simulates the same number of steps regardless of frame rate', () => {
    const fast = recordingLoop({ stepSeconds: 1 / 60 });
    const slow = recordingLoop({ stepSeconds: 1 / 60 });
    fast.loop.start();
    slow.loop.start();
    for (let ms = 0; ms <= 1000; ms += 1000 / 144) fast.clock.frameAt(ms);
    for (let ms = 0; ms <= 1000; ms += 1000 / 30) slow.clock.frameAt(ms);
    expect(Math.abs(fast.steps.length - slow.steps.length)).toBeLessThanOrEqual(1);
    expect(fast.steps.length).toBeGreaterThanOrEqual(59);
  });

  it('caps how much time one frame may catch up on', () => {
    const { clock, steps, loop } = recordingLoop({ stepSeconds: 0.1, maxFrameSeconds: 0.25 });
    loop.start();
    clock.frameAt(0);
    clock.frameAt(60_000);
    expect(steps).toHaveLength(2);
  });

  it('slows the simulation with timeScale but reports real frame time', () => {
    const { clock, steps, renders, loop } = recordingLoop({ stepSeconds: 0.125 });
    loop.timeScale = 0.5;
    loop.start();
    clock.frameAt(0);
    clock.frameAt(250);
    expect(steps).toHaveLength(1);
    expect(renders.at(-1)?.frameSeconds).toBeCloseTo(0.25);

    loop.timeScale = -3;
    expect(loop.timeScale).toBe(0);
  });

  it('stops and restarts without counting the time it was stopped', () => {
    const { clock, steps, loop } = recordingLoop({ stepSeconds: 0.01, maxFrameSeconds: 10 });
    loop.start();
    expect(loop.running).toBe(true);
    clock.frameAt(0);
    loop.stop();
    expect(loop.running).toBe(false);
    expect(clock.hasPendingFrame).toBe(false);

    loop.start();
    clock.frameAt(5000);
    expect(steps).toHaveLength(0);
    clock.frameAt(5010);
    expect(steps).toHaveLength(1);
  });

  it('ignores a second start()', () => {
    const { clock, loop } = recordingLoop();
    loop.start();
    loop.start();
    clock.frameAt(0);
    expect(clock.hasPendingFrame).toBe(true);
  });
});
