import type { Rng } from '@shared/rng';
import { WORLD_WIDTH } from './constants';
import type { Circle } from './geometry';

export type PowerUpKind = 'golden' | 'tri' | 'calm' | 'bouncer' | 'shield';

export interface PowerUpInfo {
  name: string;
  /** One line for the HUD and the player's guide. */
  effect: string;
}

export const POWER_UPS: Record<PowerUpKind, PowerUpInfo> = {
  golden: { name: 'Golden Banana', effect: 'Double blast radius; can knock off a roof section.' },
  tri: { name: 'Tri-Banana', effect: 'Splits into three at the top of its arc.' },
  calm: { name: 'Calm Air', effect: 'No wind for this throw.' },
  bouncer: { name: 'Bouncer', effect: 'Bounces once off a building before exploding.' },
  shield: { name: 'Rooftop Shield', effect: 'Absorbs one hit on your gorilla this round.' },
};

export const POWER_UP_KINDS = Object.keys(POWER_UPS) as PowerUpKind[];

/**
 * A crate hanging under a balloon. It hovers while players aim and drifts
 * with the wind only while a banana is in the air, so what you aim at is
 * where it is.
 */
export interface Balloon {
  x: number;
  y: number;
  /** World units moved per simulation step. */
  drift: number;
  kind: PowerUpKind;
}

const SPAWN_CHANCE = 0.3;
/** How strongly the wind carries a balloon, in world units per step per unit of wind. */
const DRIFT_PER_WIND = 0.06;
const CALM_DRIFT = 0.12;
const BALLOON_RADIUS = 8;
const CRATE_RADIUS = 5;
const CRATE_DROP = 15;

/** Occasionally sends a balloon in from the side the wind blows from. */
export function maybeSpawnBalloon(
  rng: Rng,
  wind: number,
  kinds: readonly PowerUpKind[],
): Balloon | null {
  // Calm Air is no prize where the air is already still.
  const offered = wind === 0 ? kinds.filter((kind) => kind !== 'calm') : kinds;
  if (offered.length === 0 || !rng.chance(SPAWN_CHANCE)) return null;
  const drift = wind === 0 ? (rng.chance(0.5) ? CALM_DRIFT : -CALM_DRIFT) : wind * DRIFT_PER_WIND;
  const x = drift > 0 ? rng.float(60, 200) : rng.float(WORLD_WIDTH - 200, WORLD_WIDTH - 60);
  return { x, y: rng.float(55, 100), drift, kind: rng.pick(offered) };
}

export function balloonAt(balloon: Balloon, steps: number): Balloon {
  return { ...balloon, x: balloon.x + balloon.drift * steps };
}

export function balloonOnScreen(balloon: Balloon): boolean {
  return balloon.x > -20 && balloon.x < WORLD_WIDTH + 20;
}

/** The balloon and the crate below it are both targets. */
export function balloonHitShapes(balloon: Balloon): Circle[] {
  return [
    { x: balloon.x, y: balloon.y, radius: BALLOON_RADIUS },
    { x: balloon.x, y: balloon.y + CRATE_DROP, radius: CRATE_RADIUS },
  ];
}
