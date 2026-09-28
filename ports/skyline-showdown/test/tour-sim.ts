import { createRng, type Rng } from '@shared/rng';
import {
  createCpuMemory,
  DEFAULT_STYLE,
  observeThrow,
  planThrow,
  thinkingSeconds,
  type CpuAim,
  type CpuLevel,
  type CpuMemory,
  type PlayStyle,
} from '../src/engine/ai';
import { STEPS_PER_SECOND } from '../src/engine/constants';
import { createMatch, startNextRound, takeTurn, type MatchState } from '../src/engine/match';
import { tourSetup, type MatchSetup } from '../src/game/setup';
import { chapterUnlocked, recordStage, starsFor, totalStars } from '../src/tour/progress';
import { emptyTour, type TourSave } from '../src/tour/save';
import { CHAPTERS, STAGES, stagesIn, type ChapterId, type Stage } from '../src/tour/stages';
import { DEFAULT_OUTFITS } from '../src/wardrobe/items';
import { defaultSettings } from '../src/settings';

/**
 * A stand-in player for tuning the World Tour. A "decent human" (the
 * Normal CPU's judgement, typing exact numbers) plays each stage against
 * its rival with the real engine and the real CPU, in exactly the order
 * the page makes its calls, so the Playwright playtest can play the same
 * matches through the page.
 *
 * How long it all takes is estimated from the session's pacing plus the
 * time a person spends aiming and reading the menus.
 */
export const DECENT_HUMAN: { level: CpuLevel; style: PlayStyle } = {
  level: 'normal',
  style: DEFAULT_STYLE,
};

/** Seconds, matching the session's pacing, plus a person's own time. */
export const PACE = {
  roundIntro: 2,
  personAiming: 8,
  cpuWindup: 0.9,
  release: 0.13,
  settle: { person: 1.6, cpu: 1.1 },
  impact: 1.5,
  replaySpeed: 0.35,
  replayWindow: 2.5,
  celebrate: 3,
  /** Map, stage card and results around every stage played. */
  menus: 25,
} as const;

interface Brain {
  memory: CpuMemory;
  rng: Rng;
  level: CpuLevel;
  style: PlayStyle;
}

export interface Players {
  human: Brain;
  cpu: Brain;
}

/** The two brains for a match, seeded as the page seeds its CPU. */
export function playersFor(setup: MatchSetup): Players {
  const rival = setup.players[1].cpu;
  if (!rival) throw new Error('A tour stage always has a CPU rival.');
  const seed = setup.match.seed;
  return {
    human: { memory: createCpuMemory(), rng: createRng(seed + 7), ...DECENT_HUMAN },
    cpu: { memory: createCpuMemory(), rng: createRng(seed ^ 0x5eed), ...rival },
  };
}

export interface Turn {
  aim: CpuAim;
  seconds: number;
}

/** Plans and makes the next throw, in the page's order: plan, think, throw, observe. */
export function playTurn(state: MatchState, players: Players): Turn {
  const player = state.turn;
  const brain = player === 0 ? players.human : players.cpu;
  const aim = planThrow(state, brain.memory, brain.level, brain.rng, brain.style);
  let aiming: number = PACE.personAiming;
  if (player === 1) aiming = thinkingSeconds(brain.level, brain.rng) + PACE.cpuWindup;
  // A person types a tidy angle.
  if (player === 0) aim.angle = Math.round(aim.angle * 10) / 10;
  const result = takeTurn(state, aim);
  observeThrow(brain.memory, aim, result.shot, state);

  const flight = result.shot.steps / STEPS_PER_SECOND;
  const after =
    result.scorer === null
      ? player === 0
        ? PACE.settle.person
        : PACE.settle.cpu
      : PACE.impact + Math.min(flight, PACE.replayWindow) / PACE.replaySpeed + PACE.celebrate;
  return { aim, seconds: aiming + PACE.release + flight + after };
}

export interface StageRun {
  stage: Stage;
  seed: number;
  won: boolean;
  throws: number;
  timesHit: number;
  stars: number;
  seconds: number;
}

export function playStage(stage: Stage, seed: number): StageRun {
  const setup = tourSetup(stage, defaultSettings(), seed, DEFAULT_OUTFITS[0]);
  const state = createMatch(setup.match);
  const players = playersFor(setup);
  let throws = 0;
  let seconds = PACE.menus + PACE.roundIntro;
  while (state.status !== 'matchOver') {
    if (state.turn === 0) throws++;
    seconds += playTurn(state, players).seconds;
    if (statusOf(state) === 'roundOver') {
      startNextRound(state);
      seconds += PACE.roundIntro;
    }
  }
  const won = state.winner === 0;
  const timesHit = state.scores[1];
  const { stars } = starsFor(stage, { won, throws, timesHit, aimAssist: false });
  return { stage, seed, won, throws, timesHit, stars, seconds };
}

/** Reads the status through a function, since takeTurn changes it behind TypeScript's back. */
function statusOf(state: MatchState): MatchState['status'] {
  return state.status;
}

export interface Journey {
  save: TourSave;
  runs: StageRun[];
  /** Seconds played until each chapter was finished (its boss beaten and the next one opened). */
  finished: Partial<Record<ChapterId, number>>;
}

/**
 * A player's whole tour: each stage replayed until it is won; when a
 * chapter's gate needs more stars, the stage with the most stars still to
 * win is replayed until the gate opens.
 */
export function playTour(playerSeed: number, maxAttempts = 12): Journey {
  const seeds = createRng(playerSeed);
  let save = emptyTour();
  const runs: StageRun[] = [];
  const finished: Journey['finished'] = {};
  let seconds = 0;
  const play = (stage: Stage) => {
    const run = playStage(stage, seeds.int(1, 2 ** 30));
    runs.push(run);
    seconds += run.seconds;
    save = recordStage(save, stage, { ...run, aimAssist: false }).save;
    return run;
  };

  CHAPTERS.forEach((chapter, index) => {
    for (const stage of stagesIn(chapter.id)) {
      for (let attempt = 0; attempt < maxAttempts && !save.stages[stage.id]?.won; attempt++) {
        play(stage);
      }
    }
    const next = CHAPTERS[index + 1];
    const last = stagesIn(chapter.id).at(-1) as Stage;
    const reachable = STAGES.slice(0, STAGES.indexOf(last) + 1);
    const starsAt = (stage: Stage) => save.stages[stage.id]?.stars ?? 0;
    for (
      let replay = 0;
      next && !chapterUnlocked(save, next) && replay < maxAttempts * 3;
      replay++
    ) {
      const target = [...reachable].sort((a, b) => starsAt(a) - starsAt(b))[0] as Stage;
      play(target);
    }
    finished[chapter.id] = seconds;
  });
  return { save, runs, finished };
}

export function starsOf(journey: Journey): number {
  return totalStars(journey.save);
}
