import { previewTurn } from '../../src/engine/match';
import { judgeThrow } from '../../src/tricks/judge';
import type { BuiltPuzzle } from '../../src/tricks/puzzle';

/**
 * Every throw a player could aim at a puzzle, tried and sorted: which solve
 * it, which solve it with style. The share of the grid that solves is the
 * best measure of how hard a puzzle is; the lab draws it as a map.
 */
export type Outcome = 'miss' | 'solved' | 'styled' | 'selfHit';

export interface SolutionMap {
  angles: number[];
  velocities: number[];
  /** outcomes[angleIndex][velocityIndex] */
  outcomes: Outcome[][];
}

export interface Grid {
  angleStep: number;
  velocityStep: number;
  maxAngle: number;
  maxVelocity: number;
}

export const FINE: Grid = { angleStep: 0.5, velocityStep: 1, maxAngle: 180, maxVelocity: 200 };
export const COARSE: Grid = { angleStep: 1, velocityStep: 2, maxAngle: 180, maxVelocity: 200 };

export function outcomeOf(built: BuiltPuzzle, angle: number, velocity: number): Outcome {
  const shot = previewTurn(built.start(), { angle, velocity, usePowerUp: true });
  const verdict = judgeThrow(built, shot);
  if (verdict.failure === 'selfHit') return 'selfHit';
  if (!verdict.solved) return 'miss';
  return verdict.styled ? 'styled' : 'solved';
}

/** Scans one row of angles at a time, so a page can draw as it goes. */
export function* scanPuzzle(built: BuiltPuzzle, grid: Grid): Generator<SolutionMap> {
  const angles: number[] = [];
  const velocities: number[] = [];
  for (let velocity = 1; velocity <= grid.maxVelocity; velocity += grid.velocityStep) {
    velocities.push(velocity);
  }
  const map: SolutionMap = { angles, velocities, outcomes: [] };
  for (let angle = 0; angle <= grid.maxAngle; angle += grid.angleStep) {
    angles.push(angle);
    map.outcomes.push(velocities.map((velocity) => outcomeOf(built, angle, velocity)));
    yield map;
  }
}

export interface Summary {
  /** Share of the grid that solves the puzzle, 0–1. */
  solved: number;
  styled: number;
  /** The middle of the widest run of solving throws, a comfortable reference solution. */
  widest: { angle: number; velocity: number; width: number } | null;
}

export function summarise(map: SolutionMap): Summary {
  let solved = 0;
  let styled = 0;
  let widest: Summary['widest'] = null;
  const cells = map.angles.length * map.velocities.length;
  map.outcomes.forEach((row, angleIndex) => {
    let run = 0;
    row.forEach((outcome, velocityIndex) => {
      if (outcome === 'solved' || outcome === 'styled') solved++;
      if (outcome === 'styled') {
        styled++;
        run++;
        if (!widest || run > widest.width) {
          const middle = velocityIndex - Math.floor((run - 1) / 2);
          widest = {
            angle: map.angles[angleIndex] as number,
            velocity: map.velocities[middle] as number,
            width: run,
          };
        }
      } else {
        run = 0;
      }
    });
  });
  return { solved: solved / cells, styled: styled / cells, widest };
}
