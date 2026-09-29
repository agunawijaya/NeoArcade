import { IMPOSSIBLE } from './packs/impossible';
import { TRICK_ARCS } from './packs/trick-arcs';
import { WARM_UP } from './packs/warm-up';
import { WIND_READERS } from './packs/wind-readers';
import type { Puzzle } from './puzzle';

/**
 * Trick Shot's four packs of six. Each pack teaches one idea and builds it
 * up: the first puzzle shows it plainly, the last asks for it under
 * pressure.
 */
export interface Pack {
  id: string;
  name: string;
  /** The one idea the pack teaches, a few words for the pack map. */
  idea: string;
  /** A line under the name. */
  blurb: string;
  /** The pack's colour on the map. */
  colour: string;
  puzzles: readonly Puzzle[];
}

export const PACKS: readonly Pack[] = [WARM_UP, WIND_READERS, TRICK_ARCS, IMPOSSIBLE];

export const PUZZLES: readonly Puzzle[] = PACKS.flatMap((pack) => pack.puzzles);

export function packOf(puzzle: Puzzle): Pack {
  const pack = PACKS.find((candidate) => candidate.puzzles.includes(puzzle));
  if (!pack) throw new Error(`Puzzle ${puzzle.id} is in no pack.`);
  return pack;
}
