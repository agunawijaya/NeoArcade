import type { Readout } from './readout';

/**
 * The aural warnings and lights of the flight deck: stick shaker, gear
 * horn, overspeed clacker, the takeoff configuration horn, low fuel, the
 * ground proximity warning system's modes of the day (sink rate, terrain
 * closure, altitude loss after takeoff, too low with gear or flaps up,
 * below the glideslope), and the radio-height callouts on the way down.
 */
export type GpwsAlert =
  'pullUp' | 'sinkRate' | 'terrain' | 'dontSink' | 'tooLowGear' | 'tooLowFlaps' | 'glideslope';

export type Callout = GpwsAlert | 'minimums' | `${number}`;

export interface Warnings {
  stall: boolean;
  gearHorn: boolean;
  overspeed: boolean;
  takeoffConfig: boolean;
  lowFuel: boolean;
  gpws: GpwsAlert | null;
  /** Radio heights already called on this descent. */
  called: number[];
  lastRadioFt: number | null;
  /** Height above the field gained since liftoff, for "don't sink". */
  climbPeakFt: number;
  nextGpwsCallAt: number;
}

export interface WarningContext {
  time: number;
  readout: Readout;
  /** Radio altimeter, null above its 2,500 ft. */
  radioFt: number | null;
  gearLeverDown: boolean;
  /** The forward levers closed. */
  leversIdle: boolean;
  /** Ready for takeoff as set: flaps in the takeoff range, speedbrake down, parking brake off. */
  takeoffConfigured: boolean;
  /** Glideslope deviation in dots, + above; null when not received. */
  glideslopeDots: number | null;
  /** Flying an approach to land, not climbing out. */
  approaching: boolean;
  vmoKt: number;
  mmo: number;
  lowFuelLb: number;
}

export const DECISION_HEIGHT_FT = 200;
const CALLOUT_HEIGHTS = [1000, 500, DECISION_HEIGHT_FT, 100, 50, 40, 30, 20, 10];
/** How often the GPWS repeats its voice while an alert lasts. */
const GPWS_REPEAT_SECONDS = 2.4;

export function startWarnings(): Warnings {
  return {
    stall: false,
    gearHorn: false,
    overspeed: false,
    takeoffConfig: false,
    lowFuel: false,
    gpws: null,
    called: [],
    lastRadioFt: null,
    climbPeakFt: 0,
    nextGpwsCallAt: 0,
  };
}

export function stepWarnings(warnings: Warnings, context: WarningContext, dt: number): Callout[] {
  const { readout } = context;
  const airborne = !readout.onGround;
  warnings.stall = airborne && readout.alphaDeg > readout.stallAlphaDeg - 1.5;
  warnings.overspeed = readout.iasKt > context.vmoKt + 2 || readout.mach > context.mmo + 0.005;
  warnings.gearHorn =
    airborne &&
    !context.gearLeverDown &&
    ((context.radioFt !== null && context.radioFt < 800 && context.leversIdle) ||
      readout.flapsDeg >= 24);
  warnings.takeoffConfig =
    readout.onGround &&
    !context.leversIdle &&
    readout.iasKt < 80 &&
    !context.takeoffConfigured &&
    !context.approaching;
  warnings.lowFuel = readout.fuelLb < context.lowFuelLb;

  const callouts: Callout[] = [];
  const alert = airborne ? gpwsAlert(warnings, context, dt) : null;
  if (alert && (alert !== warnings.gpws || context.time >= warnings.nextGpwsCallAt)) {
    callouts.push(alert);
    warnings.nextGpwsCallAt = context.time + GPWS_REPEAT_SECONDS;
  }
  warnings.gpws = alert;
  callouts.push(...heightCallouts(warnings, context));
  return callouts;
}

function gpwsAlert(warnings: Warnings, context: WarningContext, dt: number): GpwsAlert | null {
  const { readout, radioFt } = context;
  const previous = warnings.lastRadioFt;
  warnings.lastRadioFt = radioFt;
  if (radioFt === null) return null;
  const sink = -readout.verticalSpeedFpm;
  // Mode 1, excessive sink rate for the height.
  if (sink > 1400 + 2.2 * radioFt) return 'pullUp';
  if (sink > 1000 + 1.6 * radioFt) return 'sinkRate';
  // Mode 2, the ground rising fast toward a clean aircraft.
  const landingShape = context.gearLeverDown && readout.flapsDeg >= 24;
  if (previous !== null && !landingShape && radioFt < 1800) {
    const closureFpm = ((previous - radioFt) / dt) * 60;
    if (closureFpm > 2000 + radioFt) return 'terrain';
  }
  // Mode 3, height lost soon after takeoff.
  if (!context.approaching) {
    warnings.climbPeakFt = Math.max(warnings.climbPeakFt, radioFt);
    if (radioFt < 700 && warnings.climbPeakFt - radioFt > 50 + warnings.climbPeakFt * 0.1)
      return 'dontSink';
    return null;
  }
  warnings.climbPeakFt = 0;
  // Mode 4, close to the ground in the wrong shape.
  if (!context.gearLeverDown && radioFt < 500 && readout.iasKt < 190) return 'tooLowGear';
  if (context.gearLeverDown && readout.flapsDeg < 24 && radioFt < 245 && readout.iasKt < 159)
    return 'tooLowFlaps';
  // Mode 5, well below the glideslope.
  if (
    context.glideslopeDots !== null &&
    context.glideslopeDots < -1.3 &&
    radioFt < 1000 &&
    radioFt > 50
  ) {
    return 'glideslope';
  }
  return null;
}

/** "One thousand", "five hundred", "minimums", "one hundred", "fifty" … "ten", once each on the way down. */
function heightCallouts(warnings: Warnings, context: WarningContext): Callout[] {
  const radio = context.radioFt;
  if (radio === null || !context.approaching || context.readout.onGround) {
    if (radio === null || context.readout.onGround) warnings.called = [];
    return [];
  }
  if (context.readout.verticalSpeedFpm > 300) return [];
  const callouts: Callout[] = [];
  for (const height of CALLOUT_HEIGHTS) {
    if (radio <= height && !warnings.called.includes(height)) {
      warnings.called.push(height);
      // Only the newest height is spoken: a fast descent skips the ones it has passed.
      callouts.length = 0;
      callouts.push(height === DECISION_HEIGHT_FT ? 'minimums' : `${height}`);
    }
  }
  return callouts;
}
