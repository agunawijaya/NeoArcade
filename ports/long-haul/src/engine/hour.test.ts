import { createRng } from '@shared/rng';
import { describe, expect, it } from 'vitest';
import { eventsOfType } from './events';
import { blowsOut, clampSpeed, crashCause, crashChance, driveHour } from './hour';
import { patrolThreshold, ticketChance } from './police';
import { calm, testTrip } from './test-trips';
import { stopMile, totalMiles } from './trip';

describe('an hour on the road', () => {
  it('moves the odometer and the clock, and burns the fuel of line 1490', () => {
    const trip = testTrip();
    calm(trip);
    const fuel = trip.fuel;
    const result = driveHour(trip, 55);
    expect(result).toMatchObject({ speed: 55, capped: false, fromMile: 0, toMile: 55 });
    expect(trip.hr).toBe(2);
    expect(trip.awake).toBe(4);
    expect(fuel - trip.fuel).toBeCloseTo(55 / 4.5, 6);
  });

  it('caps the speed at one and a half times the limit, and never below 20', () => {
    const trip = testTrip();
    expect(clampSpeed(trip, 99)).toEqual({ speed: 82, capped: true });
    expect(clampSpeed(trip, 5)).toEqual({ speed: 20, capped: false });
    trip.limit = 35;
    expect(clampSpeed(trip, 60)).toEqual({ speed: 52, capped: true });
  });

  it('crashes when speed² × fatigue × weather beats ten million times a roll', () => {
    const trip = testTrip();
    calm(trip);
    expect(crashChance(trip, 55)).toBeCloseTo(3025 / 1e7, 12);
    trip.fatigue = 'exhausted';
    trip.condition = 'blizzard';
    expect(crashChance(trip, 82)).toBe(1);
    const result = driveHour(trip, 82);
    expect(trip.status).toBe('crashed');
    expect(result.events.at(-1)).toMatchObject({ type: 'crash', cause: 'asleep', speed: 82 });
    expect(trip.miles).toBe(0);
  });

  it('names the crash the way lines 4070–4120 do', () => {
    expect(crashCause({ fatigue: 'fatigued', condition: 'clear' }, 60)).toBe('asleep');
    expect(crashCause({ fatigue: 'fatigued', condition: 'clear' }, 70)).toBe('speed');
    expect(crashCause({ fatigue: 'fine', condition: 'blizzard' }, 70)).toBe('snow-ditch');
    expect(crashCause({ fatigue: 'fine', condition: 'fog' }, 50)).toBe('pickup');
    expect(crashCause({ fatigue: 'fine', condition: 'rain' }, 50)).toBe('skid');
    expect(crashCause({ fatigue: 'fine', condition: 'wet' }, 50)).toBe('skid');
    expect(crashCause({ fatigue: 'fine', condition: 'clear' }, 50)).toBe('drunk-driver');
  });

  it('blows tyres exactly as √(MF+100)·TC > RH·25000·RND', () => {
    const trip = testTrip();
    const rng = createRng(7);
    for (let sample = 0; sample < 2000; sample++) {
      trip.miles = Math.floor(rng.next() * 3000);
      trip.tyreWear = Math.floor(rng.next() * 12) - 1;
      const roll = rng.next();
      const original =
        Math.sqrt(trip.miles + 100) * trip.tyreWear > trip.route.factor * 25_000 * roll;
      expect(blowsOut(trip, roll)).toBe(original);
    }
  });

  it('changes the spare in an hour or two, counting hours awake, not the clock', () => {
    const trip = testTrip({ seed: 3 });
    calm(trip);
    trip.tyreWear = 1_000_000;
    trip.hr = 30;
    trip.awake = 5;
    const result = driveHour(trip, 50);
    const [blowout] = eventsOfType(result.events, 'blowout');
    expect(blowout).toMatchObject({ spare: true, cents: 0 });
    const hours = blowout?.hours ?? 0;
    expect(hours === 1 || hours === 2).toBe(true);
    // HL = HL + T + 1, then the hour itself.
    expect(trip.awake).toBe(5 + hours + 1 + 1);
    expect(trip.spare).toBe(0);
  });

  it('calls a tow truck when the spare is gone', () => {
    const trip = testTrip();
    calm(trip);
    trip.tyreWear = 1_000_000;
    trip.spare = 0;
    const result = driveHour(trip, 50);
    expect(eventsOfType(result.events, 'blowout')[0]).toMatchObject({
      spare: false,
      hours: 4,
      cents: 40_000,
    });
    expect(trip.expenses.some((expense) => expense.kind === 'tow')).toBe(true);
  });

  it('runs dry, covers the last miles, and pays $200 for the barrel', () => {
    const trip = testTrip();
    calm(trip);
    trip.fuel = 4.5;
    const result = driveHour(trip, 55);
    const [dry] = eventsOfType(result.events, 'out-of-fuel');
    expect(dry?.lastMiles).toBeCloseTo(4.5 * 4.5, 6);
    expect(trip.miles).toBe(Math.round(4.5 * 4.5));
    expect(trip.fuel).toBe(55);
    expect(trip.expenses.find((expense) => expense.kind === 'barrel')?.cents).toBe(20_000);
  });
});

describe('the police', () => {
  it('take an interest above limit − RH + 10, and ticket on (SP − SL + 2RH − 5)² / 900', () => {
    const middle = testTrip({ route: 'middle' });
    expect(patrolThreshold(middle)).toBe(63);
    expect(ticketChance(middle, 63)).toBe(0);
    expect(ticketChance(middle, 65)).toBeCloseTo(81 / 900, 12);
    expect(ticketChance(middle, 80)).toBeCloseTo(576 / 900, 12);
    const north = testTrip({ route: 'north' });
    expect(patrolThreshold(north)).toBe(61);
    expect(ticketChance(north, 82)).toBe(1);
  });

  it('fine you, keep you waiting an hour per offence, and jail you on the fourth', () => {
    const trip = testTrip({ route: 'north' });
    calm(trip);
    const result = driveHour(trip, 82);
    const [ticket] = eventsOfType(result.events, 'pulled-over');
    expect(ticket).toMatchObject({ offence: 1, waitHours: 1, overBy: 27, byRadar: false });
    expect(ticket?.cents).toBe((ticket?.baseCents ?? 0) + (ticket?.perMphCents ?? 0) * 27);
    expect(trip.hr).toBe(1 + 1 + 1);

    const repeat = testTrip({ route: 'north', offences: 3 });
    calm(repeat);
    driveHour(repeat, 82);
    expect(repeat.status).toBe('jailed');
    expect(repeat.events.at(-1)).toMatchObject({ type: 'jailed', offence: 4 });
  });
});

describe('waypoints', () => {
  it('turn the clock ahead at Needles and count the shift', () => {
    const trip = testTrip({ route: 'middle' });
    calm(trip);
    while (trip.next < 2 && trip.status === 'driving') {
      calm(trip);
      driveHour(trip, 60);
    }
    expect(trip.zoneShift).toBe(1);
    expect(trip.events.some((event) => event.type === 'time-zone')).toBe(true);
  });

  it('charge the last toll even when the final hour races past it', () => {
    const trip = testTrip({ route: 'middle' });
    calm(trip);
    const last = trip.route.stops.length - 1;
    trip.next = last - 1;
    trip.miles = stopMile(trip, last - 1) - 20;
    trip.fuel = 200;
    driveHour(trip, 80);
    expect(trip.status).toBe('arrived');
    expect(trip.events.some((event) => event.type === 'toll' && event.cents === 4_000)).toBe(true);
    expect(trip.miles).toBe(totalMiles(trip));
  });

  it('send an overweight rig round Louisiana by Arkansas county roads', () => {
    // Search seeds until the coin toss opens the scale, which is all that varies.
    for (let seed = 1; seed < 200; seed++) {
      const trip = testTrip({ route: 'south', load: 50_000, seed });
      calm(trip);
      const border = trip.route.stops.findIndex((stop) => stop.place === 'la-border-i20');
      trip.next = border;
      trip.miles = stopMile(trip, border) - 30;
      trip.fuel = 200;
      driveHour(trip, 50);
      const barred = trip.events.find((event) => event.type === 'barred');
      if (!barred) continue;
      expect(barred).toMatchObject({ state: 'Louisiana', detourMiles: 200 });
      expect(trip.extraMiles).toBe(200);
      expect(totalMiles(trip)).toBe(3320);
      expect(stopMile(trip, border + 1)).toBe(1985);
      expect(trip.limit).toBe(45);
      return;
    }
    throw new Error('No seed opened the Louisiana scale.');
  });
});
