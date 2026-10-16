import { DEBRIS_DRAG_MOVES, TERMINAL_FALL_SPEED, TICKS_PER_MOVE, perTick } from './constants';
import { CLASSIC_STEP, cosine, sine } from './trig';
import { nextId, type World } from './world';

export type ExplosionSize = 'small' | 'large' | 'huge';

/** Pieces of wreckage per blast: a plane breaks in three, a bomb throws eight, a depot fifteen. */
const PIECES: Record<ExplosionSize, number> = { small: 3, large: 8, huge: 15 };

/** How much of the exploding thing's own motion the pieces carry on with. */
const INHERITED_MOTION = 0.25;

/**
 * Throws wreckage out in a fan around a blast. Most blasts fling it at half
 * the slowest flying speed; one in eight, and every depot, at full. The
 * pieces fall back and can still bring down a plane that flies into them.
 */
export function explode(
  world: World,
  x: number,
  y: number,
  vx: number,
  vy: number,
  size: ExplosionSize,
) {
  const pieces = PIECES[size];
  const fast = size === 'huge' || world.rng.int(0, 7) === 7;
  const speed = perTick(fast ? world.tuning.minSpeed : world.tuning.minSpeed / 2);
  // Spread the pieces over the circle the way 1984 did: odd sixteenths, then every one.
  const spacing = size === 'huge' ? 1 : size === 'large' ? 2 : 6;
  for (let index = 0; index < pieces; index++) {
    const heading = (1 + index * spacing) * CLASSIC_STEP;
    world.debris.push({
      id: nextId(world),
      x,
      y,
      vx: cosine(heading) * speed + vx * INHERITED_MOTION,
      vy: sine(heading) * speed + vy * INHERITED_MOTION,
      shape: world.rng.int(0, 7),
    });
  }
  world.events.push({ type: 'explosion', x, y, size });
}

/**
 * Falling things all slow sideways and speed up downwards in the same
 * gentle steps: one unit per move every `dragMoves` moves, spread over the
 * ticks in between so the arc is smooth.
 */
export function applyDrag(
  body: { vx: number; vy: number },
  dragMoves: number,
  terminal = TERMINAL_FALL_SPEED,
) {
  const step = perTick(1) / (dragMoves * TICKS_PER_MOVE);
  if (body.vy < 0) {
    if (body.vx > step) body.vx -= step;
    else if (body.vx < -step) body.vx += step;
    else body.vx = 0;
  }
  if (body.vy > -perTick(terminal)) body.vy = Math.max(-perTick(terminal), body.vy - step);
}

export function moveDebris(world: World) {
  world.debris = world.debris.filter((piece) => {
    applyDrag(piece, DEBRIS_DRAG_MOVES);
    piece.x += piece.vx;
    piece.y += piece.vy;
    return piece.y > world.terrain.heightAt(piece.x) && piece.x >= 0 && piece.x < world.map.width;
  });
}
