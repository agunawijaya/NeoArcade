import { createArcadePass } from '@shared/pass';
import { describe, expect, it } from 'vitest';
import manifest from '../../pass.manifest';
import { testTrip } from '../engine/test-trips';
import type { Trip } from '../engine/trip';
import { cautious, driveTrip } from '../sim/drivers';
import { droveThroughTheNight, findings, longestStretch, reportTrip } from './pass-report';

function deliveredTrip(seed: number): Trip {
  // A careful driver on the middle route; try seeds until one arrives.
  for (let attempt = 0; attempt < 30; attempt++) {
    const trip = testTrip({ seed: seed + attempt, tyres: { kind: 'retread', count: 2 } });
    driveTrip(trip, cautious);
    if (trip.status === 'arrived') return trip;
  }
  throw new Error('No trip arrived in thirty tries.');
}

describe('the Arcade Pass report', () => {
  it('finds the delivery badges of a coast-to-coast Single Haul', () => {
    const trip = deliveredTrip(100);
    const found = findings({ mode: 'single', trip, dishes: false, bankrupt: false });
    expect(found.delivered).toBe(true);
    expect(found.unlock).toEqual(
      expect.arrayContaining(['first-load', 'coast-to-coast', 'holland-tunnel']),
    );
    expect(found.unlock).not.toContain('westbound');
    expect(found.xp).toBeGreaterThanOrEqual(30);
    expect(found.xp).toBeLessThanOrEqual(250);
  });

  it('awards only a little for a trip that ended on the road', () => {
    const trip = testTrip();
    trip.status = 'crashed';
    const found = findings({ mode: 'single', trip, dishes: false, bankrupt: false });
    expect(found.delivered).toBe(false);
    expect(found.unlock).not.toContain('first-load');
    expect(found.xp).toBe(10);
  });

  it('measures the longest run between truck stops', () => {
    const trip = testTrip();
    trip.miles = 900;
    trip.events.push(
      { type: 'truck-stop', number: 1, dieselCents: 99, hr: 10, mile: 250 },
      { type: 'truck-stop', number: 2, dieselCents: 99, hr: 20, mile: 870 },
    );
    expect(longestStretch(trip)).toBe(620);
    expect(findings({ mode: 'single', trip, dishes: false, bankrupt: false }).unlock).toContain(
      'iron-bladder',
    );
  });

  it('knows a night driven straight through from midnight to five', () => {
    const trip = testTrip();
    // The trip leaves at 8 AM: hour 17 of the trip is the midnight hour.
    trip.trail = Array.from({ length: 24 }, (_, index) => ({
      hr: index + 1,
      mile: index * 50,
      speed: 55,
      condition: 'clear' as const,
    }));
    expect(droveThroughTheNight(trip)).toBe(true);
    trip.trail = trip.trail.map((point) => (point.hr === 19 ? { ...point, speed: 0 } : point));
    expect(droveThroughTheNight(trip)).toBe(false);
  });

  it('remembers the secret moments', () => {
    const trip = testTrip();
    trip.events.push({
      type: 'out-of-fuel',
      lastMiles: 3.2,
      cents: 20_000,
      hours: 2,
      damage: 0,
      parked: false,
      hr: 30,
      mile: 700,
    });
    const found = findings({ mode: 'single', trip, dishes: true, bankrupt: true });
    expect(found.unlock).toEqual(
      expect.arrayContaining(['dummy', 'washing-dishes', 'repossessed']),
    );
  });

  it('reports to a Pass: stats, badges and XP', () => {
    const arcade = createArcadePass({
      backend: null,
      now: () => new Date('2026-10-04T12:00:00Z'),
      watchOtherTabs: false,
    });
    const pass = arcade.forGame(manifest);
    const trip = deliveredTrip(300);
    const granted = reportTrip(pass, { mode: 'single', trip, dishes: false, bankrupt: false });
    expect(granted).toBeGreaterThan(0);
    expect(pass.hasBadge('first-load')).toBe(true);
    expect(pass.statOf('trips')).toBe(1);
    expect(pass.statOf('delivered')).toBe(1);
    expect(pass.statOf('miles')).toBeGreaterThan(2500);
  });
});
