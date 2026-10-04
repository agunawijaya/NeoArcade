import type { Rng } from '@shared/rng';
import type { ConditionId } from './conditions';
import { conditionAt } from './living-weather';
import { pointAlong } from './position';
import { streamFor } from './streams';
import { difficultyOf, elapsedHours, hourOfDay, stopMile, type Trip } from './trip';

/**
 * The weather for the coming hour. The original routes roll it fresh every hour
 * (lines 2800–2985); routes with living weather read it off the map.
 */
export type OriginalProfile = 'north' | 'middle' | 'south';

interface ProfileRule {
  clearBelow: number;
  blizzardAbove: number;
  fogAbove: number;
  precipitationAbove: number;
  precipitation: 'snow' | 'rain' | 'snow-or-rain';
}

/** Lines 2820–2950. The middle route's snow-or-rain splits one in three to snow. */
export const PROFILE_RULES: Readonly<Record<OriginalProfile, ProfileRule>> = {
  north: {
    clearBelow: 3300,
    blizzardAbove: 4800,
    fogAbove: 4600,
    precipitationAbove: 3800,
    precipitation: 'snow',
  },
  middle: {
    clearBelow: 3400,
    blizzardAbove: 4900,
    fogAbove: 4700,
    precipitationAbove: 4200,
    precipitation: 'snow-or-rain',
  },
  south: {
    clearBelow: 4000,
    blizzardAbove: 5700,
    fogAbove: 5500,
    precipitationAbove: 4400,
    precipitation: 'rain',
  },
};

/**
 * Line 2810: AF = (3000 + MF) × RND. The further east, the bigger AF can
 * get, so blizzards only become possible deep into the trip. After a
 * blizzard the road cannot be clear and dry straight away.
 */
export function originalWeather(
  profile: OriginalProfile,
  miles: number,
  previous: ConditionId,
  rng: Rng,
  scale = 1,
): ConditionId {
  const rule = PROFILE_RULES[profile];
  const draw = (3000 + miles) * rng.next() * scale;
  if (draw < rule.clearBelow && previous !== 'blizzard') return 'clear';
  if (draw > rule.blizzardAbove) return 'blizzard';
  if (draw > rule.fogAbove) return 'fog';
  if (draw > rule.precipitationAbove) {
    if (rule.precipitation === 'snow') return 'light-snow';
    if (rule.precipitation === 'rain') return 'rain';
    return Math.floor(rng.next() * 3) + 1 === 1 ? 'light-snow' : 'rain';
  }
  return 'wet';
}

/**
 * The condition for the hour about to be driven. `afterStop` names the stop
 * a fresh draw follows, so it never repeats the draw of the hour before.
 */
export function weatherForComingHour(trip: Trip, afterStop?: number): ConditionId {
  const model = trip.route.weather;
  if (model.kind === 'original') {
    const key = afterStop === undefined ? trip.hourCount : `${trip.hourCount}:stop${afterStop}`;
    const rng = streamFor(trip.seed, 'weather', key);
    return originalWeather(
      model.profile,
      trip.miles,
      trip.condition,
      rng,
      difficultyOf(trip).weatherScale,
    );
  }
  const here = pointAlong(trip.route, trip.miles, (index) => stopMile(trip, index));
  return conditionAt(trip.sky, here.lat, here.lon, elapsedHours(trip), hourOfDay(trip));
}
