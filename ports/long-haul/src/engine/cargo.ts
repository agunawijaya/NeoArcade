/**
 * The three loads waiting at the terminal (lines 1030–1060), and what they
 * pay on delivery (lines 5200–5360).
 */
export type CargoId = 'oranges' | 'freight' | 'mail';

export interface Cargo {
  id: CargoId;
  name: string;
  /** What the dispatcher says about it, in the original's words. */
  pitch: string;
  /** Pay on delivery, in cents per pound. */
  centsPerPound: number;
  /** Rides in a refrigerated trailer whose unit can fail and which burns diesel while parked. */
  refrigerated: boolean;
  /** Pays less when it arrives after the cutoff. */
  deadline: boolean;
}

export const CARGO: Readonly<Record<CargoId, Cargo>> = {
  oranges: {
    id: 'oranges',
    name: 'Oranges',
    pitch: "Highest profit if they don't spoil.",
    centsPerPound: 6.5,
    refrigerated: true,
    deadline: false,
  },
  freight: {
    id: 'freight',
    name: 'Freight forwarding',
    pitch: 'Penalty for late delivery.',
    centsPerPound: 5,
    refrigerated: false,
    deadline: true,
  },
  mail: {
    id: 'mail',
    name: 'U.S. Mail',
    pitch: 'Lowest rate, but no hurry to arrive.',
    centsPerPound: 4.75,
    refrigerated: false,
    deadline: false,
  },
};

export const CARGO_IDS: readonly CargoId[] = ['oranges', 'freight', 'mail'];

/** The original's cargo number CT. */
export function cargoNumber(cargo: CargoId): 1 | 2 | 3 {
  return cargo === 'oranges' ? 1 : cargo === 'freight' ? 2 : 3;
}
