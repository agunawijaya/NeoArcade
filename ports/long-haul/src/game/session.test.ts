import { createStore } from '@shared/storage';
import { describe, expect, it } from 'vitest';
import { testTrip } from '../engine/test-trips';
import type { Landmark } from '../render/landmarks';
import { RIG_PAINTS } from '../render/rig';
import { defaultSettings } from '../settings';
import { CbRadio } from './cb-radio';
import { TripSession } from './session';

/** A real-time session that asks at every truck stop and always drives on. */
function drivingOnPastStops(onAsk: (session: TripSession) => void): TripSession {
  const settings = { ...defaultSettings(), eventPause: 'all' as const };
  const session: TripSession = new TripSession({
    trip: testTrip(),
    settings: () => settings,
    season: 'summer',
    departureUtc: Date.parse('1982-06-07T14:00:00Z'),
    odometerStart: 0,
    paint: RIG_PAINTS.classic,
    cb: new CbRadio(createStore('long-haul-test', null)),
    reducedMotion: () => true,
    hooks: {
      card: (_copy, _beat, done) => done(),
      quick: () => {},
      passed: () => {},
      stopOffer: () => {},
      askStop: (_offer, answer) => {
        onAsk(session);
        answer(false);
      },
      atStop: (_visit, _diner, done) => done(),
      plan: (_plan, go) => go(55),
      cb: () => {},
      hour: () => {},
      ended: () => {},
    },
  });
  return session;
}

const listed = (session: TripSession, sign: Landmark) =>
  session.scene().landmarks.some((landmark) => landmark.id === sign.id);

describe('the signs along the road', () => {
  it('keeps a passed-up truck stop sign until it has slid far behind the rig', () => {
    let sign: Landmark | undefined;
    const session = drivingOnPastStops((at) => {
      sign ??= at.scene().landmarks.find((landmark) => landmark.kind === 'truck-stop');
    });
    session.start();
    while (!sign && session.phase !== 'done') session.update(0.1);
    if (!sign) throw new Error('The trip ended before a truck stop was offered.');

    // The hour after the offer has begun, and the pole is still by the cab.
    expect(listed(session, sign)).toBe(true);
    const behind = () => session.scene().scroll - (sign as Landmark).u;
    while (behind() < 2500 && session.phase !== 'done') {
      session.update(0.1);
      expect(listed(session, sign)).toBe(true);
    }
    expect(behind()).toBeGreaterThanOrEqual(2500);

    while (behind() < 8000 && session.phase !== 'done') session.update(0.1);
    expect(listed(session, sign)).toBe(false);
  });

  it('gives each hour its own truck stop sign', () => {
    const session = drivingOnPastStops(() => {});
    session.start();
    for (let step = 0; step < 400 && session.phase !== 'done'; step++) {
      session.update(0.1);
      const ids = session.scene().landmarks.map((landmark) => landmark.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
