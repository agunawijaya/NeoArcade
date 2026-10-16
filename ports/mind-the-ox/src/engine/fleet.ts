/**
 * The ships of Carrier Ops as numbers: how long each class is, how high it
 * stands out of the water and how deep it sits, how much punishment it
 * takes, how fast it steams, how far its anti-aircraft guns reach and how
 * often they fire, and what sinking it is worth. Themes dress them; the
 * engine only knows these.
 */
export type ShipKind =
  'carrier' | 'battleship' | 'cruiser' | 'destroyer' | 'supply' | 'torpedo-boat' | 'monitor';

export const SHIP_KINDS: readonly ShipKind[] = [
  'carrier',
  'battleship',
  'cruiser',
  'destroyer',
  'supply',
  'torpedo-boat',
  'monitor',
];

export interface ShipClass {
  /** Bow to stern, world units. */
  length: number;
  /** The hull's height above the waterline: the deck, for a carrier. */
  freeboard: number;
  /** The tallest thing aboard, above the waterline: bridge, funnels, turrets. */
  superstructure: number;
  /** How deep the hull goes: a torpedo running deeper than this passes underneath. */
  draft: number;
  hitPoints: number;
  /** Cruising speed, units a move. */
  speed: number;
  /** Anti-aircraft guns: reach in world units, and a shot every so many moves; null for none. */
  guns: { range: number; everyMoves: number } | null;
  /** Points for sinking one. */
  score: number;
  /** The searchlight on the foremast's platform, along the hull from amidships and up from the waterline; null for none. */
  searchlight: { along: number; height: number } | null;
}

export const SHIP_CLASSES: Readonly<Record<ShipKind, ShipClass>> = {
  carrier: {
    length: 120,
    freeboard: 12,
    superstructure: 12,
    draft: 5,
    hitPoints: 90,
    speed: 0.9,
    guns: { range: 110, everyMoves: 6 },
    score: 600,
    searchlight: null,
  },
  battleship: {
    length: 130,
    freeboard: 10,
    superstructure: 30,
    draft: 7,
    hitPoints: 80,
    speed: 0.7,
    guns: { range: 150, everyMoves: 5 },
    score: 500,
    searchlight: { along: 24, height: 27 },
  },
  cruiser: {
    length: 100,
    freeboard: 9,
    superstructure: 24,
    draft: 5,
    hitPoints: 50,
    speed: 1,
    guns: { range: 130, everyMoves: 5 },
    score: 300,
    searchlight: { along: 22, height: 21 },
  },
  destroyer: {
    length: 70,
    freeboard: 6,
    superstructure: 17,
    draft: 3.5,
    hitPoints: 25,
    speed: 1.3,
    guns: { range: 110, everyMoves: 6 },
    score: 200,
    searchlight: null,
  },
  supply: {
    length: 80,
    freeboard: 8,
    superstructure: 22,
    draft: 4.5,
    hitPoints: 45,
    speed: 0.6,
    guns: null,
    score: 150,
    searchlight: null,
  },
  'torpedo-boat': {
    length: 32,
    freeboard: 4,
    superstructure: 9,
    draft: 1.5,
    hitPoints: 10,
    speed: 1.8,
    guns: { range: 70, everyMoves: 8 },
    score: 100,
    searchlight: null,
  },
  monitor: {
    length: 70,
    freeboard: 5,
    superstructure: 20,
    draft: 3,
    hitPoints: 45,
    speed: 0.5,
    guns: { range: 120, everyMoves: 5 },
    score: 250,
    searchlight: { along: 1, height: 17 },
  },
};
