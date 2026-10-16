import { describe, expect, it } from 'vitest';
import {
  answerReadback,
  frequencyOf,
  startAtc,
  stepAtc,
  type AtcContext,
  type AtcCrew,
  type AtcEvent,
  type AtcSituation,
  type ReadbackChoice,
} from './atc';
import { facilitiesFor } from './plan';

const STEP = 0.25;

function contextFor(crew: AtcCrew, over: Partial<AtcContext> = {}): AtcContext {
  return {
    crew,
    rules: 'real',
    practice: 'flight',
    quiet: false,
    facilities: facilitiesFor('bos'),
    destinationName: 'Boston Logan',
    arrivalCity: 'Boston',
    departureRunway: '09R',
    arrivalRunway: '04R',
    departureHeading: 87,
    initialAltitudeFt: 10_000,
    cruiseAltitudeFt: 24_000,
    descentAltitudeFt: 11_000,
    interceptAltitudeFt: 2000,
    goAroundAltitudeFt: 3000,
    departureWind: { direction: 70, speedKt: 8, gustKt: 15 },
    arrivalWind: { direction: 40, speedKt: 12, gustKt: 0 },
    arrivalAltimeter: 29.87,
    squawk: '4632',
    ...over,
  };
}

/**
 * A radio and a crew around the ATC engine: the flight's numbers are set by
 * each test, the first officer's tuning is applied, and at the Pilot and
 * Captain levels a stand-in player tunes and answers as the test says.
 */
function radio(crew: AtcCrew, over: Partial<AtcContext> = {}) {
  const context = contextFor(crew, over);
  const state = startAtc(context);
  const start = { flight: 'clearance', takeoff: 'tower', approach: 'approach' } as const;
  const flight: AtcSituation = {
    time: 0,
    comm: frequencyOf(context.facilities, start[context.practice]),
    takeoffTime: false,
    airborne: false,
    heightFt: 0,
    altitudeFt: 20,
    fromDepartureNm: 0,
    toDestinationNm: 230,
    descentNm: 110,
    nearInterceptPoint: false,
    vectorHeading: 10,
    interceptHeading: 10,
    established: false,
    finalNm: 30,
    stopped: false,
    goingAround: false,
  };
  const events: AtcEvent[] = [];
  const player = {
    tunes: true,
    answer: (_choices: ReadbackChoice[]): ReadbackChoice['id'] | null => 'correct',
  };
  const fly = (seconds: number) => {
    for (let elapsed = 0; elapsed < seconds; elapsed += STEP) {
      flight.time += STEP;
      for (const event of stepAtc(state, flight, context)) {
        events.push(event);
        if (event.kind === 'tune') flight.comm = event.frequency;
      }
      if (crew === 'firstOfficer') continue;
      if (
        player.tunes &&
        state.handedTo &&
        state.queue.length === 0 &&
        flight.time >= state.busyUntil
      ) {
        flight.comm = frequencyOf(context.facilities, state.handedTo);
      }
      const pending = state.pending;
      if (pending && flight.time >= state.busyUntil + 2) {
        const choice = player.answer(pending.choices);
        if (choice) answerReadback(state, context, choice, flight.time);
      }
    }
  };
  const keys = () => state.log.map((call) => call.key);
  const said = () => state.log.map((call) => `${call.speaker}: ${call.text.written}`);
  return { context, state, flight, events, player, fly, keys, said, legsFlown: 0 };
}

/** Takeoff, climb, cruise, descent, the ILS and the landing, in broad strokes. */
const LEGS: { until: string; seconds: number; flight: Partial<AtcSituation> }[] = [
  { until: 'lined up', seconds: 57, flight: {} },
  { until: 'cleared for takeoff', seconds: 30, flight: { takeoffTime: true } },
  {
    until: 'climbing out',
    seconds: 40,
    flight: { airborne: true, heightFt: 1000, altitudeFt: 1020 },
  },
  {
    until: 'with the center',
    seconds: 60,
    flight: { heightFt: 8800, altitudeFt: 8820, fromDepartureNm: 35, toDestinationNm: 200 },
  },
  {
    until: 'top of descent',
    seconds: 40,
    flight: { heightFt: 24_000, altitudeFt: 24_000, fromDepartureNm: 120, toDestinationNm: 105 },
  },
  {
    until: 'with approach',
    seconds: 50,
    flight: { heightFt: 12_000, altitudeFt: 12_000, toDestinationNm: 40 },
  },
  {
    until: 'cleared for the ILS',
    seconds: 30,
    flight: { heightFt: 2000, altitudeFt: 2000, toDestinationNm: 14, nearInterceptPoint: true },
  },
  { until: 'cleared to land', seconds: 45, flight: { established: true, finalNm: 8 } },
  {
    until: 'stopped',
    seconds: 20,
    flight: { airborne: false, heightFt: 0, altitudeFt: 20, stopped: true },
  },
];

/** Flies on from wherever the flight is, leg by leg, up to the one named. */
function flyTo(r: ReturnType<typeof radio>, until: string) {
  for (const leg of LEGS.slice(r.legsFlown)) {
    Object.assign(r.flight, leg.flight);
    r.fly(leg.seconds);
    r.legsFlown++;
    if (leg.until === until) return;
  }
}

const flyToBoston = (r: ReturnType<typeof radio>) => flyTo(r, 'stopped');

describe('a flight with the first officer on the radio', () => {
  it('hands the flight from clearance to the Boston tower in order, each call read back', () => {
    const r = radio('firstOfficer');
    flyToBoston(r);
    expect(r.keys()).toEqual([
      'clearance',
      'readback',
      'contactTower',
      'readback',
      'checkInReady',
      'takeoff',
      'readback',
      'contactDeparture',
      'readback',
      'checkIn',
      'radarContact',
      'readback',
      'contactCenter',
      'readback',
      'checkIn',
      'centerClimb',
      'readback',
      'descend',
      'readback',
      'contactApproach',
      'readback',
      'checkIn',
      'vector',
      'readback',
      'approachClearance',
      'readback',
      'contactArrivalTower',
      'readback',
      'checkInFinal',
      'landing',
      'readback',
      'welcome',
    ]);
    expect(r.state.stage).toBe('done');
    expect(r.state.log.every((call) => call.heard)).toBe(true);
  });

  it('never puts two transmissions on the air at once', () => {
    const r = radio('firstOfficer');
    flyToBoston(r);
    const calls = r.state.log;
    for (let index = 1; index < calls.length; index++) {
      const previous = calls[index - 1];
      const call = calls[index];
      if (!previous || !call) continue;
      expect(call.at).toBeGreaterThanOrEqual(previous.at + previous.airtime + 1.2 - 1e-9);
    }
  });

  it('tunes each new frequency after reading the handoff back, and checks in on it', () => {
    const r = radio('firstOfficer');
    flyToBoston(r);
    const tuned = r.events.flatMap((event) => (event.kind === 'tune' ? [event.frequency] : []));
    const f = r.context.facilities;
    expect(tuned).toEqual([f.tower, f.departure, f.center, f.approach, f.arrivalTower]);
    const checkIn = r.state.log.find((call) => call.key === 'checkIn');
    expect(checkIn?.text.written).toBe(
      'Philadelphia Departure, Brightwater 312, 1,000 climbing 3,000.',
    );
    expect(checkIn?.frequency).toBe(f.departure);
  });

  it('keeps the clearance the flight holds: takeoff, altitudes, headings, approach, landing', () => {
    const r = radio('firstOfficer');
    flyTo(r, 'lined up');
    expect(r.state.cleared).toMatchObject({ takeoff: false, altitudeFt: 3000, heading: 87 });
    flyTo(r, 'cleared for takeoff');
    expect(r.state.cleared.takeoff).toBe(true);
    flyTo(r, 'climbing out');
    expect(r.state.cleared).toMatchObject({ altitudeFt: 10_000, heading: null });
    flyToBoston(r);
    expect(r.state.cleared).toMatchObject({
      altitudeFt: 2000,
      heading: 10,
      approach: true,
      landing: true,
    });
  });

  it('says it all the same way every time', () => {
    const first = radio('firstOfficer');
    const second = radio('firstOfficer');
    flyToBoston(first);
    flyToBoston(second);
    expect(second.said()).toEqual(first.said());
    expect(second.state.log.map((call) => call.at)).toEqual(first.state.log.map((call) => call.at));
  });
});

describe('the 1982 rules', () => {
  it('reads the program’s brief, clears the takeoff, and says nothing more until the ILS is captured', () => {
    const r = radio('firstOfficer', { rules: 'program' });
    const { flight, fly } = r;
    fly(10);
    expect(r.state.log[0]?.text.written).toContain('Surface winds variable, gusting to one fife');
    flight.takeoffTime = true;
    fly(30);
    Object.assign(flight, { airborne: true, heightFt: 1000, altitudeFt: 1020 });
    fly(50);
    const enRoute = r.keys().length;
    expect(r.keys().at(-1)).toBe('readback');
    Object.assign(flight, {
      heightFt: 30_000,
      altitudeFt: 30_000,
      fromDepartureNm: 150,
      toDestinationNm: 20,
    });
    fly(120);
    expect(r.said().slice(enRoute)).toEqual([]);
    Object.assign(flight, { heightFt: 1500, altitudeFt: 1500, established: true, finalNm: 5 });
    fly(20);
    expect(r.keys().slice(enRoute)).toEqual(['landing', 'readback']);
    expect(r.state.log.at(-2)?.speaker).toBe('arrivalTower');
  });
});

describe('readbacks at the Pilot level', () => {
  it('waits for the player’s readback and puts it in the captain’s voice', () => {
    const r = radio('pilot');
    r.fly(30);
    const wanted = r.events.filter((event) => event.kind === 'readbackWanted');
    expect(wanted.length).toBeGreaterThan(0);
    const readback = r.state.log.find((call) => call.key === 'readback');
    expect(readback?.speaker).toBe('captain');
    expect(readback?.text.written).toBe(
      'Cleared as filed, heading 087, 3,000, squawk 4632, Brightwater 312.',
    );
  });

  it('lets the first officer answer when the player does not', () => {
    const r = radio('pilot');
    r.player.answer = () => null;
    r.fly(40);
    const readback = r.state.log.find((call) => call.key === 'readback');
    expect(readback?.speaker).toBe('firstOfficer');
    expect(r.state.missedReadbacks).toBe(1);
  });

  it('has the first officer correct a wrong readback on the spot', () => {
    const r = radio('pilot');
    r.player.answer = () => 'wrong';
    r.fly(30);
    const readbacks = r.state.log.filter((call) => call.key === 'readback');
    expect(readbacks[0]?.text.written).toContain('heading 107');
    expect(readbacks[1]?.speaker).toBe('firstOfficer');
    expect(readbacks[1]?.text.written).toBe(
      'Correction, cleared as filed, heading 087, 3,000, squawk 4632, Brightwater 312.',
    );
    expect(r.state.wrongReadbacks).toBe(1);
  });

  it('repeats the instruction when the player asks to say again', () => {
    const r = radio('pilot');
    let asked = false;
    r.player.answer = () => {
      if (asked) return 'correct';
      asked = true;
      return 'sayAgain';
    };
    r.fly(45);
    expect(r.keys().slice(0, 4)).toEqual(['clearance', 'readback', 'clearance', 'readback']);
    expect(r.state.log[1]?.text.written).toBe('Say again, Brightwater 312.');
  });
});

describe('readbacks at the Captain level', () => {
  it('asks how the crew reads when a readback never comes, then repeats the call', () => {
    const r = radio('captain');
    let silent = true;
    r.player.answer = () => (silent ? null : 'correct');
    r.fly(35);
    silent = false;
    r.fly(30);
    expect(r.keys().slice(0, 4)).toEqual(['clearance', 'howDoYouRead', 'clearance', 'readback']);
    expect(r.state.log[3]?.speaker).toBe('captain');
  });

  it('answers a wrong readback with a correction that must be read back again', () => {
    const r = radio('captain');
    let wrongOnce = true;
    r.player.answer = () => {
      const choice = wrongOnce ? 'wrong' : 'correct';
      wrongOnce = false;
      return choice;
    };
    r.fly(60);
    const correction = r.state.log[2];
    expect(correction?.speaker).toBe('clearance');
    expect(correction?.text.written).toMatch(
      /^Brightwater 312, negative, I say again: cleared to Boston Logan as filed/,
    );
    expect(r.state.log[3]?.key).toBe('readback');
    expect(r.state.log[3]?.text.written).toContain('3,000');
  });
});

describe('a crew on the wrong frequency', () => {
  it('reminds a crew that never changed frequency of the handoff', () => {
    const r = radio('pilot');
    r.player.tunes = false;
    r.fly(100);
    const handoffs = r.state.log.filter((call) => call.key === 'contactTower');
    expect(handoffs.length).toBe(2);
    expect(r.state.workingWith).toBe('clearance');
  });

  it('calls again when nobody heard, and relays the call after two tries', () => {
    const r = radio('pilot');
    flyTo(r, 'with the center');
    expect(r.state.workingWith).toBe('center');
    // The player dials a wrong frequency before the descent.
    r.player.tunes = false;
    r.flight.comm = 121.5;
    r.flight.toDestinationNm = 105;
    r.fly(100);
    const descents = r.state.log.filter((call) => call.key === 'descend');
    expect(descents.map((call) => call.heard)).toEqual([false, false, false, true]);
    expect(r.keys().filter((key) => key === 'howDoYouRead').length).toBe(2);
    expect(descents.at(-1)?.frequency).toBe(121.5);
  });
});

describe('the practice modes', () => {
  it('starts the takeoff practice on the runway with the tower, and ends at radar contact', () => {
    const r = radio('firstOfficer', { practice: 'takeoff' });
    r.fly(5);
    r.flight.takeoffTime = true;
    r.fly(20);
    Object.assign(r.flight, { airborne: true, heightFt: 1000, altitudeFt: 1020 });
    r.fly(40);
    expect(r.keys()).toEqual([
      'checkInReady',
      'takeoff',
      'readback',
      'contactDeparture',
      'readback',
      'checkIn',
      'radarContact',
      'readback',
    ]);
    expect(r.state.cleared.altitudeFt).toBe(3000);
    expect(r.state.stage).toBe('done');
  });

  it('starts the approach practice with the approach clearance', () => {
    const r = radio('firstOfficer', { practice: 'approach' });
    r.flight.nearInterceptPoint = true;
    r.fly(15);
    expect(r.keys()).toEqual(['approachClearance', 'readback']);
    expect(r.state.cleared.approach).toBe(true);
  });
});

describe('a go-around', () => {
  it('sends the flight around, back to the approach controller, and vectors it again', () => {
    const r = radio('firstOfficer');
    flyTo(r, 'cleared to land');
    const before = r.keys().length;
    Object.assign(r.flight, { heightFt: 300, goingAround: true });
    r.fly(10);
    Object.assign(r.flight, {
      heightFt: 1800,
      altitudeFt: 1800,
      goingAround: false,
      established: false,
      nearInterceptPoint: false,
    });
    r.fly(40);
    expect(r.keys().slice(before)).toEqual([
      'goAround',
      'readback',
      'contactApproach',
      'readback',
      'checkIn',
      'vector',
      'readback',
    ]);
    expect(r.state.cleared).toMatchObject({ landing: false, approach: false, altitudeFt: 2000 });
  });
});
