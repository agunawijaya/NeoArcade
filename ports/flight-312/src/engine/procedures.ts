import { flapAero, GEAR_LIMIT_KT, JUMBO } from './aircraft';
import type { Clearance } from './atc';
import type { ChecklistId } from './checklists';
import type { Readout } from './readout';

/**
 * The Captain level's procedures: limits, clearances, checklists and the
 * stabilised-approach gate. Each breach is written down once, with the
 * numbers, for the report; the flight goes on. The Captain's Hat goes to a
 * whole flight without a single entry.
 */
export type ViolationId =
  | 'flapSpeed'
  | 'gearSpeed'
  | 'overspeed'
  | 'speedBelowTenThousand'
  | 'altitudeBust'
  | 'takeoffWithoutClearance'
  | 'landingWithoutClearance'
  | 'checklistBeforeTakeoff'
  | 'checklistAfterTakeoff'
  | 'checklistApproach'
  | 'checklistLanding'
  | 'continuedUnstable'
  | 'crosswindLimit'
  | 'minimumFuel'
  | 'fuelImbalance';

export interface Violation {
  id: ViolationId;
  at: number;
  text: string;
}

export interface Procedures {
  violations: Violation[];
  completed: Record<ChecklistId, number | null>;
  /** Breaches still going on, so each is written down once. */
  ongoing: Partial<Record<ViolationId, boolean>>;
  /** Which way the flight was heading for its cleared altitude when it got it: +1 up, −1 down. */
  clearedAltitudeFt: number;
  clearedDirection: number;
  /** The stabilised-approach gate at 1,000 ft: null until passed. */
  stableAtGate: boolean | null;
}

export function startProcedures(): Procedures {
  return {
    violations: [],
    completed: { beforeTakeoff: null, afterTakeoff: null, approach: null, landing: null },
    ongoing: {},
    clearedAltitudeFt: 0,
    clearedDirection: 1,
    stableAtGate: null,
  };
}

export interface ProcedureContext {
  time: number;
  readout: Readout;
  cleared: Clearance;
  approaching: boolean;
  /** Above the destination's runway, feet. */
  heightAboveFieldFt: number;
  toDestinationNm: number;
  referenceSpeedKt: number;
  localizerDots: number | null;
  glideslopeDots: number | null;
  goingAround: boolean;
  cruiseAboveTenThousand: boolean;
}

/** Writes a breach down when it starts; it may be written again only after it has ended. */
function breach(
  procedures: Procedures,
  id: ViolationId,
  happening: boolean,
  time: number,
  text: () => string,
) {
  if (happening && !procedures.ongoing[id]) {
    procedures.violations.push({ id, at: time, text: text() });
  }
  procedures.ongoing[id] = happening;
}

/** Writes a breach down once for the whole flight. */
function once(procedures: Procedures, id: ViolationId, time: number, text: string) {
  if (procedures.violations.some((violation) => violation.id === id)) return;
  procedures.violations.push({ id, at: time, text });
}

const knots = (value: number) => `${Math.round(value)} kt`;
const flapLimit = (flapsDeg: number) => flapAero(flapsDeg).limitKt;

export function stepProcedures(procedures: Procedures, context: ProcedureContext) {
  const { readout: r, time } = context;
  const airborne = !r.onGround;

  breach(
    procedures,
    'flapSpeed',
    r.flapsDeg > 0.5 && r.iasKt > flapLimit(r.flapsDeg) + 5,
    time,
    () =>
      `Flaps ${Math.round(r.flapsDeg)} flown at ${knots(r.iasKt)}, above their ${knots(flapLimit(r.flapsDeg))} limit.`,
  );
  breach(
    procedures,
    'gearSpeed',
    r.gear > 0.01 && r.iasKt > GEAR_LIMIT_KT + 5,
    time,
    () => `Gear down at ${knots(r.iasKt)}, above its ${knots(GEAR_LIMIT_KT)} limit.`,
  );
  breach(
    procedures,
    'overspeed',
    r.iasKt > JUMBO.vmoKt + 5 || r.mach > JUMBO.mmo + 0.005,
    time,
    () => `Overspeed: ${knots(r.iasKt)}, Mach ${r.mach.toFixed(2)}.`,
  );
  breach(
    procedures,
    'speedBelowTenThousand',
    airborne && r.altitudeFt < 9_800 && r.iasKt > 265 && !context.goingAround,
    time,
    () => `${knots(r.iasKt)} below 10,000 ft, where the limit is 250 kt.`,
  );
  altitudeCompliance(procedures, context);
  clearances(procedures, context);
  checklistDeadlines(procedures, context);
  stabilisedGate(procedures, context);
  fuelBalance(procedures, context);
}

function altitudeCompliance(procedures: Procedures, context: ProcedureContext) {
  const { readout: r, cleared, time } = context;
  if (cleared.altitudeFt !== procedures.clearedAltitudeFt) {
    procedures.clearedDirection = cleared.altitudeFt >= r.altitudeFt ? 1 : -1;
    procedures.clearedAltitudeFt = cleared.altitudeFt;
  }
  // Once cleared for the approach the crew descends on the glideslope, below any altitude it was given.
  const relevant = !r.onGround && !cleared.approach && !context.goingAround;
  const beyond =
    procedures.clearedDirection > 0
      ? r.altitudeFt > cleared.altitudeFt + 300
      : r.altitudeFt < cleared.altitudeFt - 300;
  breach(
    procedures,
    'altitudeBust',
    relevant && beyond,
    time,
    () =>
      `Altitude bust: ${Math.round(r.altitudeFt).toLocaleString('en-US')} ft against a clearance to ${cleared.altitudeFt.toLocaleString('en-US')} ft.`,
  );
}

function clearances(procedures: Procedures, context: ProcedureContext) {
  const { readout: r, cleared, time } = context;
  if (r.onGround && !context.approaching && r.iasKt > 60 && !cleared.takeoff) {
    once(procedures, 'takeoffWithoutClearance', time, 'Took off without a takeoff clearance.');
  }
}

/** The moments each list must be done by. */
function checklistDeadlines(procedures: Procedures, context: ProcedureContext) {
  const { readout: r, time } = context;
  const late = (id: ChecklistId, violation: ViolationId, due: boolean, text: string) => {
    if (due && procedures.completed[id] === null) once(procedures, violation, time, text);
  };
  late(
    'beforeTakeoff',
    'checklistBeforeTakeoff',
    r.onGround && !context.approaching && r.iasKt > 60,
    'Takeoff begun before the Before Takeoff checklist was complete.',
  );
  late(
    'afterTakeoff',
    'checklistAfterTakeoff',
    !context.approaching && r.altitudeFt > 10_000,
    'After Takeoff checklist not complete by 10,000 ft.',
  );
  const approachDue = context.cruiseAboveTenThousand
    ? context.approaching && r.altitudeFt < 10_000 && context.toDestinationNm < 60
    : context.approaching && context.toDestinationNm < 15;
  late(
    'approach',
    'checklistApproach',
    approachDue,
    'Approach checklist not complete by 10,000 ft on the descent.',
  );
  late(
    'landing',
    'checklistLanding',
    context.approaching && context.heightAboveFieldFt < 1000 && !r.onGround,
    'Landing checklist not complete by 1,000 ft.',
  );
}

/**
 * At 1,000 ft on the approach the aircraft is stable — landing shape, on
 * speed, a sane sink rate, within a dot of both beams — or it goes around.
 */
export function isStable(context: ProcedureContext): boolean {
  const { readout: r } = context;
  const onSpeed =
    r.iasKt >= context.referenceSpeedKt - 5 && r.iasKt <= context.referenceSpeedKt + 20;
  const onBeams =
    context.localizerDots !== null &&
    Math.abs(context.localizerDots) <= 1 &&
    context.glideslopeDots !== null &&
    Math.abs(context.glideslopeDots) <= 1;
  return r.gear > 0.99 && r.flapsDeg >= 24 && onSpeed && -r.verticalSpeedFpm <= 1000 && onBeams;
}

function stabilisedGate(procedures: Procedures, context: ProcedureContext) {
  if (!context.approaching) return;
  if (context.goingAround) {
    procedures.stableAtGate = null;
    return;
  }
  if (
    procedures.stableAtGate === null &&
    !context.readout.onGround &&
    context.heightAboveFieldFt < 1000
  ) {
    procedures.stableAtGate = isStable(context);
  }
}

/** Called at touchdown: the landing's own procedures. */
export function judgeLanding(
  procedures: Procedures,
  context: {
    time: number;
    cleared: Clearance;
    crosswindKt: number;
    fuelLb: number;
    reserveLb: number;
  },
) {
  if (!context.cleared.landing)
    once(
      procedures,
      'landingWithoutClearance',
      context.time,
      'Landed without a landing clearance.',
    );
  if (procedures.stableAtGate === false) {
    once(
      procedures,
      'continuedUnstable',
      context.time,
      'Continued an approach that was not stable at 1,000 ft instead of going around.',
    );
  }
  if (Math.abs(context.crosswindKt) > 30) {
    once(
      procedures,
      'crosswindLimit',
      context.time,
      `Landed in a ${knots(Math.abs(context.crosswindKt))} crosswind, beyond the 30 kt limit.`,
    );
  }
  if (context.fuelLb < context.reserveLb) {
    once(
      procedures,
      'minimumFuel',
      context.time,
      `Landed with ${Math.round(context.fuelLb).toLocaleString('en-US')} lb, below the planned reserve.`,
    );
  }
}

function fuelBalance(procedures: Procedures, context: ProcedureContext) {
  const fuel = context.readout.fuel;
  const imbalance = Math.max(Math.abs(fuel.main1 - fuel.main4), Math.abs(fuel.main2 - fuel.main3));
  breach(
    procedures,
    'fuelImbalance',
    imbalance > 6000,
    context.time,
    () =>
      `Fuel out of balance by ${Math.round(imbalance).toLocaleString('en-US')} lb between symmetrical tanks.`,
  );
}
