import { describe, expect, it } from 'vitest';
import type { Readout } from './readout';
import {
  startWarnings,
  stepWarnings,
  type Callout,
  type WarningContext,
  type Warnings,
} from './warnings';

/** A jumbo on a steady final: gear down, flaps 30, on the glideslope. */
function readout(over: Partial<Readout> = {}): Readout {
  return {
    position: { lat: 40.6, lon: -73.8 },
    altitudeFt: 1000,
    heightFt: 1000,
    headingTrue: 31,
    pitchDeg: 2,
    bankDeg: 0,
    slipDeg: 0,
    iasKt: 145,
    tasKt: 145,
    mach: 0.22,
    verticalSpeedFpm: -700,
    groundSpeedKt: 140,
    trackTrue: 31,
    alphaDeg: 5,
    stallAlphaDeg: 16,
    loadFactor: 1,
    onGround: false,
    gear: 1,
    flapsDeg: 30,
    speedbrake: 0,
    engines: [],
    fuel: {
      reserve1: 0,
      main1: 9000,
      main2: 9000,
      centre: 0,
      main3: 9000,
      main4: 9000,
      reserve4: 0,
    },
    fuelLb: 36_000,
    weightLb: 520_000,
    ...over,
  };
}

function situation(
  over: Partial<WarningContext> = {},
  aircraft: Partial<Readout> = {},
): WarningContext {
  return {
    time: 0,
    readout: readout(aircraft),
    radioFt: 1000,
    gearLeverDown: true,
    leversIdle: false,
    takeoffConfigured: true,
    glideslopeDots: 0,
    approaching: true,
    vmoKt: 365,
    mmo: 0.92,
    lowFuelLb: 10_000,
    ...over,
  };
}

/** What a fresh set of warnings says about one moment. */
const alertFor = (over: Partial<WarningContext>, aircraft: Partial<Readout> = {}) => {
  const warnings = startWarnings();
  stepWarnings(warnings, situation(over, aircraft), 1 / 60);
  return warnings.gpws;
};

describe('the height callouts', () => {
  function descend(warnings: Warnings, from: number, to: number, sinkFpm = 700): Callout[] {
    const heard: Callout[] = [];
    const step = 1 / 60;
    for (let height = from; height > to; height -= (sinkFpm / 60) * step) {
      heard.push(
        ...stepWarnings(
          warnings,
          situation({ radioFt: height }, { heightFt: height, verticalSpeedFpm: -sinkFpm }),
          step,
        ),
      );
    }
    return heard;
  }

  it('calls each height once, in order, all the way to ten feet', () => {
    expect(descend(startWarnings(), 1200, 5)).toEqual([
      '1000',
      '500',
      'minimums',
      '100',
      '50',
      '40',
      '30',
      '20',
      '10',
    ]);
  });

  it('speaks only the newest height when the descent passes several at once', () => {
    const warnings = startWarnings();
    const callouts = stepWarnings(warnings, situation({ radioFt: 450 }, { heightFt: 450 }), 1);
    expect(callouts).toEqual(['500']);
    expect(warnings.called).toEqual([1000, 500]);
  });

  it('stays quiet climbing away, or when not on an approach', () => {
    expect(
      stepWarnings(startWarnings(), situation({ radioFt: 450 }, { verticalSpeedFpm: 1500 }), 1),
    ).toEqual([]);
    expect(
      stepWarnings(startWarnings(), situation({ radioFt: 450, approaching: false }), 1),
    ).toEqual([]);
  });

  it('starts again after the wheels have been on the ground', () => {
    const warnings = startWarnings();
    descend(warnings, 1200, 5);
    stepWarnings(warnings, situation({ radioFt: 0 }, { onGround: true, heightFt: 0 }), 1 / 60);
    expect(warnings.called).toEqual([]);
    expect(descend(warnings, 1200, 900)).toEqual(['1000']);
  });
});

describe('the ground proximity warning', () => {
  it('says pull up for a steep dive close to the ground, sink rate for a lesser one', () => {
    expect(alertFor({ radioFt: 500 }, { verticalSpeedFpm: -3000 })).toBe('pullUp');
    expect(alertFor({ radioFt: 1000 }, { verticalSpeedFpm: -2700 })).toBe('sinkRate');
    expect(alertFor({ radioFt: 1000 }, { verticalSpeedFpm: -900 })).toBeNull();
  });

  it('calls terrain when the ground rises fast under a clean aircraft', () => {
    const warnings = startWarnings();
    const clean = { gearLeverDown: false, approaching: false };
    stepWarnings(
      warnings,
      situation({ ...clean, radioFt: 1500 }, { flapsDeg: 0, verticalSpeedFpm: 0 }),
      1,
    );
    stepWarnings(
      warnings,
      situation({ ...clean, radioFt: 1400 }, { flapsDeg: 0, verticalSpeedFpm: 0 }),
      1,
    );
    expect(warnings.gpws).toBe('terrain');
  });

  it('says don’t sink when height is lost soon after takeoff', () => {
    const warnings = startWarnings();
    const climbing = { approaching: false, gearLeverDown: false };
    stepWarnings(warnings, situation({ ...climbing, radioFt: 400 }, { flapsDeg: 10 }), 10);
    stepWarnings(
      warnings,
      situation({ ...climbing, radioFt: 300 }, { flapsDeg: 10, verticalSpeedFpm: -500 }),
      10,
    );
    expect(warnings.gpws).toBe('dontSink');
  });

  it('calls too low, gear and too low, flaps in the wrong shape near the ground', () => {
    expect(alertFor({ radioFt: 400, gearLeverDown: false }, { iasKt: 160, gear: 0 })).toBe(
      'tooLowGear',
    );
    expect(alertFor({ radioFt: 200 }, { flapsDeg: 20, iasKt: 150 })).toBe('tooLowFlaps');
  });

  it('calls glideslope well below the beam, between 1,000 and 50 ft', () => {
    expect(alertFor({ radioFt: 800, glideslopeDots: -1.5 })).toBe('glideslope');
    expect(alertFor({ radioFt: 1200, glideslopeDots: -1.5 })).toBeNull();
    expect(alertFor({ radioFt: 800, glideslopeDots: -1 })).toBeNull();
  });

  it('repeats a lasting alert every 2.4 seconds, not every step', () => {
    const warnings = startWarnings();
    const diving = (time: number) =>
      stepWarnings(warnings, situation({ time, radioFt: 500 }, { verticalSpeedFpm: -3000 }), 0.1);
    expect(diving(0)).toContain('pullUp');
    expect(diving(1)).not.toContain('pullUp');
    expect(diving(2.5)).toContain('pullUp');
  });
});

describe('the horns and lights', () => {
  const step = (over: Partial<WarningContext>, aircraft: Partial<Readout> = {}) => {
    const warnings = startWarnings();
    stepWarnings(warnings, situation(over, aircraft), 1 / 60);
    return warnings;
  };

  it('sounds the takeoff configuration horn when thrust comes up with the aircraft not set', () => {
    const roll = { approaching: false, takeoffConfigured: false };
    const onGround = { onGround: true, iasKt: 20, flapsDeg: 0 };
    expect(step(roll, onGround).takeoffConfig).toBe(true);
    expect(step({ ...roll, takeoffConfigured: true }, onGround).takeoffConfig).toBe(false);
    expect(step({ ...roll, leversIdle: true }, onGround).takeoffConfig).toBe(false);
    expect(step(roll, { ...onGround, iasKt: 90 }).takeoffConfig).toBe(false);
  });

  it('sounds the gear horn with the gear up and the levers closed low down, or landing flaps', () => {
    const gearUp = { gearLeverDown: false };
    expect(step({ ...gearUp, radioFt: 700, leversIdle: true }, { flapsDeg: 10 }).gearHorn).toBe(
      true,
    );
    expect(step({ ...gearUp, radioFt: 700 }, { flapsDeg: 10 }).gearHorn).toBe(false);
    expect(step({ ...gearUp, radioFt: null }, { flapsDeg: 25 }).gearHorn).toBe(true);
  });

  it('shakes the stick near the stall and clacks above the speed limits', () => {
    expect(step({}, { alphaDeg: 15 }).stall).toBe(true);
    expect(step({}, { alphaDeg: 14 }).stall).toBe(false);
    expect(step({}, { iasKt: 370 }).overspeed).toBe(true);
    expect(step({}, { mach: 0.93 }).overspeed).toBe(true);
    expect(step({}, { fuelLb: 9000 }).lowFuel).toBe(true);
  });
});
