import { QUARTER_TURN, cosine, sine } from './trig';

/** Half the length of a biplane, nose to tail, and the thickness of its body and wings. */
export const PLANE_HALF_LENGTH = 7;
export const PLANE_RADIUS = 3;
/** From the middle of the plane down to its wheels, and up to its top wing. */
export const WHEEL_DROP = 4.5;
export const TOP_WING_RISE = 3.5;

export interface Point {
  x: number;
  y: number;
}

/** A line segment with thickness: every moving thing is one, points included. */
export interface Capsule {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  radius: number;
}

export interface Box {
  left: number;
  right: number;
  bottom: number;
  top: number;
}

/** The heading the pilot's head points along: a quarter turn from the nose, one way or the other when rolled over. */
export function pilotUpHeading(heading: number, inverted: boolean): number {
  return inverted ? heading - QUARTER_TURN : heading + QUARTER_TURN;
}

/** How upright the pilot sits: 1 head up, −1 hanging upside down. */
export function uprightness(heading: number, inverted: boolean): number {
  return sine(pilotUpHeading(heading, inverted));
}

export function planeCapsule(x: number, y: number, heading: number): Capsule {
  const dx = cosine(heading) * PLANE_HALF_LENGTH;
  const dy = sine(heading) * PLANE_HALF_LENGTH;
  return { ax: x - dx, ay: y - dy, bx: x + dx, by: y + dy, radius: PLANE_RADIUS };
}

/** The points of a plane that can touch the ground: nose, tail, wheels and top wing. */
export function planeContactPoints(
  x: number,
  y: number,
  heading: number,
  inverted: boolean,
): { nose: Point; tail: Point; wheels: Point; top: Point } {
  const forwardX = cosine(heading);
  const forwardY = sine(heading);
  const up = pilotUpHeading(heading, inverted);
  const upX = cosine(up);
  const upY = sine(up);
  return {
    nose: { x: x + forwardX * PLANE_HALF_LENGTH, y: y + forwardY * PLANE_HALF_LENGTH },
    tail: { x: x - forwardX * PLANE_HALF_LENGTH, y: y - forwardY * PLANE_HALF_LENGTH },
    wheels: { x: x - upX * WHEEL_DROP, y: y - upY * WHEEL_DROP },
    top: { x: x + upX * TOP_WING_RISE, y: y + upY * TOP_WING_RISE },
  };
}

/** A capsule from where something was a tick ago to where it is, so fast things cannot skip through thin ones. */
export function sweptCapsule(
  x: number,
  y: number,
  vx: number,
  vy: number,
  radius: number,
): Capsule {
  return { ax: x - vx, ay: y - vy, bx: x, by: y, radius };
}

export function capsuleBounds(capsule: Capsule): Box {
  return {
    left: Math.min(capsule.ax, capsule.bx) - capsule.radius,
    right: Math.max(capsule.ax, capsule.bx) + capsule.radius,
    bottom: Math.min(capsule.ay, capsule.by) - capsule.radius,
    top: Math.max(capsule.ay, capsule.by) + capsule.radius,
  };
}

export function boxesOverlap(first: Box, second: Box): boolean {
  return (
    first.left <= second.right &&
    second.left <= first.right &&
    first.bottom <= second.top &&
    second.bottom <= first.top
  );
}

export function capsulesTouch(first: Capsule, second: Capsule): boolean {
  const reach = first.radius + second.radius;
  return segmentDistanceSquared(first, second) <= reach * reach;
}

/** Whether a capsule reaches into a box, treating the box's corners as square. */
export function capsuleTouchesBox(capsule: Capsule, box: Box): boolean {
  const grown: Box = {
    left: box.left - capsule.radius,
    right: box.right + capsule.radius,
    bottom: box.bottom - capsule.radius,
    top: box.top + capsule.radius,
  };
  return segmentCrossesBox(capsule.ax, capsule.ay, capsule.bx, capsule.by, grown);
}

/** The slab test: does the segment from a to b pass through the box? */
function segmentCrossesBox(ax: number, ay: number, bx: number, by: number, box: Box): boolean {
  let enter = 0;
  let leave = 1;
  const axes: [start: number, delta: number, low: number, high: number][] = [
    [ax, bx - ax, box.left, box.right],
    [ay, by - ay, box.bottom, box.top],
  ];
  for (const [start, delta, low, high] of axes) {
    if (delta === 0) {
      if (start < low || start > high) return false;
      continue;
    }
    let near = (low - start) / delta;
    let far = (high - start) / delta;
    if (near > far) [near, far] = [far, near];
    enter = Math.max(enter, near);
    leave = Math.min(leave, far);
    if (enter > leave) return false;
  }
  return true;
}

export function pointSegmentDistanceSquared(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  let t = lengthSquared === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lengthSquared;
  t = Math.min(1, Math.max(0, t));
  const cx = ax + dx * t - px;
  const cy = ay + dy * t - py;
  return cx * cx + cy * cy;
}

/** The squared distance between the closest points of two segments. */
export function segmentDistanceSquared(first: Capsule, second: Capsule): number {
  if (segmentsCross(first, second)) return 0;
  return Math.min(
    pointSegmentDistanceSquared(first.ax, first.ay, second.ax, second.ay, second.bx, second.by),
    pointSegmentDistanceSquared(first.bx, first.by, second.ax, second.ay, second.bx, second.by),
    pointSegmentDistanceSquared(second.ax, second.ay, first.ax, first.ay, first.bx, first.by),
    pointSegmentDistanceSquared(second.bx, second.by, first.ax, first.ay, first.bx, first.by),
  );
}

function segmentsCross(first: Capsule, second: Capsule): boolean {
  const side = (ax: number, ay: number, bx: number, by: number, px: number, py: number) =>
    (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  const d1 = side(second.ax, second.ay, second.bx, second.by, first.ax, first.ay);
  const d2 = side(second.ax, second.ay, second.bx, second.by, first.bx, first.by);
  const d3 = side(first.ax, first.ay, first.bx, first.by, second.ax, second.ay);
  const d4 = side(first.ax, first.ay, first.bx, first.by, second.bx, second.by);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/**
 * The 1984 game measured "how close" with vertical distances counted half as
 * much again, and compared squares; the AI and the targets' guns still do.
 */
export function weightedRangeSquared(dx: number, dy: number): number {
  const vertical = Math.abs(dy) * 1.5;
  return dx * dx + vertical * vertical;
}
