import { STREET_Y, WORLD_WIDTH } from '../engine/constants';
import { previewTurn } from '../engine/match';
import { HIGHEST_ROOF } from '../engine/skyline';
import { AIM_LIMITS } from '../game/aim';
import { judgeThrow } from './judge';
import { buildPuzzle, type Puzzle } from './puzzle';

/**
 * Everything that can be wrong with a puzzle, in words: the tests fail on
 * any of these, and the puzzle lab shows them while a puzzle is designed.
 * The last check replays the stored solution: every puzzle must be
 * solvable, with style, by a throw a player could make.
 */
export function puzzleProblems(puzzle: Puzzle): string[] {
  const problems = [...textProblems(puzzle), ...setupProblems(puzzle)];
  if (problems.length > 0) return problems;
  return solutionProblems(puzzle);
}

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const LIMITS = { name: 24, brief: 90, hint: 90 };

function textProblems(puzzle: Puzzle): string[] {
  const problems: string[] = [];
  if (!ID.test(puzzle.id)) problems.push('The id must be kebab-case.');
  for (const field of ['name', 'brief', 'hint'] as const) {
    const text = puzzle[field];
    if (text.trim().length === 0 || text.length > LIMITS[field]) {
      problems.push(`The ${field} must be 1–${LIMITS[field]} characters.`);
    }
  }
  return problems;
}

function setupProblems(puzzle: Puzzle): string[] {
  const problems: string[] = [];
  const { city, stand, targets, rule, style, powerUp, hazards, wind } = puzzle;

  if (!Number.isInteger(wind) || Math.abs(wind) > 20)
    problems.push('The wind must be a whole number from −20 to 20.');
  if (puzzle.world === 'moon' && wind !== 0) problems.push('There is no wind on the Moon.');
  if (!Number.isInteger(puzzle.par) || puzzle.par < 1)
    problems.push('Par must be 1 or more attempts.');

  let buildings = 0;
  if (city.blocks) {
    buildings = city.blocks.length;
    const width = city.blocks.reduce((sum, [blockWidth]) => sum + blockWidth + 2, 2);
    if (width > WORLD_WIDTH)
      problems.push(`The blocks are ${width} wide; the city is ${WORLD_WIDTH}.`);
    for (const [blockWidth, height] of city.blocks) {
      if (blockWidth < 20 || blockWidth > 120) problems.push('Every block must be 20–120 wide.');
      if (height < 10 || height > STREET_Y - HIGHEST_ROOF) {
        problems.push(`Every block must be 10–${STREET_Y - HIGHEST_ROOF} tall.`);
      }
    }
  } else {
    buildings = buildPuzzle({ ...puzzle, targets: [] }).round.terrain.buildings.length;
  }

  const onRoof = (index: number) => Number.isInteger(index) && index >= 0 && index < buildings;
  // A gorilla stands centred over its roof and the gap after it, so it needs a next building.
  const canStand = (index: number) => onRoof(index) && index < buildings - 1;
  if (!canStand(stand.on)) problems.push(`Nobody can stand on building ${stand.on}.`);

  if (targets.length === 0) problems.push('A puzzle needs a target.');
  const dummies = targets.filter((target) => target.kind === 'dummy');
  if (dummies.length > 1) problems.push('One dummy at most.');
  for (const target of targets) {
    if (target.kind === 'hoop') {
      if (
        target.x < 20 ||
        target.x > WORLD_WIDTH - 20 ||
        target.y < 20 ||
        target.y > STREET_Y - 20
      ) {
        problems.push('A hoop must hang inside the screen.');
      }
      continue;
    }
    const valid = target.kind === 'dummy' ? canStand(target.on) : onRoof(target.on);
    if (!valid) problems.push(`A ${target.kind} cannot go on building ${target.on}.`);
    if (target.kind === 'dummy' && target.on === stand.on)
      problems.push('The dummy stands on your roof.');
    if (
      'along' in target &&
      target.along !== undefined &&
      (target.along < 0.1 || target.along > 0.9)
    ) {
      problems.push('Keep `along` between 0.1 and 0.9, on the roof.');
    }
  }

  const last = targets.at(-1);
  if (rule === 'allBananas' && (powerUp !== 'tri' || dummies.length > 0)) {
    problems.push('Every banana needs a Tri-Banana and targets that are not a dummy.');
  }
  if (rule === 'bounceTwice' && (powerUp !== 'bouncer' || !hazards?.bouncy)) {
    problems.push('Two bounces need the Bouncer and springy ground.');
  }
  // A bell is struck anywhere on its rim, so only pads and crates have a middle to aim for.
  if (style.kind === 'bullseye' && last?.kind !== 'pad' && last?.kind !== 'crate') {
    problems.push('A bullseye needs a pad or a crate last.');
  }
  if (style.kind === 'bonk' && last?.kind !== 'dummy')
    problems.push('A bonk needs the dummy last.');
  if (style.kind === 'clean' && targets.some((target) => target.kind === 'pad')) {
    problems.push('A pad is hit by blasting the roof, so it cannot be clean.');
  }
  if (style.kind === 'sun' && rule === 'sun') problems.push('The sun is already the rule.');
  return problems;
}

function solutionProblems(puzzle: Puzzle): string[] {
  const { angle, velocity } = puzzle.solution;
  const problems: string[] = [];
  const reachable =
    angle >= AIM_LIMITS.angle.min &&
    angle <= AIM_LIMITS.angle.max &&
    Math.abs(angle * 10 - Math.round(angle * 10)) < 1e-9 &&
    Number.isInteger(velocity) &&
    velocity >= 1 &&
    velocity <= AIM_LIMITS.power.max;
  if (!reachable) {
    problems.push('The solution must be a throw a player can aim: 0–180° in tenths, power 1–200.');
    return problems;
  }
  const built = buildPuzzle(puzzle);
  const shot = previewTurn(built.start(), { angle, velocity, usePowerUp: true });
  const verdict = judgeThrow(built, shot);
  if (!verdict.solved) problems.push(`The solution does not solve it (${verdict.failure}).`);
  else if (!verdict.styled) problems.push('The solution solves it, but without the style goal.');
  return problems;
}
