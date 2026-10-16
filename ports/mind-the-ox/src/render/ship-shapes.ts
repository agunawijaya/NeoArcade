import { SHIP_CLASSES, type ShipKind } from '../engine/fleet';
import { hullFacing } from '../engine/ships';
import type { Ship } from '../engine/world';

/**
 * Where everything stands on each class of ship, so the side view, the
 * diorama and the funnel smoke all agree. Positions are world units along
 * the hull from its middle, positive towards the bow; heights are over the
 * deck.
 */
export interface Funnel {
  at: number;
  height: number;
  width: number;
  /** Raked back a little, units of lean over its height. */
  rake: number;
}

export interface Turret {
  at: number;
  /** +1 guns towards the bow, −1 towards the stern. */
  facing: 1 | -1;
  size: number;
  /** Raised on a barbette over the turret in front, for superfiring. */
  raised: number;
}

export interface Mast {
  at: number;
  height: number;
  tripod: boolean;
}

export interface Block {
  at: number;
  width: number;
  height: number;
}

/**
 * A carrier's island: its house, bridge, funnel and mast, standing on the
 * starboard edge of the flight deck clear of the planes' path down the
 * middle. Positions along the hull as for the rest; the funnel's and the
 * mast's heights are over the house's roof.
 */
export interface Island {
  at: number;
  length: number;
  /** Across the deck. */
  width: number;
  /** The house, from the flight deck to its roof. */
  height: number;
  bridge: Block;
  funnel: Funnel;
  mast: Mast;
}

export interface ShipLayout {
  length: number;
  freeboard: number;
  draft: number;
  /** How far the bow rises over the deck line, and how far it rakes forward at the waterline. */
  sheer: number;
  bowRake: number;
  funnels: readonly Funnel[];
  turrets: readonly Turret[];
  masts: readonly Mast[];
  /** The bridge and deckhouses, back to front. */
  houses: readonly Block[];
  island: Island | null;
}

function base(kind: ShipKind) {
  const { length, freeboard, draft } = SHIP_CLASSES[kind];
  return { length, freeboard, draft };
}

const LAYOUTS: Readonly<Record<ShipKind, ShipLayout>> = {
  // A flight deck from end to end, with the island forward of amidships on its starboard edge.
  carrier: {
    ...base('carrier'),
    sheer: 0,
    bowRake: 4,
    funnels: [],
    turrets: [],
    masts: [],
    houses: [],
    island: {
      at: 20,
      length: 18,
      width: 4.5,
      height: 6,
      bridge: { at: 25, width: 9, height: 2.6 },
      funnel: { at: 14, height: 9, width: 5, rake: 1.2 },
      mast: { at: 27, height: 10, tripod: true },
    },
  },
  battleship: {
    ...base('battleship'),
    sheer: 3,
    bowRake: 5,
    funnels: [
      { at: 14, height: 15, width: 5, rake: 1.2 },
      { at: -2, height: 15, width: 5, rake: 1.2 },
    ],
    turrets: [
      { at: 48, facing: 1, size: 8, raised: 0 },
      { at: 37, facing: 1, size: 8, raised: 3 },
      { at: -34, facing: -1, size: 8, raised: 3 },
      { at: -46, facing: -1, size: 8, raised: 0 },
    ],
    masts: [
      { at: 24, height: 27, tripod: true },
      { at: -18, height: 18, tripod: false },
    ],
    houses: [
      { at: -12, width: 16, height: 5 },
      { at: 23, width: 14, height: 9 },
    ],
    island: null,
  },
  cruiser: {
    ...base('cruiser'),
    sheer: 2.5,
    bowRake: 4,
    funnels: [
      { at: 10, height: 12, width: 4, rake: 1 },
      { at: 0, height: 12, width: 4, rake: 1 },
      { at: -10, height: 12, width: 4, rake: 1 },
    ],
    turrets: [
      { at: 36, facing: 1, size: 6, raised: 0 },
      { at: -36, facing: -1, size: 6, raised: 0 },
    ],
    masts: [
      { at: 22, height: 20, tripod: false },
      { at: -22, height: 16, tripod: false },
    ],
    houses: [{ at: 21, width: 10, height: 6 }],
    island: null,
  },
  destroyer: {
    ...base('destroyer'),
    sheer: 2.5,
    bowRake: 4,
    funnels: [
      { at: 10, height: 9, width: 2.6, rake: 1 },
      { at: 3, height: 9, width: 2.6, rake: 1 },
      { at: -4, height: 9, width: 2.6, rake: 1 },
    ],
    turrets: [
      { at: 28, facing: 1, size: 3.5, raised: 0 },
      { at: -29, facing: -1, size: 3.5, raised: 0 },
    ],
    masts: [{ at: 17, height: 13, tripod: false }],
    houses: [{ at: 18, width: 7, height: 4 }],
    island: null,
  },
  supply: {
    ...base('supply'),
    sheer: 3,
    bowRake: 3,
    funnels: [{ at: -6, height: 13, width: 5, rake: 0.6 }],
    turrets: [],
    masts: [
      { at: 24, height: 20, tripod: false },
      { at: -26, height: 18, tripod: false },
    ],
    houses: [
      { at: -30, width: 10, height: 4 },
      { at: 2, width: 18, height: 7 },
    ],
    island: null,
  },
  'torpedo-boat': {
    ...base('torpedo-boat'),
    sheer: 1.5,
    bowRake: 2,
    funnels: [{ at: -1, height: 5, width: 2, rake: 0.6 }],
    turrets: [{ at: 10, facing: 1, size: 2.2, raised: 0 }],
    masts: [{ at: 5, height: 7, tripod: false }],
    houses: [{ at: 5, width: 5, height: 2.5 }],
    island: null,
  },
  monitor: {
    ...base('monitor'),
    sheer: 1,
    bowRake: 3,
    funnels: [{ at: -8, height: 10, width: 4, rake: 0.8 }],
    turrets: [{ at: 14, facing: 1, size: 12, raised: 2 }],
    masts: [{ at: 1, height: 17, tripod: true }],
    houses: [{ at: 0, width: 10, height: 5 }],
    island: null,
  },
};

export function shipLayout(kind: ShipKind): ShipLayout {
  return LAYOUTS[kind];
}

/** Warships carry a raised forecastle forward, broken this far from the middle; a carrier's deck runs flat. */
export function forecastleOf(kind: ShipKind): { forecastle: number; breakAt: number } {
  const { length, freeboard } = LAYOUTS[kind];
  return {
    forecastle: kind === 'carrier' ? 0 : Math.min(3, freeboard * 0.35),
    breakAt: length / 2 - length * 0.32,
  };
}

/** The deck's height over the waterline at a point along the hull: on the forecastle, or the main deck. */
export function deckOver(kind: ShipKind, at: number): number {
  const { forecastle, breakAt } = forecastleOf(kind);
  return LAYOUTS[kind].freeboard + (at > breakAt ? forecastle : 0);
}

/**
 * Where along the line of play a point `at` units towards the bow stands,
 * this moment: the hull foreshortens as the ship turns.
 */
export function alongShip(ship: Ship, at: number): number {
  return ship.x + ship.direction * at * hullFacing(ship);
}

/** The top of each funnel in the world, for the smoke to pour from. */
export function funnelTops(ship: Ship): { x: number; y: number }[] {
  const layout = LAYOUTS[ship.kind];
  const deck = ship.y + layout.freeboard;
  const tops = layout.funnels.map((funnel) => ({
    x: alongShip(ship, funnel.at - funnel.rake),
    y: deck + funnel.height,
  }));
  const { island } = layout;
  if (island)
    tops.push({
      x: alongShip(ship, island.funnel.at - island.funnel.rake),
      y: deck + island.height + island.funnel.height,
    });
  return tops;
}
