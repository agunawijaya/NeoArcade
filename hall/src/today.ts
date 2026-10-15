import { createDailyLog, dailyChallenge, dayKey, nextDailyAt, streakOf } from '@shared/daily';
import { createStore, type Store } from '@shared/storage';
import type { GameDaily, GameEntry } from './catalog';
import { summariseResult } from './daily-result';

/**
 * Where every game's daily challenge stands today, read from the daily logs
 * the games keep in their own stores (ADR 0009). The Hall only reads them.
 */
export interface DailyStatus {
  game: GameEntry;
  daily: GameDaily;
  /** Today's number, counted from the game's launch date. */
  number: number;
  played: boolean;
  /** Today's result in a few words, when the game says how and it has been played. */
  result: string | null;
  /** Days in a row, still alive until the end of the day after the last run. */
  streak: number;
}

export function readDailies(
  games: readonly GameEntry[],
  now: Date,
  storeFor: (slug: string) => Store = createStore,
): DailyStatus[] {
  const today = dayKey(now);
  return games.flatMap((game) => {
    const { daily } = game;
    if (!daily) return [];
    const log = createDailyLog<unknown>(storeFor(game.slug), daily.log ?? 'daily');
    const stored = log.get(today);
    const played = log.has(today);
    // A clock set before the launch still gets Daily #1, as the games do.
    const number = Math.max(
      1,
      dailyChallenge({ game: game.slug, launch: daily.launch }).on(now).number,
    );
    return [
      {
        game,
        daily,
        number,
        played,
        result: played ? summariseResult(daily.results ?? [], stored) : null,
        streak: streakOf(
          log.entries().map((entry) => entry.key),
          today,
        ).current,
      },
    ];
  });
}

/** "5 h 12 min", "42 min" or "under a minute" until the next daily, and when that is locally. */
export function nextDaily(now: Date): { wait: string; at: Date } {
  const at = nextDailyAt(now);
  const minutes = Math.ceil((at.getTime() - now.getTime()) / 60_000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes - hours * 60;
  let wait: string;
  if (minutes <= 1) wait = 'under a minute';
  else if (hours === 0) wait = `${minutes} min`;
  else wait = rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
  return { wait, at };
}
