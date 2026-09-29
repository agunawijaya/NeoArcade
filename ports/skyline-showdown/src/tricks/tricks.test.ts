import { describe, expect, it } from 'vitest';
import { previewTurn } from '../engine/match';
import { judgeThrow } from './judge';
import { PACKS, PUZZLES } from './packs';
import {
  emptyTricks,
  loadTricks,
  MAX_TRICK_STARS,
  nextPuzzle,
  packUnlocked,
  puzzleStars,
  recordSolve,
  type TrickSave,
} from './progress';
import { buildPuzzle, type Puzzle } from './puzzle';
import { puzzleProblems } from './validate';

const [WARM_UP, WIND_READERS] = PACKS;
const byId = (id: string) => PUZZLES.find((puzzle) => puzzle.id === id) as Puzzle;

function attempt(puzzle: Puzzle, angle: number, velocity: number) {
  const built = buildPuzzle(puzzle);
  const shot = previewTurn(built.start(), { angle, velocity, usePowerUp: true });
  return { shot, verdict: judgeThrow(built, shot) };
}

describe('the Trick Shot packs', () => {
  it('are four packs of six, every puzzle with its own id', () => {
    expect(PACKS).toHaveLength(4);
    for (const pack of PACKS) expect(pack.puzzles, pack.id).toHaveLength(6);
    expect(new Set(PUZZLES.map((puzzle) => puzzle.id)).size).toBe(24);
    expect(MAX_TRICK_STARS).toBe(72);
  });

  // Includes replaying the stored reference solution: every puzzle is solvable, with style.
  for (const puzzle of PUZZLES) {
    it(`${puzzle.id} is well made and its solution solves it with style`, () => {
      expect(puzzleProblems(puzzle)).toEqual([]);
    });
  }

  it('ask for something new in every pack', () => {
    const uses = (pack: (typeof PACKS)[number], test: (puzzle: Puzzle) => boolean) =>
      pack.puzzles.some(test);
    expect(WARM_UP?.puzzles.every((puzzle) => puzzle.wind === 0 && !puzzle.powerUp)).toBe(true);
    expect(WIND_READERS?.puzzles.every((puzzle) => puzzle.wind !== 0 || puzzle.hazards)).toBe(true);
    const [, , trickArcs, impossible] = PACKS;
    expect(trickArcs && uses(trickArcs, (puzzle) => puzzle.powerUp !== undefined)).toBe(true);
    expect(impossible && uses(impossible, (puzzle) => puzzle.world === 'moon')).toBe(true);
  });
});

describe('judging a throw', () => {
  it('solves a puzzle only when every target is reached', () => {
    const hoopDreams = byId('hoop-dreams');
    const { angle, velocity } = hoopDreams.solution;
    expect(attempt(hoopDreams, angle, velocity).verdict.solved).toBe(true);
    const short = attempt(hoopDreams, angle, velocity - 8).verdict;
    expect(short.solved).toBe(false);
    expect(short.failure).toBe('missed');
    expect(short.metres).toBeGreaterThan(0);
  });

  it('lets a banana fly on through a hoop but stops it at a crate', () => {
    const hoopDreams = byId('hoop-dreams');
    const { shot } = attempt(hoopDreams, hoopDreams.solution.angle, hoopDreams.solution.velocity);
    const [hoop, crate] = shot.events.filter((event) => event.type === 'target');
    expect(hoop?.step).toBeLessThan(crate?.step ?? 0);
    expect(shot.events.at(-1)).toBe(crate);
  });

  it('holds a solved throw to its rule', () => {
    const sun = byId('here-comes-the-sun');
    const withoutTheSun: Puzzle = { ...sun, rule: undefined };
    // A flat throw at the dummy is fine without the rule, and not with it.
    const velocity = [...Array(80).keys()]
      .map((step) => 40 + step)
      .find((candidate) => attempt(withoutTheSun, 20, candidate).verdict.solved);
    expect(velocity).toBeDefined();
    expect(attempt(sun, 20, velocity as number).verdict.failure).toBe('noSun');
  });

  it('counts only a throw where all three bananas of a Tri-Banana land on the pad', () => {
    const threeForThree = byId('three-for-three');
    const { angle, velocity } = threeForThree.solution;
    expect(attempt(threeForThree, angle, velocity).verdict.solved).toBe(true);
    const failures = new Set<string | null>();
    for (let slower = velocity - 1; slower > velocity - 12; slower--) {
      failures.add(attempt(threeForThree, angle, slower).verdict.failure);
    }
    // Some throws land one banana on the pad and scatter the rest.
    expect(failures).toContain('strayBanana');
    // A flat throw never splits, so it cannot sneak one banana home.
    const flat = { ...threeForThree, rule: undefined };
    const flatSolve = [...Array(120).keys()].find(
      (step) => attempt(flat, 0, 60 + step).verdict.solved,
    );
    expect(flatSolve).toBeDefined();
    expect(attempt(threeForThree, 0, 60 + (flatSolve ?? 0)).verdict.failure).toBe('strayBanana');
  });

  it('calls hitting yourself a self-hit', () => {
    expect(attempt(byId('first-toss'), 45, 1).verdict.failure).toBe('selfHit');
  });
});

describe('Trick Shot progress', () => {
  const firstToss = byId('first-toss');

  it('gives a star for the solve, one for par and one for style, keeping the best', () => {
    let save = emptyTricks();
    const slow = recordSolve(save, firstToss, { attempts: firstToss.par + 3, styled: false });
    expect(slow.newStars).toBe(1);
    expect(slow.firstSolve).toBe(true);
    save = slow.save;
    const sharp = recordSolve(save, firstToss, { attempts: 1, styled: true });
    expect(sharp.newStars).toBe(2);
    expect(puzzleStars(sharp.save, firstToss)).toBe(3);
    const later = recordSolve(sharp.save, firstToss, { attempts: 9, styled: false });
    expect(puzzleStars(later.save, firstToss)).toBe(3);
    expect(later.newStars).toBe(0);
  });

  it('opens the next pack after four puzzles of the one before', () => {
    let save: TrickSave = emptyTricks();
    const [warmUp, windReaders] = PACKS as [(typeof PACKS)[0], (typeof PACKS)[0]];
    expect(packUnlocked(save, windReaders)).toBe(false);
    warmUp.puzzles.slice(0, 3).forEach((puzzle) => {
      save = recordSolve(save, puzzle, { attempts: 1, styled: false }).save;
    });
    const fourth = recordSolve(save, warmUp.puzzles[3] as Puzzle, { attempts: 2, styled: false });
    expect(fourth.opened).toEqual([windReaders]);
    expect(packUnlocked(fourth.save, windReaders)).toBe(true);
    expect(nextPuzzle(fourth.save)).toBe(warmUp.puzzles[4]);
  });

  it('notices when every puzzle is solved, and every star earned', () => {
    let save = emptyTricks();
    let last = recordSolve(save, firstToss, { attempts: 1, styled: true });
    for (const puzzle of PUZZLES) {
      last = recordSolve(save, puzzle, { attempts: 1, styled: true });
      save = last.save;
    }
    expect(last.allSolved).toBe(true);
    expect(last.allThreeStars).toBe(true);
  });

  it('reads back only what it recognises', () => {
    const loaded = loadTricks({
      version: 1,
      puzzles: {
        'first-toss': { solved: true, fewestAttempts: 2.7, styled: true },
        'no-such-puzzle': { solved: true },
        headwind: { solved: false, styled: true },
      },
    });
    expect(loaded.puzzles['first-toss']).toEqual({ solved: true, fewestAttempts: 2, styled: true });
    expect(loaded.puzzles['no-such-puzzle']).toBeUndefined();
    expect(loaded.puzzles.headwind?.styled).toBe(false);
    expect(loadTricks('nonsense')).toEqual(emptyTricks());
    expect(loadTricks({ version: 99, puzzles: {} })).toEqual(emptyTricks());
  });
});
