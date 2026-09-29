import { discTouchesCircle, discTouchesRect, type Circle, type Rect } from './geometry';

/**
 * Trick Shot's targets. A crate sits on a roof and a bell hangs from a
 * little gallows; either stops the banana that hits it, and then it is
 * spent: the crate splinters, the bell drops off its hook. A hoop hangs in
 * the air to be flown through, and the banana carries on.
 *
 * `x`, `y` is the middle of the target, in world units.
 */
export type TargetKind = 'crate' | 'bell' | 'hoop';

export interface Target {
  kind: TargetKind;
  x: number;
  y: number;
}

export const CRATE_SIZE = 12;
export const BELL_RADIUS = 5;
/** A banana whose middle passes this close to a hoop's middle has threaded it. */
export const HOOP_RADIUS = 9;

export function stopsBanana(target: Target): boolean {
  return target.kind !== 'hoop';
}

export function targetShape(target: Target): Rect | Circle {
  if (target.kind === 'crate') {
    const half = CRATE_SIZE / 2;
    return { x: target.x - half, y: target.y - half, width: CRATE_SIZE, height: CRATE_SIZE };
  }
  return { x: target.x, y: target.y, radius: target.kind === 'bell' ? BELL_RADIUS : HOOP_RADIUS };
}

/** A banana of this radius at x, y touches the target (for a hoop, its middle is inside). */
export function touchesTarget(target: Target, x: number, y: number, bananaRadius: number): boolean {
  const shape = targetShape(target);
  if ('width' in shape) return discTouchesRect(x, y, bananaRadius, shape);
  return discTouchesCircle(x, y, target.kind === 'hoop' ? 0 : bananaRadius, shape);
}
