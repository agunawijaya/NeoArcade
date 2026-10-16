import type { ShipKind } from './fleet';
import type { RaiderKind, Side, TargetKind } from './map';
import type { ShipHitCause } from './ships';

/**
 * Everything worth a sound, a picture or a badge, reported by the tick it
 * happened in. The engine never plays or draws anything itself.
 */
export type GameEvent =
  | { type: 'gun'; plane: number; x: number; y: number }
  | { type: 'target-gun'; target: number; x: number; y: number }
  | { type: 'bomb-away'; plane: number; x: number; y: number }
  | { type: 'missile-away'; plane: number; x: number; y: number }
  | { type: 'starburst'; plane: number; x: number; y: number }
  | { type: 'explosion'; x: number; y: number; size: 'small' | 'large' | 'huge' }
  | { type: 'crater'; x: number; y: number; cause: 'bomb' | 'missile' | 'crash'; by: Side | null }
  | { type: 'target-hit'; target: number; x: number; y: number }
  | {
      type: 'target-destroyed';
      target: number;
      kind: TargetKind;
      side: Side;
      by: Side | null;
      x: number;
      y: number;
    }
  | { type: 'plane-wounded'; plane: number; by: WoundCause }
  | {
      type: 'plane-down';
      plane: number;
      side: Side;
      cause: DownCause;
      /** The side that brought it down, if anyone did. */
      by: Side | null;
      x: number;
      y: number;
    }
  | { type: 'bailout'; plane: number; side: Side; x: number; y: number; vx: number; vy: number }
  | {
      type: 'crash';
      plane: number;
      side: Side;
      x: number;
      y: number;
      atHome: boolean;
      stalled: boolean;
    }
  | { type: 'stall'; plane: number }
  | { type: 'recovered'; plane: number }
  | { type: 'takeoff'; plane: number }
  | { type: 'landed'; plane: number; fuel: number }
  | { type: 'refuelled'; plane: number }
  | { type: 'respawn'; plane: number }
  | { type: 'out'; plane: number }
  | { type: 'ghost'; plane: number }
  | { type: 'convoy-escaped'; target: number; x: number; y: number }
  | { type: 'splat'; plane: number; kind: 'bird' | 'hole' | 'ox' }
  | { type: 'bird-hit'; x: number; y: number; by: Side | null }
  | { type: 'flock-scattered'; x: number; y: number }
  | { type: 'ox-hit'; ox: number; x: number; y: number; by: Side | null }
  | { type: 'ox-startled'; ox: number }
  | { type: 'missile-decoyed'; missile: number }
  | { type: 'score'; side: Side; points: number; reason: ScoreReason }
  | { type: 'round-won'; side: Side; bonus: number }
  | { type: 'game-over'; round: number }
  // At sea.
  | { type: 'splash'; x: number; y: number; size: 'small' | 'large' }
  | {
      type: 'ditched';
      plane: number;
      side: Side;
      x: number;
      y: number;
      /** The destroyer that picks the pilot up, or null when nobody is near enough. */
      rescuedBy: number | null;
    }
  | { type: 'trap'; plane: number; ship: number; wire: number }
  | { type: 'bolter'; plane: number; ship: number }
  | { type: 'touch-and-go'; plane: number; ship: number }
  | { type: 'hard-landing'; plane: number; ship: number }
  | { type: 'ship-turn'; ship: number }
  | { type: 'ship-gun'; ship: number; x: number; y: number }
  | { type: 'flak-burst'; x: number; y: number }
  | { type: 'ship-hit'; ship: number; x: number; y: number; cause: ShipHitCause; by: Side | null }
  | { type: 'ship-sinking'; ship: number; kind: ShipKind; side: Side; by: Side | null; x: number }
  | { type: 'ship-sunk'; ship: number }
  | { type: 'ship-escaped'; ship: number; x: number }
  | { type: 'torpedo-away'; plane: number | null; ship: number | null; x: number; y: number }
  | { type: 'torpedo-running'; torpedo: number; x: number; y: number }
  | { type: 'torpedo-broke'; x: number; y: number }
  | {
      type: 'torpedo-hit';
      ship: number;
      x: number;
      y: number;
      by: Side;
      /** How far it ran from where it was dropped. */
      distance: number;
    }
  | { type: 'raid'; side: Side; kind: RaiderKind; x: number; count: number }
  | { type: 'raider-gun'; raider: number; x: number; y: number }
  | { type: 'raider-hit'; raider: number; x: number; y: number }
  | {
      type: 'raider-down';
      raider: number;
      kind: RaiderKind;
      side: Side;
      by: Side | null;
      x: number;
      y: number;
    }
  | { type: 'raider-bombs'; raider: number; ship: number; x: number; y: number }
  | { type: 'gate'; plane: number; index: number; x: number; y: number };

/**
 * What brought a plane down: a second wound (from a bullet, a bird or an
 * ox), another plane, flying wreckage, a bomb or missile, a target or a
 * ship flown into, or an empty tank.
 */
export type DownCause = WoundCause | 'rammed' | 'wreckage' | 'bomb' | 'target' | 'ship' | 'fuel';

/**
 * What wounds a plane: a bullet from a plane, fire from a target on the
 * ground (or a ship, or a bomber's gunner), a bird, an ox, a hard landing
 * on a deck.
 */
export type WoundCause = 'shot' | 'flak' | 'bird' | 'ox' | 'deck';

export type ScoreReason =
  | 'target'
  | 'depot'
  | 'own-target'
  | 'plane'
  | 'lost-plane'
  | 'bird'
  | 'ox'
  | 'bonus'
  | 'ship'
  | 'own-ship'
  | 'raider';
