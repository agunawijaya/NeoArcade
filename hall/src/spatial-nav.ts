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

export interface RowPosition {
  row: number;
  index: number;
}

/**
 * Moves through rows of items that each scroll sideways, like the lobby's
 * shelves: left and right step along the row and stop at its ends; up and
 * down jump to the next row that has items, landing on the one whose centre
 * is closest across, so the eye does not have to hunt. Null means there is
 * nowhere to go in that direction.
 */
export function stepAcrossRows(
  rows: readonly (readonly Box[])[],
  from: RowPosition,
  direction: Direction,
): RowPosition | null {
  const row = rows[from.row];
  const origin = row?.[from.index];
  if (!row || !origin) return null;

  if (direction === 'left' || direction === 'right') {
    const index = from.index + (direction === 'right' ? 1 : -1);
    return index >= 0 && index < row.length ? { row: from.row, index } : null;
  }

  const step = direction === 'down' ? 1 : -1;
  for (let next = from.row + step; next >= 0 && next < rows.length; next += step) {
    const candidates = rows[next] ?? [];
    if (candidates.length === 0) continue;
    const x = centre(origin).x;
    let best = 0;
    candidates.forEach((candidate, index) => {
      const bestBox = candidates[best] as Box;
      if (Math.abs(centre(candidate).x - x) < Math.abs(centre(bestBox).x - x)) best = index;
    });
    return { row: next, index: best };
  }
  return null;
}
