import type { Store } from '@shared/storage';
import type { CpuLevel } from './engine/world';
import { SEA_CHAPTERS } from './game/at-sea';
import { CHAPTERS, type ChapterCard } from './game/campaign';
import { CPU_LEVELS } from './settings';

/**
 * This game's own save: campaign and At Sea stars, the Secret Hangar,
 * Classic bests and Dogfight wins. Badges and XP live in the Arcade Pass; Daily Sortie
 * results in their own log (see game/daily.ts).
 */
export interface ChapterRecord {
  /** Won, the chapter's second goal, its third. Earned once, kept for good. */
  stars: [boolean, boolean, boolean];
  bestScore: number;
}

export interface Progress {
  version: 1;
  chapters: Partial<Record<string, ChapterRecord>>;
  /** Found by typing 1984's hidden switch on the title. */
  hangarFound: boolean;
  classicBest: number;
  dogfightWins: Partial<Record<CpuLevel, number>>;
}

const KEY = 'progress';

export function emptyProgress(): Progress {
  return { version: 1, chapters: {}, hangarFound: false, classicBest: 0, dogfightWins: {} };
}

export function loadProgress(store: Store): Progress {
  const raw = store.get<unknown>(KEY, null);
  const progress = emptyProgress();
  if (typeof raw !== 'object' || raw === null) return progress;
  const stored = raw as Partial<Progress>;
  for (const chapter of [...CHAPTERS, ...SEA_CHAPTERS]) {
    const record = stored.chapters?.[chapter.id];
    if (!record || !Array.isArray(record.stars)) continue;
    progress.chapters[chapter.id] = {
      stars: [0, 1, 2].map((star) => record.stars[star] === true) as ChapterRecord['stars'],
      bestScore: Number.isFinite(record.bestScore) ? record.bestScore : 0,
    };
  }
  progress.hangarFound = stored.hangarFound === true;
  progress.classicBest = Number.isFinite(stored.classicBest) ? Number(stored.classicBest) : 0;
  for (const level of CPU_LEVELS) {
    const wins = Number(stored.dogfightWins?.[level]);
    if (Number.isInteger(wins) && wins > 0) progress.dogfightWins[level] = wins;
  }
  return progress;
}

export function saveProgress(store: Store, progress: Progress) {
  store.set(KEY, progress);
}

export function starsOf(progress: Progress, chapterId: string): ChapterRecord['stars'] {
  return progress.chapters[chapterId]?.stars ?? [false, false, false];
}

/** The stars earned in one campaign: the eight chapters on land unless the At Sea missions are asked for. */
export function totalStars(
  progress: Progress,
  chapters: readonly ChapterCard[] = CHAPTERS,
): number {
  return chapters.reduce(
    (sum, chapter) => sum + starsOf(progress, chapter.id).filter(Boolean).length,
    0,
  );
}

/** The first chapter is open; each one after opens once the one before is won. */
export function isChapterOpen(
  progress: Progress,
  index: number,
  chapters: readonly ChapterCard[] = CHAPTERS,
): boolean {
  if (index <= 0) return true;
  const previous = chapters[index - 1];
  return previous ? starsOf(progress, previous.id)[0] : false;
}

/** Adds a finished chapter's stars to the ones already earned; returns how many are new. */
export function recordChapter(
  progress: Progress,
  chapterId: string,
  stars: readonly [boolean, boolean, boolean],
  score: number,
): number {
  const before = starsOf(progress, chapterId);
  const merged = before.map(
    (star, index) => star || stars[index] === true,
  ) as ChapterRecord['stars'];
  progress.chapters[chapterId] = {
    stars: merged,
    bestScore: Math.max(progress.chapters[chapterId]?.bestScore ?? 0, score),
  };
  return merged.filter(Boolean).length - before.filter(Boolean).length;
}
