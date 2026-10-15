import { describe, expect, it } from 'vitest';
import type { Clearance } from './atc';
import { checklistById, checklistReady, CHECKLISTS, type ChecklistView } from './checklists';
import { setFlapDegrees, startPanel } from './panel';
import {
  isStable,
  judgeLanding,
  startProcedures,
  stepProcedures,
  type ProcedureContext,
  type Procedures,
  type ViolationId,
} from './procedures';
import type { Readout } from './readout';

/** A clean jumbo level at 5,000 ft and 230 kt, where it was cleared to be. */
function readout(over: Partial<Readout> = {}): Readout {
  return {
    position: { lat: 40.2, lon: -74.5 },
    altitudeFt: 5000,
    heightFt: 4800,
    headingTrue: 60,
    pitchDeg: 2,
    bankDeg: 0,
    slipDeg: 0,
    iasKt: 230,
    tasKt: 250,
    mach: 0.38,
    verticalSpeedFpm: 0,
    groundSpeedKt: 250,
    trackTrue: 60,
    alphaDeg: 4,
    stallAlphaDeg: 14,
    loadFactor: 1,
    onGround: false,
    gear: 0,
    flapsDeg: 0,
    speedbrake: 0,
    engines: [],
    fuel: {
      reserve1: 0,
      main1: 10_000,
      main2: 20_000,
      centre: 0,
      main3: 20_000,
      main4: 10_000,
      reserve4: 0,
    },
    fuelLb: 60_000,
    weightLb: 560_000,
    ...over,
  };
}

const clearance = (over: Partial<Clearance> = {}): Clearance => ({
  takeoff: true,
  altitudeFt: 5000,
  heading: null,
  approach: false,
  landing: false,
  ...over,
});

function context(
  over: Partial<ProcedureContext> = {},
  aircraft: Partial<Readout> = {},
): ProcedureContext {
  return {
    time: 600,
    readout: readout(aircraft),
    cleared: clearance(),
    approaching: false,
    heightAboveFieldFt: 4800,
    toDestinationNm: 100,
    referenceSpeedKt: 140,
    localizerDots: null,
    glideslopeDots: null,
    goingAround: false,
    cruiseAboveTenThousand: true,
    ...over,
  };
}

/** The procedures after these moments, in order, from a fresh start with every checklist done. */
function after(...moments: ProcedureContext[]): Procedures {
  const procedures = startProcedures();
  procedures.completed = { beforeTakeoff: 0, afterTakeoff: 0, approach: 0, landing: 0 };
  for (const moment of moments) stepProcedures(procedures, moment);
  return procedures;
}

const ids = (procedures: Procedures): ViolationId[] =>
  procedures.violations.map((violation) => violation.id);

/** On final at 990 ft: gear down, flaps 30, on speed and on both beams. */
const finalApproach = (over: Partial<ProcedureContext> = {}, aircraft: Partial<Readout> = {}) =>
  context(
    {
      approaching: true,
      cleared: clearance({ approach: true, landing: true, altitudeFt: 2000 }),
      heightAboveFieldFt: 990,
      toDestinationNm: 3,
      localizerDots: 0.2,
      glideslopeDots: -0.3,
      ...over,
    },
    { altitudeFt: 1003, gear: 1, flapsDeg: 30, iasKt: 148, verticalSpeedFpm: -750, ...aircraft },
  );

describe('the Captain’s book', () => {
  it('writes nothing down for a tidy flight', () => {
    expect(after(context(), context({ time: 700 }), finalApproach()).violations).toEqual([]);
  });

  it('writes down a flap overspeed once while it lasts, with the numbers', () => {
    const procedures = after(
      context({}, { flapsDeg: 30, iasKt: 190 }),
      context({ time: 601 }, { flapsDeg: 30, iasKt: 195 }),
    );
    expect(ids(procedures)).toEqual(['flapSpeed']);
    expect(procedures.violations[0]?.text).toBe(
      'Flaps 30 flown at 190 kt, above their 180 kt limit.',
    );
    expect(ids(after(context({}, { flapsDeg: 30, iasKt: 184 })))).toEqual([]);
  });

  it('writes a breach down again only after it has ended', () => {
    const fast = context({}, { flapsDeg: 30, iasKt: 190 });
    const slow = context({}, { flapsDeg: 30, iasKt: 170 });
    expect(ids(after(fast, slow, fast))).toEqual(['flapSpeed', 'flapSpeed']);
  });

  it('writes down the gear flown down above 275 kt', () => {
    const high = (iasKt: number) =>
      context(
        { cleared: clearance({ altitudeFt: 12_000 }) },
        { altitudeFt: 12_000, gear: 1, iasKt },
      );
    expect(ids(after(high(280)))).toEqual(['gearSpeed']);
    expect(ids(after(high(274)))).toEqual([]);
  });

  it('holds 250 kt below 10,000 ft, with 15 kt of grace and none of it on a go-around', () => {
    expect(ids(after(context({}, { altitudeFt: 9000, iasKt: 266 })))).toEqual([
      'speedBelowTenThousand',
    ]);
    expect(ids(after(context({}, { altitudeFt: 9000, iasKt: 264 })))).toEqual([]);
    expect(ids(after(context({}, { altitudeFt: 9900, iasKt: 300 })))).toEqual([]);
    expect(ids(after(context({ goingAround: true }, { altitudeFt: 9000, iasKt: 280 })))).toEqual(
      [],
    );
  });

  it('busts an altitude 300 ft past the clearance, whichever way the flight was going', () => {
    const climbingTo = (altitudeFt: number) =>
      context({ cleared: clearance({ altitudeFt: 10_000 }) }, { altitudeFt });
    expect(ids(after(climbingTo(5000), climbingTo(10_350)))).toEqual(['altitudeBust']);
    expect(ids(after(climbingTo(5000), climbingTo(10_250)))).toEqual([]);
    const descendingTo = (altitudeFt: number) =>
      context({ cleared: clearance({ altitudeFt: 4000 }) }, { altitudeFt });
    expect(ids(after(descendingTo(8000), descendingTo(3650)))).toEqual(['altitudeBust']);
    const onTheApproach = (altitudeFt: number) =>
      context({ cleared: clearance({ altitudeFt: 4000, approach: true }) }, { altitudeFt });
    expect(ids(after(onTheApproach(8000), onTheApproach(2000)))).toEqual([]);
  });

  it('wants a clearance and the before-takeoff checklist before the roll', () => {
    const procedures = startProcedures();
    stepProcedures(
      procedures,
      context(
        { cleared: clearance({ takeoff: false }) },
        { onGround: true, altitudeFt: 20, iasKt: 70 },
      ),
    );
    expect(ids(procedures)).toEqual(['takeoffWithoutClearance', 'checklistBeforeTakeoff']);
  });

  it('judges the stabilised-approach gate at 1,000 ft', () => {
    expect(after(finalApproach()).stableAtGate).toBe(true);
    const fast = after(finalApproach({}, { iasKt: 175 }));
    expect(fast.stableAtGate).toBe(false);
    judgeLanding(fast, {
      time: 900,
      cleared: clearance({ landing: true }),
      crosswindKt: 8,
      fuelLb: 40_000,
      reserveLb: 20_000,
    });
    expect(ids(fast)).toEqual(['continuedUnstable']);
    expect(
      after(finalApproach({}, { iasKt: 175 }), finalApproach({ goingAround: true })).stableAtGate,
    ).toBeNull();
  });

  it('calls an approach stable only in landing shape, on speed, sinking sanely and on both beams', () => {
    expect(isStable(finalApproach())).toBe(true);
    expect(isStable(finalApproach({}, { gear: 0.5 }))).toBe(false);
    expect(isStable(finalApproach({}, { flapsDeg: 20 }))).toBe(false);
    expect(isStable(finalApproach({}, { iasKt: 130 }))).toBe(false);
    expect(isStable(finalApproach({}, { verticalSpeedFpm: -1200 }))).toBe(false);
    expect(isStable(finalApproach({ glideslopeDots: 1.4 }))).toBe(false);
    expect(isStable(finalApproach({ localizerDots: null }))).toBe(false);
  });

  it('judges the landing: clearance, crosswind and the fuel left', () => {
    const procedures = startProcedures();
    judgeLanding(procedures, {
      time: 900,
      cleared: clearance({ landing: false }),
      crosswindKt: -34,
      fuelLb: 15_000,
      reserveLb: 20_000,
    });
    expect(ids(procedures)).toEqual(['landingWithoutClearance', 'crosswindLimit', 'minimumFuel']);
    expect(procedures.violations[1]?.text).toContain('34 kt crosswind');
  });

  it('notices symmetrical tanks more than 6,000 lb apart', () => {
    const lopsided = context({}, { fuel: { ...readout().fuel, main1: 16_500, main4: 10_000 } });
    expect(ids(after(lopsided))).toEqual(['fuelImbalance']);
  });
});

describe('the checklists', () => {
  function view(over: Partial<ChecklistView> = {}): ChecklistView {
    return {
      panel: startPanel({ altimeterInHg: 30.01 }),
      readout: readout({ onGround: true, gear: 1, altitudeFt: 20 }),
      cleared: clearance(),
      departureQnh: 30.01,
      arrivalQnh: 29.84,
      localizer: 109.5,
      runwayCourse: 44,
      referenceSpeedKt: 140,
      navTuned: true,
      ...over,
    };
  }
  const ticked = (id: Parameters<typeof checklistById>[0], state: ChecklistView) =>
    checklistById(id)
      .items.filter((item) => item.done(state))
      .map((item) => item.challenge);

  it('has the four lists of a flight, in the order they are flown', () => {
    expect(CHECKLISTS.map((list) => list.id)).toEqual([
      'beforeTakeoff',
      'afterTakeoff',
      'approach',
      'landing',
    ]);
    for (const list of CHECKLISTS) expect(list.items.length).toBeGreaterThan(0);
  });

  it('ticks the before-takeoff items as the aircraft is set, NAV radios included', () => {
    const state = view();
    expect(ticked('beforeTakeoff', state)).toEqual([
      'Speedbrake',
      'Altimeters',
      'NAV radios',
      'Takeoff clearance',
    ]);
    setFlapDegrees(state.panel, 10);
    expect(checklistReady('beforeTakeoff', state)).toBe(true);
    expect(checklistReady('beforeTakeoff', { ...state, navTuned: false })).toBe(false);
  });

  it('ticks the after-takeoff list only once the gear and flaps are really up', () => {
    const state = view({
      panel: startPanel({ gearDown: false }),
      readout: readout({ gear: 0.4, flapsDeg: 0 }),
    });
    expect(ticked('afterTakeoff', state)).toEqual(['Flaps']);
    expect(checklistReady('afterTakeoff', { ...state, readout: readout() })).toBe(true);
  });

  it('wants the localizer, its course within 3° and the bug on Vref for the approach', () => {
    const panel = startPanel({ altimeterInHg: 29.84, speedBugKt: 142 });
    panel.nav[0] = { frequency: 109.5, course: 46 };
    expect(checklistReady('approach', view({ panel }))).toBe(true);
    panel.nav[0] = { frequency: 109.5, course: 50 };
    expect(ticked('approach', view({ panel }))).toEqual(['Altimeters', 'NAV 1', 'Speed bug']);
    panel.nav[0] = { frequency: 109.5, course: 359 };
    expect(ticked('approach', view({ panel, runwayCourse: 1 }))).toContain('Course');
  });

  it('wants three green, landing flaps, the speedbrake armed and a clearance to land', () => {
    const panel = startPanel({ speedbrake: 'armed' });
    setFlapDegrees(panel, 30);
    const state = view({
      panel,
      cleared: clearance({ landing: true }),
      readout: readout({ gear: 1 }),
    });
    expect(checklistReady('landing', state)).toBe(true);
    expect(ticked('landing', { ...state, readout: readout({ gear: 0.9 }) })).not.toContain(
      'Landing gear',
    );
  });
});
