import { createRng } from '@shared/rng';
import { normaliseDegrees } from './exact-math';
import type { Deck, FlightSetup, Level, TimeOfDay } from './flight-state';
import { toMagnetic, variationAt } from './magnetic';
import { destinationById, DESTINATIONS, type DestinationId } from './navdata';
import { ilsFor } from './radios';
import type { DestinationSky } from './weather';

/**
 * The Daily Approach: one ILS a day, the same for everyone, worked out
 * from the UTC date's seed (`@shared/daily`): the field, the cloud, the
 * wind and the hour. It starts fifteen miles out, like the approach
 * practice; the player picks the realism level and the flight deck, and
 * only the first attempt of the day is scored.
 */
export const DAILY_APPROACH_LAUNCH = '2026-10-16';

export interface DailyApproach {
  number: number;
  destination: DestinationId;
  sky: DestinationSky;
  timeOfDay: TimeOfDay;
  /** The surface wind at the field: from, magnetic. */
  wind: { direction: number; speedKt: number; gustKt: number };
  seed: number;
}

/** Murk most days: that is what the approach is for. */
const SKIES: readonly DestinationSky[] = ['minimums', 'minimums', 'low', 'low', 'fog', 'clear'];
const HOURS: readonly TimeOfDay[] = ['morning', 'morning', 'morning', 'dusk', 'night'];

export function dailyApproach(day: { number: number; seed: number }): DailyApproach {
  const rng = createRng(day.seed);
  const destination = rng.pick(DESTINATIONS.map((candidate) => candidate.id));
  const sky = rng.pick(SKIES);
  const timeOfDay = rng.pick(HOURS);
  const strip = ilsFor(destinationById(destination), 'real').runway;
  const runwayCourse = toMagnetic(strip.headingTrue, variationAt(strip.threshold));
  // The wind comes from somewhere ahead of the wing, so there is always some crosswind to work.
  const offRunway = rng.int(15, 75) * (rng.next() < 0.5 ? -1 : 1);
  const speedKt = rng.int(6, 22);
  return {
    number: day.number,
    destination,
    sky,
    timeOfDay,
    wind: {
      direction: Math.round(normaliseDegrees(runwayCourse + offRunway)) || 360,
      speedKt,
      gustKt: rng.next() < 0.35 ? speedKt + rng.int(6, 10) : 0,
    },
    seed: day.seed,
  };
}

export function dailySetup(daily: DailyApproach, level: Level, deck: Deck): FlightSetup {
  return {
    mode: 'approach',
    level,
    deck,
    destination: daily.destination,
    seed: daily.seed % 1_000_000,
    sky: daily.sky,
    timeOfDay: daily.timeOfDay,
    wind: daily.wind,
  };
}

/** What a day's scored attempt keeps; the Hall reads it to say how it went. */
export interface DailyApproachResult {
  landed: boolean;
  points: number;
  stars: number;
  starsText: string;
  sinkFpm: number | null;
  field: string;
  level: Level;
  deck: Deck;
}

const SKY_MARKS: Record<DestinationSky, string> = {
  clear: '☀️ clear',
  low: '☁️',
  minimums: '☁️',
  fog: '🌫️',
};

const LEVEL_NAMES: Record<Level, string> = {
  rules1982: '1982 Rules',
  arcade: 'Arcade',
  pilot: 'Pilot',
  captain: 'Captain',
};

/**
 * One line to share, giving away the weather and how it went but not how
 * it was flown: "Flight 312 · Daily Approach #12 · BOS ☁️ 300 ft · 💨 18 kt
 * · 🛬 142 fpm · ★★☆ · Pilot".
 */
export function dailyShareText(
  daily: DailyApproach,
  ceilingFt: number | null,
  result: DailyApproachResult,
): string {
  const sky =
    daily.sky === 'clear' || ceilingFt === null
      ? SKY_MARKS.clear
      : `${SKY_MARKS[daily.sky]} ${ceilingFt} ft`;
  const wind = `💨 ${daily.wind.gustKt > 0 ? `${daily.wind.speedKt}G${daily.wind.gustKt}` : daily.wind.speedKt} kt`;
  const landing =
    result.landed && result.sinkFpm !== null ? `🛬 ${Math.round(result.sinkFpm)} fpm` : '💥';
  return [
    `Flight 312 · Daily Approach #${daily.number}`,
    `${result.field} ${sky}`,
    wind,
    landing,
    result.starsText,
    LEVEL_NAMES[result.level],
  ].join(' · ');
}
