/**
 * Awards thin out as one game is played more on one day, so replaying the
 * same easy win all night earns next to nothing. The bands count the XP a
 * game *asked* for today; the rate is how much of it is granted.
 *
 *   asked today      granted
 *   0 – 400          100 %   (a good session lives here)
 *   400 – 800         50 %
 *   800 – 2000        10 %
 *   beyond 2000        0 %
 *
 * So one game can grant at most 720 XP from awards in a day. Badges are
 * one-offs and never capped. The day is the player's local calendar day.
 */
export const DAILY_XP_BANDS: readonly { upTo: number; rate: number }[] = [
  { upTo: 400, rate: 1 },
  { upTo: 800, rate: 0.5 },
  { upTo: 2000, rate: 0.1 },
  { upTo: Infinity, rate: 0 },
];

/** A single award larger than this is a bug in the game, not a great play. */
export const MAX_AWARD = 250;

/** XP granted in total when a game has asked for `asked` XP today. */
export function grantedForDay(asked: number): number {
  let granted = 0;
  let bandStart = 0;
  for (const band of DAILY_XP_BANDS) {
    // Checking the rate first keeps Infinity × 0 from turning the total into NaN.
    if (band.rate > 0) granted += Math.max(0, Math.min(asked, band.upTo) - bandStart) * band.rate;
    if (asked <= band.upTo) break;
    bandStart = band.upTo;
  }
  return granted;
}

/**
 * XP granted for a new award. Rounding the running totals rather than each
 * award means many small awards add up exactly like one big one.
 */
export function cappedXp(askedBefore: number, asked: number): number {
  return Math.round(grantedForDay(askedBefore + asked)) - Math.round(grantedForDay(askedBefore));
}

/** "2026-09-28" in the player's own time zone. */
export function localDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
