export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Picks the box a player most likely means by "go up/down/left/right" from
 * `from`: it has to lie in that direction, and among those the nearest wins,
 * with sideways drift counting extra so moving down a column stays in it.
 */
export function nearestInDirection<T extends Box>(
  from: Box,
  candidates: readonly T[],
  direction: Direction,
): T | null {
  const origin = centre(from);
  let best: T | null = null;
  let bestScore = Infinity;

  for (const candidate of candidates) {
    if (candidate === from) continue;
    const target = centre(candidate);
    const [ahead, sideways] = relativeTo(direction, target.x - origin.x, target.y - origin.y);

    // Boxes on the same row (or column) share a centre line; ignore rounding noise.
    if (ahead <= 1) continue;
    const score = ahead + Math.abs(sideways) * 2;
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

/** Splits an offset into distance along the direction of travel and drift across it. */
function relativeTo(direction: Direction, dx: number, dy: number): [number, number] {
  switch (direction) {
    case 'left':
      return [-dx, dy];
    case 'right':
      return [dx, dy];
    case 'up':
      return [-dy, dx];
    case 'down':
      return [dy, dx];
  }
}

function centre(box: Box) {
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}
