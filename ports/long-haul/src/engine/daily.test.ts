import { addDays, dailyChallenge } from '@shared/daily';
import { describe, expect, it } from 'vitest';
import { HUB_IDS } from '../data/places';
import { contractRoutes, contractTrip } from './contracts';
import { dailyHaul, dailyShareText, type DailyResult } from './daily-haul';
import { STOCK_RIG } from './rig';
import { startTrip } from './start';

const daily = dailyChallenge({ game: 'long-haul', launch: '2026-10-04' });

describe('the Daily Haul', () => {
  it('is the same load for everyone on the same day, and a different one the next', () => {
    const today = daily.forKey('2026-10-04');
    expect(dailyHaul(today.seed, today.key)).toEqual(dailyHaul(today.seed, today.key));
    const tomorrow = daily.forKey('2026-10-05');
    expect(dailyHaul(tomorrow.seed, tomorrow.key).contract).not.toEqual(
      dailyHaul(today.seed, today.key).contract,
    );
  });

  it('is a haul of a day or three between two different hubs, for a year of days', () => {
    for (let offset = 0; offset < 366; offset++) {
      const day = daily.forKey(addDays('2026-10-04', offset));
      const { contract, season } = dailyHaul(day.seed, day.key);
      expect(HUB_IDS).toContain(contract.from);
      expect(HUB_IDS).toContain(contract.to);
      expect(contract.from).not.toBe(contract.to);
      expect(contract.miles).toBeGreaterThanOrEqual(700);
      expect(contract.miles).toBeLessThanOrEqual(1900);
      expect(contract.payCents).toBeGreaterThan(0);
      expect(['winter', 'spring', 'summer', 'autumn']).toContain(season);
    }
  });

  it('starts the same trip for two drivers who choose the same road', () => {
    const day = daily.forKey('2026-11-02');
    const haul = dailyHaul(day.seed, day.key);
    const option = contractRoutes(haul.contract)[0];
    if (!option) throw new Error('No road.');
    const setup = () =>
      startTrip(
        contractTrip({
          contract: haul.contract,
          option,
          tyres: { kind: 'none' },
          seed: haul.seed,
          difficulty: 'normal',
          season: haul.season,
          offences: 0,
          rig: STOCK_RIG,
        }),
      ).trip;
    expect(setup()).toEqual(setup());
  });

  it('shares the profit and the time, never the road', () => {
    const day = daily.forKey('2026-10-04');
    const haul = dailyHaul(day.seed, day.key);
    const result: DailyResult = {
      profitCents: 41_250,
      hours: 31,
      delivered: true,
      outcome: 'delivered',
      tickets: 1,
      late: false,
    };
    const text = dailyShareText(day.number, haul, result, {
      from: 'Miami',
      to: 'Washington, D.C.',
    });
    expect(text).toContain('Daily #1');
    expect(text).toContain('$413');
    expect(text).toContain('1 d 7 h');
    expect(text).toContain('🚓×1');
    expect(text).not.toMatch(/I-\d+/);
    const crashed = dailyShareText(
      day.number,
      haul,
      { ...result, delivered: false, outcome: 'crashed' },
      { from: 'Miami', to: 'Washington, D.C.' },
    );
    expect(crashed).toContain('Lost the rig');
  });
});
