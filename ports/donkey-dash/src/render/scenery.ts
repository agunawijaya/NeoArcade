import type { Palette, PropKind } from './palette';

/**
 * What stands beside the road, worked out from the road position alone, so a
 * tree is always in the same place however often it scrolls by, in every
 * view. Purely decoration: nothing here is anywhere near a lane.
 */
export interface Prop {
  /** Metres along the road. */
  along: number;
  /** -1 left of the road, 1 right. */
  side: -1 | 1;
  /** Metres beyond the road's edge. */
  offset: number;
  kind: PropKind;
  /** 0…1, for size and colour variety. */
  variant: number;
}

/** Metres between chances of a prop, on each side. */
const DEFAULT_SPACING = 4.5;
/** Big buildings only stand well back from the road. */
const LANDMARKS = new Set<PropKind>(['barn', 'windmill', 'mesa']);

export function propsBetween(
  palette: Palette,
  from: number,
  to: number,
  farthest = 24,
  spacing = DEFAULT_SPACING,
): Prop[] {
  const props: Prop[] = [];
  for (let slot = Math.floor(from / spacing); slot * spacing < to; slot++) {
    for (const side of [-1, 1] as const) {
      const roll = hash(slot * 2 + (side === 1 ? 1 : 0));
      if (roll > 0.62) continue;
      const kind = pickKind(palette.props, hash(slot * 7 + side * 3 + 1));
      const landmark = LANDMARKS.has(kind);
      if (landmark && hash(slot * 13 + side) > 0.18) continue;
      const near = landmark ? 9 : 1.4;
      const offset = near + hash(slot * 5 + side * 11 + 2) * (farthest - near);
      props.push({
        along: slot * spacing + hash(slot * 3 + side) * spacing * 0.8,
        side,
        offset,
        kind,
        variant: hash(slot * 17 + side * 5 + 4),
      });
    }
  }
  return props;
}

/** Fence runs: a fence stands on this side for the 40 m stretch containing `along`. */
export function hasFence(palette: Palette, along: number, side: -1 | 1): boolean {
  if (!palette.props.includes('fence')) return false;
  return hash(Math.floor(along / 40) * 2 + (side === 1 ? 1 : 0) + 991) < 0.55;
}

/** Telegraph poles march along the left side, every 28 m. */
export const POLE_SPACING = 28;

export function polesBetween(palette: Palette, from: number, to: number): number[] {
  if (!palette.props.includes('pole')) return [];
  const poles: number[] = [];
  for (let index = Math.ceil(from / POLE_SPACING); index * POLE_SPACING < to; index++) {
    poles.push(index * POLE_SPACING);
  }
  return poles;
}

/** The earlier a kind is listed in the palette, the more often it appears. */
function pickKind(kinds: readonly PropKind[], roll: number): PropKind {
  const usable = kinds.filter((kind) => kind !== 'fence' && kind !== 'pole');
  const weights = usable.map((_, index) => usable.length - index);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let left = roll * total;
  for (let index = 0; index < usable.length; index++) {
    left -= weights[index] as number;
    if (left <= 0) return usable[index] as PropKind;
  }
  return usable.at(-1) ?? 'bush';
}

/** A stable 0…1 value for an integer. */
export function hash(value: number): number {
  let h = Math.imul((value | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
