import { PACKS, PUZZLES, type Pack } from './packs';
import type { Puzzle } from './puzzle';

/**
 * Trick Shot's save and its rules of progress, all pure. Stored under
 * `neoarcade:skyline-showdown:tricks`, versioned like the tour's save.
 *
 * Stars: one for solving a puzzle, one for solving it within its par of
 * attempts in one visit, one for the style goal. The best ever is kept.
 * The first pack is open; each next one opens once four puzzles of the
 * pack before it are solved, so one stubborn puzzle never blocks the way.
 */
export const TRICKS_KEY = 'tricks';
export const TRICKS_VERSION = 1;
export const PACK_OPENS_AFTER = 4;
export const MAX_TRICK_STARS = PUZZLES.length * 3;

export interface PuzzleRecord {
  solved: boolean;
  /** Fewest attempts it took to solve it in one visit. */
  fewestAttempts: number | null;
  /** The style goal was met on a solving throw. */
  styled: boolean;
}

export interface TrickSave {
  version: typeof TRICKS_VERSION;
  puzzles: Record<string, PuzzleRecord>;
}

export interface TrickStars {
  solved: boolean;
  par: boolean;
  style: boolean;
}

export function emptyTricks(): TrickSave {
  return { version: TRICKS_VERSION, puzzles: {} };
}

/** Whatever was stored, as a valid save; unknown puzzles and bad values are dropped. */
export function loadTricks(raw: unknown): TrickSave {
  const save = emptyTricks();
  if (typeof raw !== 'object' || raw === null || (raw as TrickSave).version !== TRICKS_VERSION) {
    return save;
  }
  const stored = (raw as { puzzles?: unknown }).puzzles;
  if (typeof stored !== 'object' || stored === null) return save;
  for (const puzzle of PUZZLES) {
    const record = (stored as Record<string, unknown>)[puzzle.id];
    if (typeof record !== 'object' || record === null) continue;
    const { solved, fewestAttempts, styled } = record as Record<string, unknown>;
    save.puzzles[puzzle.id] = {
      solved: solved === true,
      fewestAttempts:
        typeof fewestAttempts === 'number' && fewestAttempts >= 1
          ? Math.floor(fewestAttempts)
          : null,
      styled: solved === true && styled === true,
    };
  }
  return save;
}

export function starsOf(puzzle: Puzzle, record: PuzzleRecord | undefined): TrickStars {
  return {
    solved: record?.solved === true,
    par: record?.fewestAttempts != null && record.fewestAttempts <= puzzle.par,
    style: record?.styled === true,
  };
}

export function starCount(stars: TrickStars): number {
  return Number(stars.solved) + Number(stars.par) + Number(stars.style);
}

export function puzzleStars(save: TrickSave, puzzle: Puzzle): number {
  return starCount(starsOf(puzzle, save.puzzles[puzzle.id]));
}

export function totalTrickStars(save: TrickSave): number {
  return PUZZLES.reduce((sum, puzzle) => sum + puzzleStars(save, puzzle), 0);
}

export function solvedIn(save: TrickSave, pack: Pack): number {
  return pack.puzzles.filter((puzzle) => save.puzzles[puzzle.id]?.solved).length;
}

export function packUnlocked(save: TrickSave, pack: Pack): boolean {
  const index = PACKS.indexOf(pack);
  if (index <= 0) return true;
  return solvedIn(save, PACKS[index - 1] as Pack) >= PACK_OPENS_AFTER;
}

/** The puzzle the pack map points at: the first open one not yet solved. */
export function nextPuzzle(save: TrickSave): Puzzle | null {
  for (const pack of PACKS) {
    if (!packUnlocked(save, pack)) break;
    const open = pack.puzzles.find((puzzle) => !save.puzzles[puzzle.id]?.solved);
    if (open) return open;
  }
  return null;
}

export interface Solve {
  /** Attempts in this visit, the solving one included. */
  attempts: number;
  styled: boolean;
}

export interface PuzzleRecorded {
  save: TrickSave;
  /** What this very solve earned, before comparing with the best. */
  earned: TrickStars;
  /** Stars added to the total (only improvements count). */
  newStars: number;
  firstSolve: boolean;
  /** Packs this solve opened. */
  opened: Pack[];
  allSolved: boolean;
  allThreeStars: boolean;
}

/** Folds a solve into the save; the input save is left untouched. */
export function recordSolve(save: TrickSave, puzzle: Puzzle, solve: Solve): PuzzleRecorded {
  const before = save.puzzles[puzzle.id];
  const next: TrickSave = structuredClone(save);
  next.puzzles[puzzle.id] = {
    solved: true,
    fewestAttempts:
      before?.fewestAttempts != null
        ? Math.min(before.fewestAttempts, solve.attempts)
        : solve.attempts,
    styled: (before?.styled ?? false) || solve.styled,
  };
  return {
    save: next,
    earned: { solved: true, par: solve.attempts <= puzzle.par, style: solve.styled },
    newStars: totalTrickStars(next) - totalTrickStars(save),
    firstSolve: !before?.solved,
    opened: PACKS.filter((pack) => !packUnlocked(save, pack) && packUnlocked(next, pack)),
    allSolved: PUZZLES.every((candidate) => next.puzzles[candidate.id]?.solved),
    allThreeStars: totalTrickStars(next) === MAX_TRICK_STARS,
  };
}
