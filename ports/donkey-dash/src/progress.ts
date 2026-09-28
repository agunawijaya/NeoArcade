import type { Store } from '@shared/storage';
import { isRouteOpen, ROUTE_IDS, ROUTES, TOTAL_STARS, type RouteId } from './engine/routes';

/**
 * This game's own save: Road Trip stars and bests, and the Classic Duel
 * losing streak. Badges and XP live in the Arcade Pass; Endless bests and
 * Daily Road results in their own keys (see main.ts).
 */
export interface LegRecord {
  /** Finish, finish without a crash, near-miss target. Earned once, kept for good. */
  stars: [boolean, boolean, boolean];
  bestScore: number;
}

export interface Progress {
  version: 1;
  legs: Partial<Record<string, LegRecord>>;
  /** Points lost to the Donkey in a row, across Classic Duel matches. */
  donkeyStreak: number;
}

const KEY = 'progress';

export function legKey(route: RouteId, leg: number): string {
  return `${route}-${leg}`;
}

export function emptyProgress(): Progress {
  return { version: 1, legs: {}, donkeyStreak: 0 };
}

export function loadProgress(store: Store): Progress {
  const raw = store.get<unknown>(KEY, null);
  const progress = emptyProgress();
  if (typeof raw !== 'object' || raw === null) return progress;
  const stored = raw as Partial<Progress>;
  for (const route of ROUTE_IDS) {
    for (let leg = 0; leg < 3; leg++) {
      const record = stored.legs?.[legKey(route, leg)];
      if (!record || !Array.isArray(record.stars)) continue;
      progress.legs[legKey(route, leg)] = {
        stars: [0, 1, 2].map((star) => record.stars[star] === true) as LegRecord['stars'],
        bestScore: Number.isFinite(record.bestScore) ? Math.max(0, record.bestScore) : 0,
      };
    }
  }
  const streak = Number(stored.donkeyStreak);
  progress.donkeyStreak = Number.isInteger(streak) && streak > 0 ? streak : 0;
  return progress;
}

export function saveProgress(store: Store, progress: Progress) {
  store.set(KEY, progress);
}

export function starsOf(progress: Progress, route: RouteId, leg: number): LegRecord['stars'] {
  return progress.legs[legKey(route, leg)]?.stars ?? [false, false, false];
}

export function totalStars(progress: Progress): number {
  return Object.values(progress.legs).reduce(
    (sum, record) => sum + (record?.stars.filter(Boolean).length ?? 0),
    0,
  );
}

export function routeStars(progress: Progress, route: RouteId): number {
  return [0, 1, 2].reduce(
    (sum, leg) => sum + starsOf(progress, route, leg).filter(Boolean).length,
    0,
  );
}

export function isLegFinished(progress: Progress, route: RouteId, leg: number): boolean {
  return starsOf(progress, route, leg)[0];
}

/** A route opens with enough stars; within it, each leg opens once the one before is finished. */
export function isLegOpen(progress: Progress, route: RouteId, leg: number): boolean {
  if (!isRouteOpen(ROUTES[route], totalStars(progress))) return false;
  return leg === 0 || isLegFinished(progress, route, leg - 1);
}

export interface LegOutcome {
  /** Stars earned that were not earned before. */
  newStars: number;
  firstFinish: boolean;
  /** Every leg of this route is now finished. */
  routeFinished: boolean;
  /** Every leg of this route now has its no-crash star. */
  routeClean: boolean;
  /** Routes that these stars have just opened. */
  opened: RouteId[];
  bestScore: boolean;
}

export function recordLeg(
  progress: Progress,
  route: RouteId,
  leg: number,
  stars: LegRecord['stars'],
  score: number,
): LegOutcome {
  const before = totalStars(progress);
  const key = legKey(route, leg);
  const old = progress.legs[key] ?? { stars: [false, false, false], bestScore: 0 };
  const merged = old.stars.map(
    (star, index) => star || stars[index] === true,
  ) as LegRecord['stars'];
  const newStars = merged.filter(Boolean).length - old.stars.filter(Boolean).length;
  progress.legs[key] = { stars: merged, bestScore: Math.max(old.bestScore, score) };
  const after = totalStars(progress);
  const legs = [0, 1, 2].map((index) => starsOf(progress, route, index));
  return {
    newStars,
    firstFinish: !old.stars[0] && merged[0],
    routeFinished: legs.every((record) => record[0]),
    routeClean: legs.every((record) => record[1]),
    opened: ROUTE_IDS.filter(
      (id) => ROUTES[id].unlockStars > before && ROUTES[id].unlockStars <= after,
    ),
    bestScore: score > old.bestScore,
  };
}

export function allRoutesFinished(progress: Progress): boolean {
  return ROUTE_IDS.every((route) => [0, 1, 2].every((leg) => isLegFinished(progress, route, leg)));
}

export function allStars(progress: Progress): boolean {
  return totalStars(progress) === TOTAL_STARS;
}
