/**
 * One requestAnimationFrame loop shared by everything animated in the Hall,
 * which only runs while something asks for frames.
 */
export type TickCallback = (deltaSeconds: number) => boolean;

const subscribers = new Set<TickCallback>();
let frameHandle: number | null = null;
let lastFrameMs = 0;

/** Calls `tick` every frame until it returns false. */
export function animate(tick: TickCallback): void {
  subscribers.add(tick);
  if (frameHandle === null) {
    lastFrameMs = performance.now();
    frameHandle = requestAnimationFrame(frame);
  }
}

export function stopAnimating(tick: TickCallback): void {
  subscribers.delete(tick);
}

function frame(nowMs: number) {
  // A long gap means the tab was hidden; don't let scenes jump ahead.
  const deltaSeconds = Math.min(0.1, Math.max(0, (nowMs - lastFrameMs) / 1000));
  lastFrameMs = nowMs;
  for (const tick of [...subscribers]) {
    if (!tick(deltaSeconds)) subscribers.delete(tick);
  }
  frameHandle = subscribers.size > 0 ? requestAnimationFrame(frame) : null;
}
