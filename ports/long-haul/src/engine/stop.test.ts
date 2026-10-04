import { describe, expect, it } from 'vitest';
import { dockWaitHours, deliveryIfArrivingAt, settle } from './arrival';
import { driveHour } from './hour';
import { judgeTrip, FRESH_RECORD } from './single-haul';
import { buyFuel, buyTyre, declineStop, drinkCoffee, finishStop, openStop } from './stop';
import { calm, testTrip } from './test-trips';
import { hourOfDay } from './trip';

describe('the truck stop', () => {
  it('is offered once more than three hours have passed', () => {
    const trip = testTrip();
    const offered: boolean[] = [];
    for (let hour = 0; hour < 5; hour++) {
      calm(trip);
      offered.push(trip.stopOffered);
      if (trip.stopOffered) declineStop(trip);
      driveHour(trip, 55);
    }
    expect(offered).toEqual([false, false, false, true, true]);
  });

  it('costs an hour awake to pass up', () => {
    const trip = testTrip();
    const awake = trip.awake;
    declineStop(trip);
    expect(trip.awake).toBe(awake + 1);
  });

  it('sells diesel at 85¢ to $1.19 and spills what the tank cannot hold', () => {
    for (let seed = 1; seed < 40; seed++) {
      const trip = testTrip({ seed });
      const { visit } = openStop(trip);
      expect(visit.dieselCents).toBeGreaterThanOrEqual(85);
      expect(visit.dieselCents).toBeLessThanOrEqual(119);
    }
    const trip = testTrip();
    const { visit } = openStop(trip);
    const pumped = buyFuel(trip, visit, 10);
    expect(pumped).toMatchObject({ gallons: 10, spilled: 0, cents: visit.dieselCents * 10 });
    expect(trip.fuel).toBe(200);
    const spill = buyFuel(trip, visit, 15);
    expect(spill.spilled).toBe(15);
    expect(trip.fuel).toBe(200);
  });

  it('sells the tyre the original never got round to', () => {
    const trip = testTrip();
    trip.spare = 0;
    const { visit } = openStop(trip);
    expect(visit.tyres?.newCents).toBeGreaterThanOrEqual(20_000);
    expect(visit.tyres?.retreadCents).toBeLessThan(17_000);
    buyTyre(trip, visit, 'new');
    expect(trip.spare).toBe(2);
    expect(() => buyTyre(trip, visit, 'retread')).toThrow();
  });

  it('halves daytime sleep in the bunk, not in a motel', () => {
    const night = testTrip();
    night.hr = 13; // 8 AM + 13 h, then the stop's hour: 10 PM.
    const atNight = finishStop(night, openStop(night).visit, { hours: 8, motel: false });
    expect(atNight[0]).toMatchObject({ type: 'slept', hours: 8, sleep: 8, daytime: false });
    expect(night.awake).toBe(0);

    const day = testTrip();
    day.hr = 1; // 9 AM, then 10 AM.
    const byDay = finishStop(day, openStop(day).visit, { hours: 8, motel: false });
    expect(byDay[0]).toMatchObject({ sleep: 4, daytime: true });

    const motel = testTrip();
    motel.hr = 1;
    const quiet = finishStop(motel, openStop(motel).visit, { hours: 8, motel: true });
    expect(quiet[0]).toMatchObject({ sleep: 8, motel: true });
    expect(motel.expenses.some((expense) => expense.kind === 'motel')).toBe(true);
  });

  it('runs the reefer on diesel while you sleep with oranges', () => {
    const trip = testTrip({ cargo: 'oranges' });
    const fuel = trip.fuel;
    finishStop(trip, openStop(trip).visit, { hours: 6, motel: false });
    expect(fuel - trip.fuel).toBe(42);
  });

  it('pours one useful coffee', () => {
    const trip = testTrip();
    trip.awake = 9;
    const { visit } = openStop(trip);
    drinkCoffee(trip, visit);
    expect(trip.awake).toBe(7);
    expect(() => drinkCoffee(trip, visit)).toThrow();
  });

  it('judges the driver afresh after sleeping', () => {
    const trip = testTrip();
    trip.awake = 21;
    trip.fatigue = 'exhausted';
    trip.hr = 13;
    finishStop(trip, openStop(trip).visit, { hours: 9, motel: false });
    expect(trip.fatigue).toBe('rested');
  });
});

describe('arriving', () => {
  it('keeps the warehouse shut from 6 PM to 6 AM', () => {
    expect(dockWaitHours(17)).toBe(0);
    expect(dockWaitHours(18)).toBe(12);
    expect(dockWaitHours(23)).toBe(7);
    expect(dockWaitHours(5)).toBe(1);
    expect(dockWaitHours(6)).toBe(0);
  });

  it('makes freight late from Friday 7 AM, so Thursday night still makes it', () => {
    const trip = testTrip();
    expect(deliveryIfArrivingAt(trip, 80)).toEqual({ deliveredHr: 80, late: false });
    expect(deliveryIfArrivingAt(trip, 87)).toEqual({ deliveredHr: 94, late: false });
    expect(deliveryIfArrivingAt(trip, 94)).toEqual({ deliveredHr: 94, late: false });
    expect(deliveryIfArrivingAt(trip, 95)).toEqual({ deliveredHr: 95, late: true });
    expect(deliveryIfArrivingAt(trip, 106)).toEqual({ deliveredHr: 118, late: true });
  });

  it('charges $85 a day started and subtracts the late penalty', () => {
    const trip = testTrip({ cargo: 'freight', load: 40_000 });
    trip.hr = 100; // Friday noon.
    expect(hourOfDay(trip)).toBe(12);
    trip.status = 'arrived';
    settle(trip);
    expect(trip.settlement).toMatchObject({
      days: 4,
      hours: 4,
      truckCents: 5 * 8_500,
      rateCents: 200_000,
      late: true,
      paidCents: 180_000,
    });
  });

  it('docks 5 % per point of orange damage, and dumps them past six', () => {
    const fresh = testTrip({ cargo: 'oranges', load: 40_000 });
    fresh.hr = 76;
    fresh.damage = 2;
    settle(fresh);
    expect(fresh.settlement).toMatchObject({ rateCents: 260_000, paidCents: 234_000 });
    const rotten = testTrip({ cargo: 'oranges', load: 40_000 });
    rotten.hr = 76;
    rotten.damage = 7;
    settle(rotten);
    expect(rotten.settlement).toMatchObject({ spoiled: true, paidCents: -5_000 });
  });

  it('pays the mail its 4.75 cents a pound', () => {
    const trip = testTrip({ cargo: 'mail', load: 30_000 });
    trip.hr = 76;
    settle(trip);
    expect(trip.settlement?.paidCents).toBe(142_500);
  });

  it('praises, averages and scolds as lines 5400–5490 do', () => {
    const settlement = (profitCents: number) =>
      ({ profitCents }) as Parameters<typeof judgeTrip>[1];
    const first = judgeTrip(FRESH_RECORD, settlement(15_000), 0);
    expect(first.verdict).toMatchObject({
      goodWork: true,
      averageCents: null,
      dishes: true,
      bankrupt: false,
    });
    const second = judgeTrip(first.record, settlement(60_000), 0);
    expect(second.verdict).toMatchObject({ averageCents: 37_500, dishes: false });
    expect(judgeTrip(FRESH_RECORD, settlement(-1), 0).verdict.bankrupt).toBe(true);
    expect(judgeTrip(second.record, settlement(-20_000), 0).verdict.bankrupt).toBe(false);
  });
});

describe('a whole trip', () => {
  it('reaches New York with a careful driver more often than not', () => {
    let arrived = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const trip = testTrip({ seed, cargo: 'mail' });
      while (trip.status === 'driving') {
        if (trip.stopOffered) {
          const { visit } = openStop(trip);
          buyFuel(trip, visit, Math.max(0, 190 - trip.fuel));
          const tired = trip.awake > 10;
          finishStop(trip, visit, tired ? { hours: 8, motel: false } : null);
          continue;
        }
        driveHour(trip, 55);
      }
      if (trip.status === 'arrived') arrived++;
    }
    expect(arrived).toBeGreaterThan(30);
  });
});
