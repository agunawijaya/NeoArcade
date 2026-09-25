import type { Point } from '../engine/geometry';
import type { PlayerIndex } from '../engine/gorillas';

/** What a player is about to throw: degrees from their own side, and power (velocity). */
export interface Aim {
  angle: number;
  power: number;
}

export const AIM_LIMITS = { angle: { min: 0, max: 180 }, power: { min: 0, max: 200 } } as const;

/** Power gained per world unit of slingshot pull. */
const POWER_PER_UNIT = 1.35;
/** A pull shorter than this cancels the throw. */
export const DEAD_ZONE = 6;

export function clampAim(aim: Aim): Aim {
  return {
    angle: Math.min(AIM_LIMITS.angle.max, Math.max(AIM_LIMITS.angle.min, aim.angle)),
    power: Math.min(AIM_LIMITS.power.max, Math.max(AIM_LIMITS.power.min, aim.power)),
  };
}

/**
 * Slingshot aiming: drag back from the gorilla and the banana flies the
 * other way. The angle is measured from the thrower's own side, like the
 * numbers the original asked for.
 */
export function aimFromDrag(player: PlayerIndex, hand: Point, pointer: Point): Aim | null {
  const pullX = hand.x - pointer.x;
  const pullY = hand.y - pointer.y;
  const length = Math.hypot(pullX, pullY);
  if (length < DEAD_ZONE) return null;
  const world = (Math.atan2(-pullY, pullX) * 180) / Math.PI;
  // Straight-down pulls throw along the roof rather than flipping backwards.
  const upward = world < 0 ? (world < -90 ? 180 : 0) : world;
  const angle = player === 0 ? upward : 180 - upward;
  return clampAim({
    angle: Math.round(angle * 10) / 10,
    power: Math.round(length * POWER_PER_UNIT),
  });
}

/**
 * Keyboard and gamepad steering: "left" swings the throw towards the left of
 * the screen whichever way the gorilla faces, so the arm always moves the
 * way the key points.
 */
export function swing(player: PlayerIndex, aim: Aim, towardsLeft: number): Aim {
  const change = player === 0 ? towardsLeft : -towardsLeft;
  return clampAim({ ...aim, angle: Math.round((aim.angle + change) * 10) / 10 });
}

export function formatAim(aim: Aim): string {
  return `${aim.angle.toFixed(aim.angle % 1 === 0 ? 0 : 1)}° · ${Math.round(aim.power)}`;
}
