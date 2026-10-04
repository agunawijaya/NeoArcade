import { describe, expect, it } from 'vitest';
import {
  activeOffences,
  buyUpgrade,
  careerBoard,
  careerRig,
  careerSeason,
  CAREER_START_CENTS,
  finishContract,
  newCareer,
  OFFENCE_MEMORY_DAYS,
  rigWith,
  sanitiseCareer,
  summarise,
  tripSeed,
  waitADay,
  wreckCents,
  WRECK_REPUTATION,
  type Career,
} from './career';
import {
  contractPay,
  contractRoutes,
  contractTrip,
  HEAVY_LOAD,
  jobBoard,
  legalFuel,
  terminalFuel,
  type Contract,
} from './contracts';
import { createRng } from '@shared/rng';
import { RULES } from './rules';
import { startTrip } from './start';
import { expensesTotal, legalLoad, type Trip } from './trip';

function firstLoad(career: Career): { contract: Contract; trip: Trip } {
  const contract = careerBoard(career)[0] as Contract;
  const option = contractRoutes(contract)[0];
  if (!option) throw new Error('No road for the test load.');
  const { trip } = startTrip(
    contractTrip({
      contract,
      option,
      tyres: { kind: 'none' },
      seed: tripSeed(career, contract),
      difficulty: career.difficulty,
      season: careerSeason(career.day),
      offences: activeOffences(career),
      rig: careerRig(career),
      carriedFuel: career.fuel ?? 0,
    }),
  );
  return { contract, trip };
}

/** Pretends the trip went to plan: delivered at the hour given, with this profit. */
function delivered(trip: Trip, profitCents: number, hours = 30) {
  trip.status = 'arrived';
  trip.hr = hours;
  trip.miles = trip.route.miles;
  trip.settlement = {
    deliveredHr: hours,
    days: 1,
    truckCents: 17_000,
    paidCents: profitCents + 50_000,
    profitCents,
    late: false,
    spoiled: false,
    damage: 0,
    early: false,
  } as Trip['settlement'];
}

describe('a career', () => {
  it('starts in Los Angeles with $1,000, an old rig and a clean record', () => {
    const career = newCareer(42, 'normal');
    expect(career.hub).toBe('los-angeles');
    expect(career.cashCents).toBe(CAREER_START_CENTS);
    expect(career.odometer).toBeGreaterThan(940_000);
    expect(activeOffences(career)).toBe(0);
    expect(careerSeason(0)).toBe('spring');
  });

  it('posts the same board for the same day and hub, and a new one tomorrow', () => {
    const career = newCareer(7, 'normal');
    expect(careerBoard(career)).toEqual(careerBoard(career));
    const tomorrow = waitADay(career);
    expect(tomorrow.cashCents).toBe(career.cashCents - RULES.truckDayCents);
    expect(careerBoard(tomorrow).map((load) => load.id)).not.toEqual(
      careerBoard(career).map((load) => load.id),
    );
  });

  it('moves the rig, the money and the calendar when a load is delivered', () => {
    const career = newCareer(11, 'normal');
    const { contract, trip } = firstLoad(career);
    delivered(trip, 25_000);
    trip.fuel = 77.6;
    const next = finishContract(career, contract, trip);
    expect(next.hub).toBe(contract.to);
    expect(next.cashCents).toBe(career.cashCents + 25_000);
    expect(next.day).toBeGreaterThan(career.day);
    expect(next.fuel).toBe(77);
    expect(next.trips).toHaveLength(1);
    expect(next.reputation).toBeGreaterThan(career.reputation);
  });

  it('carries the diesel left in the tank to the next load and charges only the top-up', () => {
    const career = { ...newCareer(11, 'normal'), fuel: 150 };
    const { trip } = firstLoad(career);
    const diesel = trip.expenses
      .filter((expense) => expense.kind === 'fuel')
      .reduce((sum, expense) => sum + expense.cents, 0);
    expect(trip.fuel).toBeGreaterThanOrEqual(150);
    expect(diesel).toBe(Math.round(trip.fuel - 150) * 100);
  });

  it('survives a wreck, poorer, with the rig towed back and a week of the calendar gone', () => {
    const career = { ...newCareer(13, 'normal'), cashCents: 500_000 };
    const { contract, trip } = firstLoad(career);
    trip.status = 'crashed';
    trip.hr = 20;
    const next = finishContract(career, contract, trip);
    expect(next.status).toBe('active');
    expect(next.hub).toBe(contract.from);
    expect(next.cashCents).toBe(career.cashCents - expensesTotal(trip) - wreckCents(trip));
    expect(next.reputation).toBe(career.reputation + WRECK_REPUTATION);
    expect(next.trips[0]?.outcome).toBe('crashed');
  });

  it('is repossessed when a wreck or a loss leaves the bank below zero', () => {
    const career = newCareer(13, 'normal');
    const { contract, trip } = firstLoad(career);
    delivered(trip, -(career.cashCents + 1));
    expect(finishContract(career, contract, trip).status).toBe('repossessed');
  });

  it('ends at the fourth offence, and forgets offences after sixty days', () => {
    const career = newCareer(17, 'normal');
    const { contract, trip } = firstLoad(career);
    trip.status = 'jailed';
    expect(finishContract(career, contract, trip).status).toBe('jailed');
    const old = { ...career, day: 100, offenceDays: [10, 50, 99] };
    expect(activeOffences(old)).toBe(2);
    expect(activeOffences({ ...old, day: 99 + OFFENCE_MEMORY_DAYS })).toBe(0);
  });

  it('fits upgrades it can afford, once each, and they change the rig', () => {
    const career = { ...newCareer(19, 'normal'), cashCents: 1_000_000 };
    const upgraded = buyUpgrade(buyUpgrade(career, 'tank'), 'sleeper');
    expect(upgraded.cashCents).toBe(1_000_000 - 150_000 - 250_000);
    expect(careerRig(upgraded).tankGallons).toBe(300);
    expect(careerRig(upgraded).sleeper).toBe('sleeper-cab');
    expect(() => buyUpgrade(upgraded, 'tank')).toThrow();
    expect(() => buyUpgrade(newCareer(1, 'normal'), 'engine')).toThrow();
    expect(rigWith([]).tankGallons).toBe(RULES.tankGallons);
  });

  it('sums up a career and refuses a damaged save', () => {
    const career = newCareer(23, 'normal');
    expect(summarise(career)).toMatchObject({ trips: 0, delivered: 0, profitCents: 0 });
    expect(sanitiseCareer(career)).toEqual(career);
    expect(sanitiseCareer({ version: 2 })).toBeNull();
    expect(sanitiseCareer('career')).toBeNull();
    expect(sanitiseCareer({ ...career, cashCents: 'lots' })).toBeNull();
  });
});

describe('contracts', () => {
  it('pay per mile at the original rates, more for a rush or a heavy load', () => {
    const plain = contractPay('freight', 38_000, 2850, null, 1);
    expect(plain).toBe(190_000);
    expect(contractPay('freight', 38_000, 2850, 'rush', 1)).toBeGreaterThan(plain);
    expect(contractPay('freight', 38_000, 2850, 'heavy', 1)).toBeGreaterThan(plain);
    expect(contractPay('freight', 38_000, 1425, null, 1)).toBe(95_000);
  });

  it('post ordinary loads that are legal with any tank, and heavy ones legal with a light one', () => {
    for (let seed = 0; seed < 40; seed++) {
      for (const load of jobBoard({
        rng: createRng(seed),
        hub: 'chicago',
        season: 'summer',
        reputation: 60,
      })) {
        if (load.special === 'heavy') {
          expect(load.load).toBe(HEAVY_LOAD);
          expect(legalFuel(load.load)).toBeGreaterThan(80);
          expect(legalFuel(load.load)).toBeLessThan(RULES.tankGallons);
        } else {
          expect(load.load).toBeLessThanOrEqual(legalLoad(RULES.tankGallons));
        }
        expect(load.miles).toBeGreaterThanOrEqual(220);
        expect(load.from).toBe('chicago');
        expect(load.to).not.toBe('chicago');
      }
    }
  });

  it('fill a heavy load only as far as the scales allow', () => {
    const career = newCareer(5, 'normal');
    const contract = {
      ...(careerBoard(career)[0] as Contract),
      load: HEAVY_LOAD,
      special: 'heavy' as const,
    };
    const option = contractRoutes(contract)[0];
    if (!option) throw new Error('No road.');
    const setup = contractTrip({
      contract,
      option,
      tyres: { kind: 'none' },
      seed: 1,
      difficulty: 'normal',
      season: 'spring',
      offences: 0,
      rig: careerRig(career),
    });
    expect(setup.startFuel).toBe(legalFuel(HEAVY_LOAD));
    expect(terminalFuel(careerRig(career))).toBe(RULES.startFuel);
  });

  it('give newcomers shorter runs than drivers with a name', () => {
    const longest = (reputation: number) =>
      Math.max(
        ...Array.from({ length: 30 }, (_, seed) =>
          jobBoard({ rng: createRng(seed), hub: 'los-angeles', season: 'spring', reputation }),
        )
          .flat()
          .map((load) => load.miles),
      );
    expect(longest(0)).toBeLessThanOrEqual(900);
    expect(longest(90)).toBeGreaterThan(longest(0));
  });
});
