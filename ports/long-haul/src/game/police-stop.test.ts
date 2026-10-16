import { createStore } from '@shared/storage';
import { describe, expect, it } from 'vitest';
import type { EventOf } from '../engine/events';
import { testTrip } from '../engine/test-trips';
import type { Trip } from '../engine/trip';
import { RIG_PAINTS } from '../render/vehicles/rig/model';
import { defaultSettings } from '../settings';
import { CbRadio } from './cb-radio';
import { PoliceStop, RadarPass, type StopFacts, type StopMode, type StopStep } from './police-stop';
import { TripSession } from './session';

const ticketed: EventOf<'pulled-over'> = {
  type: 'pulled-over',
  offence: 2,
  waitHours: 2,
  baseCents: 1500,
  perMphCents: 400,
  overBy: 16,
  cents: 7900,
  byRadar: false,
  detectorCents: 7500,
  hr: 30,
  mile: 900,
};

const jailed: EventOf<'jailed'> = { type: 'jailed', offence: 4, waitHours: 4, hr: 30, mile: 900 };

function facts(event: StopFacts['event']): StopFacts {
  return {
    event,
    speed: 71,
    limit: 55,
    reading: null,
    hour: 21,
    night: true,
    town: 'Salina',
    clock: 'MON 9 PM',
    flavour: 1234,
    cruise: 71,
  };
}

/** Plays a stop through, reading every ticket at once; returns the steps it went through. */
function playThrough(stop: PoliceStop): StopStep[] {
  const seen: StopStep[] = [];
  for (let frame = 0; frame < 10_000 && !stop.done; frame++) {
    if (seen.at(-1) !== stop.step) seen.push(stop.step);
    if (stop.waiting) stop.proceed();
    stop.update(1 / 30);
  }
  return seen;
}

describe('a police stop on the road', () => {
  it('takes a ticketed driver through the hearing, and only a fourth offence to jail', () => {
    expect(playThrough(new PoliceStop(facts(ticketed), 'full', false))).toEqual([
      'behind',
      'overtake',
      'pull-over',
      'officer',
      'ticket',
      'hearing',
      'leave',
    ]);
    expect(playThrough(new PoliceStop(facts(jailed), 'full', false))).toEqual([
      'behind',
      'overtake',
      'pull-over',
      'officer',
      'jail',
    ]);
  });

  it('keeps the short version to the overtake and the ticket', () => {
    expect(playThrough(new PoliceStop(facts(ticketed), 'short', false))).toEqual([
      'overtake',
      'pull-over',
      'ticket',
      'leave',
    ]);
    expect(playThrough(new PoliceStop(facts(jailed), 'short', false))).toEqual([
      'overtake',
      'pull-over',
      'jail',
    ]);
  });

  it('waits on the ticket and on the revoked licence until the player has read them', () => {
    for (const [event, waitsAt] of [
      [ticketed, 'ticket'],
      [jailed, 'jail'],
    ] as const) {
      const stop = new PoliceStop(facts(event), 'short', false);
      for (let frame = 0; frame < 3000 && !stop.waiting; frame++) stop.update(1 / 30);
      expect(stop.step).toBe(waitsAt);
      for (let frame = 0; frame < 3000; frame++) stop.update(1 / 30);
      expect(stop.step).toBe(waitsAt);
      stop.proceed();
      expect(stop.step).not.toBe(waitsAt);
    }
  });

  it('can be skipped only once a stop has been seen, first to the ticket, then to the end', () => {
    const firstTime = new PoliceStop(facts(ticketed), 'full', false);
    firstTime.skip();
    expect(firstTime.step).toBe('behind');

    const again = new PoliceStop(facts(ticketed), 'full', true);
    again.update(1);
    again.skip();
    expect(again.step).toBe('ticket');
    expect(again.overlay().kind).toBe('ticket');
    again.skip();
    expect(again.done).toBe(true);

    const fourth = new PoliceStop(facts(jailed), 'full', true);
    fourth.skip();
    expect(fourth.step).toBe('jail');
    expect(fourth.waiting).toBe(true);
  });

  it('brings the rig to a stop on the shoulder behind the cruiser, and away again', () => {
    const stop = new PoliceStop(facts(ticketed), 'full', false);
    while (stop.step !== 'officer') stop.update(1 / 30);
    const pose = stop.pose();
    expect(stop.rigSpeed()).toBe(0);
    expect(pose.rigLane).toBe(-1);
    expect(pose.lane).toBe(-1);
    expect(pose.gap).toBeGreaterThan(17.6);
    expect(pose.hazards).toBe(true);
    while (!stop.done) {
      if (stop.waiting) stop.proceed();
      stop.update(1 / 30);
    }
    expect(stop.pose().rigLane).toBe(0);
  });

  it('prints the engine’s fine on the ticket, detector and all', () => {
    const ticket = new PoliceStop(facts(ticketed), 'short', false).ticket;
    if (!ticket) throw new Error('a ticketed stop writes a ticket');
    expect(ticket.baseCents + ticket.overCents).toBe(ticketed.cents);
    expect(ticket.totalCents).toBe(ticketed.cents + 7500);
    expect(new PoliceStop(facts(jailed), 'short', false).ticket).toBeNull();
  });

  it('lets a radar check that found nothing go by without stopping', () => {
    const pass = new RadarPass(false, 60);
    let flashed = false;
    while (!pass.done) {
      pass.update(1 / 30);
      flashed ||= pass.pose().lights.bar;
      expect(pass.pose().rigLane).toBe(0);
    }
    expect(flashed).toBe(true);
    expect(pass.pose().gap).toBeGreaterThan(65);
  });
});

/** Drives a whole Single Haul flat out in real time, showing police stops the given way. */
interface FlatOut {
  trip: Trip;
  policeFrames: number;
  locked: boolean;
  /** The art of every event card shown. */
  cards: string[];
}

function driveFlatOut(stops: StopMode | 'card'): FlatOut {
  const settings = defaultSettings();
  let policeFrames = 0;
  let locked = true;
  const cards: string[] = [];
  const session: TripSession = new TripSession({
    trip: testTrip({ seed: 7, route: 'north' }),
    settings: () => settings,
    season: 'winter',
    departureUtc: Date.parse('1982-03-01T16:00:00Z'),
    odometerStart: 0,
    paint: RIG_PAINTS.classic,
    cb: new CbRadio(createStore('long-haul-test', null)),
    reducedMotion: () => true,
    stops: { mode: () => stops, seen: () => false, markSeen: () => {} },
    hooks: {
      card: (copy, _beat, done) => {
        cards.push(copy.art);
        done();
      },
      quick: () => {},
      passed: () => {},
      stopOffer: () => {},
      askStop: (_offer, answer) => answer(false),
      atStop: (_visit, _diner, done) => done(),
      plan: (_plan, go) => go(80),
      cb: () => {},
      hour: () => {},
      ended: () => {},
    },
  });
  session.start();
  for (let frame = 0; frame < 200_000 && session.phase !== 'done'; frame++) {
    session.setThrottle(80);
    const stop = session.policeStop;
    if (session.phase === 'police' && stop) {
      policeFrames++;
      // While stopped, the throttle does nothing: the stop decides how fast the rig goes.
      locked &&= session.scene().speed === stop.rigSpeed();
      if (stop.waiting) session.proceedStop();
    }
    session.update(0.1);
  }
  return { trip: session.trip, policeFrames, locked, cards };
}

describe('a police stop in a trip', () => {
  it('changes nothing the engine decided, whether shown in full, short or as a card', () => {
    const card = driveFlatOut('card');
    const full = driveFlatOut('full');
    const short = driveFlatOut('short');
    expect(card.policeFrames).toBe(0);
    expect(full.policeFrames).toBeGreaterThan(0);
    // Card only keeps the original's card; the scene replaces it.
    expect(card.cards).toContain('police');
    expect(full.cards).not.toContain('police');
    for (const shown of [full, short]) {
      expect(shown.trip.hr).toBe(card.trip.hr);
      expect(shown.trip.miles).toBe(card.trip.miles);
      expect(shown.trip.offences).toBe(card.trip.offences);
      expect(shown.trip.status).toBe(card.trip.status);
      expect(shown.trip.expenses).toEqual(card.trip.expenses);
      expect(shown.trip.events).toEqual(card.trip.events);
      expect(shown.locked).toBe(true);
    }
  });
});
