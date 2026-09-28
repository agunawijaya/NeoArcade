import type { Palette } from './palette';
import { hash } from './scenery';

/**
 * The land either side of the road, cut into parcels like farmland seen
 * from a hill: pasture, rows of crops, wildflower meadow, ploughed earth.
 * Each look swaps them for its own ground (scrub and sand in the desert,
 * snowfields on the Snow Road). Worked out from the road position alone.
 */
export type ParcelKind = 'pasture' | 'crop' | 'meadow' | 'plough';

export interface Parcel {
  from: number;
  to: number;
  side: -1 | 1;
  kind: ParcelKind;
  /** Where the parcel's ground colour comes from. */
  colour: string;
  texture: string;
  /** A hedge or a fence along its near edge. */
  hedge: boolean;
}

export const PARCEL_LENGTH = 34;

export function parcelsBetween(palette: Palette, from: number, to: number): Parcel[] {
  const parcels: Parcel[] = [];
  for (let index = Math.floor(from / PARCEL_LENGTH); index * PARCEL_LENGTH < to; index++) {
    for (const side of [-1, 1] as const) parcels.push(parcelAt(palette, index, side));
  }
  return parcels;
}

/** The parcel a road position runs past, on one side. */
export function parcelBeside(palette: Palette, position: number, side: -1 | 1): Parcel {
  return parcelAt(palette, Math.floor(position / PARCEL_LENGTH), side);
}

function parcelAt(palette: Palette, index: number, side: -1 | 1): Parcel {
  const roll = hash(index * 2 + (side === 1 ? 1 : 0) + 7777);
  const kind: ParcelKind =
    roll < 0.4 ? 'pasture' : roll < 0.65 ? 'crop' : roll < 0.85 ? 'meadow' : 'plough';
  const [colour, texture] = groundOf(palette, kind);
  return {
    from: index * PARCEL_LENGTH,
    to: (index + 1) * PARCEL_LENGTH,
    side,
    kind,
    colour,
    texture,
    hedge: hash(index * 5 + side + 31) < 0.55,
  };
}

function groundOf(palette: Palette, kind: ParcelKind): [string, string] {
  const [base, light, dark] = palette.grass;
  switch (kind) {
    case 'pasture':
      return [base, dark];
    case 'crop':
      return [palette.crop, dark];
    case 'meadow':
      return [light, palette.accent];
    case 'plough':
      return palette.look === 'snow' ? [light, '#c9d3e6'] : [palette.verge, palette.mud];
  }
}
