import { RIVAL_IDS, type RivalId } from './rivals';
import type { TourSave } from './save';
import { CHAPTERS, STAGES, stagesIn, type Chapter, type Stage } from './stages';

/**
 * The World Tour's rules of progress, all pure: stars for a result, what is
 * unlocked, and what a new result changes.
 *
 * Stars: one for winning, one for winning within the stage's throw budget,
 * one for winning without ever being hit. Aim assist caps a stage at one.
 * Stages open one after another; a chapter opens once its star total is
 * reached and the previous chapter's boss is beaten, so strong play moves
 * faster but anyone can get there by replaying.
 */
export interface StageOutcome {
  won: boolean;
  /** The player's own throws in the match. */
  throws: number;
  /** Points the rival scored: hits on the player, self-hits included. */
  timesHit: number;
  aimAssist: boolean;
}

export interface StarGoals {
  win: boolean;
  budget: boolean;
  flawless: boolean;
}

export interface StarResult {
  goals: StarGoals;
  stars: number;
  /** Aim assist held the stars back. */
  capped: boolean;
}

export function starsFor(stage: Stage, outcome: StageOutcome): StarResult {
  const goals: StarGoals = {
    win: outcome.won,
    budget: outcome.won && outcome.throws <= stage.throwBudget,
    flawless: outcome.won && outcome.timesHit === 0,
  };
  const earned = Number(goals.win) + Number(goals.budget) + Number(goals.flawless);
  const stars = outcome.aimAssist ? Math.min(1, earned) : earned;
  return { goals, stars, capped: stars < earned };
}

export function totalStars(save: TourSave): number {
  return Object.values(save.stages).reduce((sum, record) => sum + (record?.stars ?? 0), 0);
}

export const MAX_STARS = STAGES.length * 3;

function bossOf(chapter: Chapter): Stage | undefined {
  return stagesIn(chapter.id).find((stage) => stage.boss);
}

export function chapterUnlocked(save: TourSave, chapter: Chapter): boolean {
  const index = CHAPTERS.indexOf(chapter);
  if (index <= 0) return true;
  const previous = CHAPTERS[index - 1] as Chapter;
  const boss = bossOf(previous);
  return totalStars(save) >= chapter.starsToUnlock && Boolean(boss && save.stages[boss.id]?.won);
}

export function stageUnlocked(save: TourSave, stage: Stage): boolean {
  const chapter = CHAPTERS.find((candidate) => candidate.id === stage.chapter) as Chapter;
  if (!chapterUnlocked(save, chapter)) return false;
  const inChapter = stagesIn(stage.chapter);
  const index = inChapter.indexOf(stage);
  const before = inChapter[index - 1];
  return !before || Boolean(save.stages[before.id]?.won);
}

/** The stage the map lights up: the first one open and not yet won, or null when all are won. */
export function nextStage(save: TourSave): Stage | null {
  return STAGES.find((stage) => stageUnlocked(save, stage) && !save.stages[stage.id]?.won) ?? null;
}

/** What stands between the player and a locked chapter. */
export function chapterGate(
  save: TourSave,
  chapter: Chapter,
): { stars: number; boss: Stage | null } {
  const index = CHAPTERS.indexOf(chapter);
  const previous = CHAPTERS[index - 1];
  const boss = previous ? bossOf(previous) : undefined;
  return {
    stars: Math.max(0, chapter.starsToUnlock - totalStars(save)),
    boss: boss && !save.stages[boss.id]?.won ? boss : null,
  };
}

export interface StageRecorded {
  save: TourSave;
  result: StarResult;
  /** Stars added to the total (only improvements count). */
  newStars: number;
  firstWin: boolean;
  rivalFirstDefeat: boolean;
  /** Chapters this result opened. */
  opened: Chapter[];
  tourComplete: boolean;
}

/** Folds a finished stage into the save; the input save is left untouched. */
export function recordStage(save: TourSave, stage: Stage, outcome: StageOutcome): StageRecorded {
  const next: TourSave = structuredClone(save);
  const result = starsFor(stage, outcome);
  const before = next.stages[stage.id] ?? { stars: 0, won: false, bestThrows: null, plays: 0 };
  const firstWin = outcome.won && !before.won;
  next.stages[stage.id] = {
    stars: Math.max(before.stars, result.stars),
    won: before.won || outcome.won,
    bestThrows:
      outcome.won && (before.bestThrows === null || outcome.throws < before.bestThrows)
        ? outcome.throws
        : before.bestThrows,
    plays: before.plays + 1,
  };
  const rivalFirstDefeat = outcome.won && !next.rivalsBeaten.includes(stage.rival);
  if (rivalFirstDefeat)
    next.rivalsBeaten = RIVAL_IDS.filter(
      (id) => id === stage.rival || next.rivalsBeaten.includes(id),
    );
  const opened = CHAPTERS.filter(
    (chapter) => !chapterUnlocked(save, chapter) && chapterUnlocked(next, chapter),
  );
  return {
    save: next,
    result,
    newStars: totalStars(next) - totalStars(save),
    firstWin,
    rivalFirstDefeat,
    opened,
    tourComplete: STAGES.every((candidate) => next.stages[candidate.id]?.won),
  };
}

/** Rivals a Quick Match can pick: every one beaten on the tour. */
export function rivalsForQuickMatch(save: TourSave): RivalId[] {
  return RIVAL_IDS.filter((id) => save.rivalsBeaten.includes(id));
}
