import { beforeAll, describe, expect, it } from 'vitest';
import { dailyChallenge } from '@shared/daily';
import { loadTerrainSource } from '../data/unpack';
import {
  DAILY_APPROACH_LAUNCH,
  dailyApproach,
  dailySetup,
  dailyShareText,
  type DailyApproachResult,
} from './daily-approach';
import { createFlight, type Flight } from './flight';
import { scoreLanding, starsText } from './landing-score';
import { DESTINATIONS } from './navdata';
import { createTerrain, type Terrain } from './terrain';
import { flyWithTestPilot } from './test-pilot';

/**
 * How a landing is marked, and the Daily Approach built on it: the same
 * day for everyone, a field, a sky, a wind and an hour from the date, and a
 * line to share that tells how it went without telling how it was flown.
 */
let terrain: Terrain;

beforeAll(async () => {
  terrain = createTerrain(await loadTerrainSource());
});

const DAILY = dailyChallenge({ game: 'flight-312', launch: DAILY_APPROACH_LAUNCH });

describe('the landing score', { timeout: 60_000 }, () => {
  let flight: Flight;

  beforeAll(() => {
    flight = createFlight(
      { mode: 'approach', level: 'pilot', destination: 'jfk', seed: 9, sky: 'low' },
      terrain,
    );
    flyWithTestPilot(flight);
  });

  it('marks a good landing by the test pilot in the high hundreds, out of a thousand', () => {
    const score = scoreLanding(flight);
    expect(score.landed).toBe(true);
    expect(score.points).toBeGreaterThan(750);
    expect(score.points).toBeLessThanOrEqual(1000);
    expect(score.stars).toBeGreaterThanOrEqual(2);
    const total = score.parts.reduce((sum, part) => sum + part.points, 0);
    expect(total).toBe(score.points);
    expect(score.parts.map((part) => part.label)).toContain('Touchdown zone');
  });

  it('gives nothing for a flight that did not land', () => {
    const unflown = createFlight(
      { mode: 'approach', level: 'pilot', destination: 'jfk', seed: 9, sky: 'low' },
      terrain,
    );
    expect(scoreLanding(unflown)).toEqual({ points: 0, stars: 0, landed: false, parts: [] });
  });

  it('writes stars the way the share line does', () => {
    expect(starsText(0)).toBe('☆☆☆');
    expect(starsText(2)).toBe('★★☆');
  });
});

describe('the Daily Approach', () => {
  it('is the same for everyone on a date, and different the next day', () => {
    const today = DAILY.forKey('2026-11-02');
    expect(dailyApproach(today)).toEqual(dailyApproach(DAILY.forKey('2026-11-02')));
    expect(dailyApproach(today)).not.toEqual(dailyApproach(DAILY.forKey('2026-11-03')));
    expect(DAILY.forKey(DAILY_APPROACH_LAUNCH).number).toBe(1);
  });

  it('chooses real fields, skies and winds with some crosswind in them, over a season', () => {
    const fields = new Set<string>();
    const skies = new Set<string>();
    for (let day = 0; day < 90; day++) {
      const daily = dailyApproach(
        DAILY.forKey(`2027-01-${String((day % 28) + 1).padStart(2, '0')}`),
      );
      fields.add(daily.destination);
      skies.add(daily.sky);
      expect(DESTINATIONS.some((one) => one.id === daily.destination)).toBe(true);
      expect(daily.wind.speedKt).toBeGreaterThanOrEqual(6);
      expect(daily.wind.speedKt).toBeLessThanOrEqual(22);
      expect(daily.wind.direction).toBeGreaterThanOrEqual(1);
      expect(daily.wind.direction).toBeLessThanOrEqual(360);
    }
    expect(fields.size).toBeGreaterThan(3);
    expect(skies.size).toBeGreaterThan(2);
  });

  it('flies as an approach at the level and on the deck the player picks', () => {
    const daily = dailyApproach(DAILY.forKey('2026-11-02'));
    const setup = dailySetup(daily, 'captain', 'glass');
    expect(setup).toMatchObject({ mode: 'approach', level: 'captain', deck: 'glass' });
    const flight = createFlight(setup, terrain);
    expect(flight.world.weather.destination.wind.speedKt).toBeCloseTo(daily.wind.speedKt);
  });

  it('shares the weather and the result, not the flying', () => {
    const daily = {
      ...dailyApproach(DAILY.forKey('2026-11-02')),
      number: 12,
      sky: 'minimums' as const,
    };
    const result: DailyApproachResult = {
      landed: true,
      points: 812,
      stars: 2,
      starsText: '★★☆',
      sinkFpm: 142.4,
      field: 'BOS',
      level: 'pilot',
      deck: 'classic',
    };
    const text = dailyShareText(
      { ...daily, wind: { direction: 90, speedKt: 18, gustKt: 0 } },
      300,
      result,
    );
    expect(text).toBe(
      'Flight 312 · Daily Approach #12 · BOS ☁️ 300 ft · 💨 18 kt · 🛬 142 fpm · ★★☆ · Pilot',
    );
    const crashed = dailyShareText(daily, 300, {
      ...result,
      landed: false,
      sinkFpm: null,
      stars: 0,
      starsText: '☆☆☆',
    });
    expect(crashed).toContain('💥');
  });
});
