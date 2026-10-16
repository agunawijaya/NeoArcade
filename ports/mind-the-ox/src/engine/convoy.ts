import { perTick } from './constants';
import type { World } from './world';

/** Convoy lorries crawl along at well under half a unit a move. */
export const CONVOY_SPEED = 0.45;

/**
 * Moves the convoy's lorries along the ground towards their destination.
 * One that arrives gets away: it no longer stands to be bombed, and nobody
 * is paid for it.
 */
export function driveConvoys(world: World) {
  for (const target of world.targets) {
    if (!target.standing || target.drivesTo === null) continue;
    const remaining = target.drivesTo - target.x;
    const step = perTick(CONVOY_SPEED);
    if (Math.abs(remaining) <= step) {
      target.x = target.drivesTo;
      target.standing = false;
      target.escaped = true;
      world.events.push({ type: 'convoy-escaped', target: target.id, x: target.x, y: target.y });
      continue;
    }
    target.x += remaining > 0 ? step : -step;
    target.y = world.terrain.heightAt(target.x);
  }
}
