import { CARROT_DEPTH, DONKEY_DEPTH } from './constants';

/**
 * Things on the road. Donkeys block their lane; carrots are there to be
 * collected. Positions are the near edge, the side the car reaches first.
 */
export type HazardKind = 'donkey' | 'carrot';

/**
 * Why a donkey is there, which is also how it looks and behaves:
 * `wave` is Classic Duel's lone donkey, `rival` the one a second player
 * steers, `wobbler` a hesitant donkey that hops between lanes before it
 * commits, `herd` and `boss` belong to a formation.
 */
export type DonkeyRole = 'single' | 'pair' | 'wobbler' | 'herd' | 'boss' | 'wave' | 'rival';

/** A hesitant donkey hops to `lane` when it is `gap` metres from the car. */
export interface WobbleHop {
  gap: number;
  lane: number;
}

export interface Hazard {
  id: number;
  kind: HazardKind;
  role: DonkeyRole | null;
  lane: number;
  position: number;
  depth: number;
  /** Came into view: views draw only revealed hazards. */
  revealed: boolean;
  /** Hops still to come, sorted so the next one is last. */
  hops: WobbleHop[];
  /** Closer than this, a donkey stays in its lane. Views draw the line for the second player. */
  commitGap: number | null;
  committed: boolean;
  /** The car was in this donkey's lane after it came into view. */
  threatened: boolean;
  /** When the car (or the donkey) last left the shared lane: metres, and seconds before a hit. */
  escape: { gap: number; seconds: number; byCar: boolean } | null;
  /** Fully behind the car. */
  passed: boolean;
  hit: boolean;
  collected: boolean;
}

export function makeDonkey(
  id: number,
  position: number,
  lane: number,
  role: DonkeyRole,
  hops: WobbleHop[] = [],
  commitGap: number | null = null,
): Hazard {
  return {
    id,
    kind: 'donkey',
    role,
    lane,
    position,
    depth: DONKEY_DEPTH,
    revealed: false,
    hops: [...hops].sort((a, b) => a.gap - b.gap),
    commitGap,
    committed: commitGap === null,
    threatened: false,
    escape: null,
    passed: false,
    hit: false,
    collected: false,
  };
}

export function makeCarrot(id: number, position: number, lane: number): Hazard {
  return {
    ...makeDonkey(id, position, lane, 'single'),
    kind: 'carrot',
    role: null,
    depth: CARROT_DEPTH,
  };
}
