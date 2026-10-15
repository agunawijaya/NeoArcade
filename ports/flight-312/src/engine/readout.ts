import { JUMBO, loadFuel, stallAlpha, type TankId } from './aircraft';
import type { AirframeState } from './airframe';
import { airAt } from './atmosphere';
import { idleEngine, stepEngine, type EngineState } from './engines';
import { approach, atan, clamp, DEGREES_PER_RADIAN } from './exact-math';
import type { LatLon } from './geo';
import { TURN_RATES, type ProgramState } from './program-model';
import { FPS_PER_KNOT, GRAVITY } from './units';

/**
 * The aircraft as the instruments, the 3D view and the reports see it,
 * whichever model flies it. The Pilot and Captain levels read it straight
 * off the airframe; under the 1982 rules it is dressed from the program's
 * few numbers, smoothed so that a five-degree press of pitch tilts the
 * horizon instead of snapping it.
 */
export interface Readout {
  position: LatLon;
  /** Wheels above sea level. */
  altitudeFt: number;
  /** Wheels above the ground under them. */
  heightFt: number;
  headingTrue: number;
  pitchDeg: number;
  bankDeg: number;
  slipDeg: number;
  iasKt: number;
  tasKt: number;
  mach: number;
  verticalSpeedFpm: number;
  groundSpeedKt: number;
  trackTrue: number;
  alphaDeg: number;
  stallAlphaDeg: number;
  loadFactor: number;
  onGround: boolean;
  /** 0 up … 1 down and locked. */
  gear: number;
  flapsDeg: number;
  speedbrake: number;
  engines: EngineState[];
  fuel: Record<TankId, number>;
  fuelLb: number;
  weightLb: number;
}

export function readAirframe(state: AirframeState, groundFt: number): Readout {
  const fuelLb = Object.values(state.fuel).reduce((sum, tank) => sum + tank, 0);
  return {
    position: state.position,
    altitudeFt: state.altitudeFt,
    heightFt: state.altitudeFt - groundFt,
    headingTrue: state.headingTrue,
    pitchDeg: state.pitchDeg,
    bankDeg: state.bankDeg,
    slipDeg: state.sideslipDeg,
    iasKt: state.iasKt,
    tasKt: state.tasKt,
    mach: state.mach,
    verticalSpeedFpm: state.verticalSpeedFpm,
    groundSpeedKt: state.groundSpeedKt,
    trackTrue: state.trackTrue,
    alphaDeg: state.alphaDeg,
    stallAlphaDeg: stallAlpha(state.flaps),
    loadFactor: state.loadFactor,
    onGround: state.onGround,
    gear: state.gear,
    flapsDeg: state.flaps,
    speedbrake: state.speedbrake,
    engines: state.engines,
    fuel: state.fuel,
    fuelLb,
    weightLb: state.weightLb,
  };
}

/** The look of the program's aircraft: what it shows, eased toward what the program says. */
export interface ProgramLook {
  pitchDeg: number;
  bankDeg: number;
  flapsDeg: number;
  gear: number;
  engines: EngineState[];
}

export function startProgramLook(): ProgramLook {
  return {
    pitchDeg: 0,
    bankDeg: 0,
    flapsDeg: 0,
    gear: 1,
    engines: Array.from({ length: JUMBO.engineCount }, idleEngine),
  };
}

/** The lever each of the program's thrust settings stands for: TR 1 maximum … 6 idle. */
export const PROGRAM_LEVERS = [1, 0.85, 0.7, 0.55, 0.35, 0] as const;
const MAX_LOOK_BANK = 35;

export function readProgram(
  state: ProgramState,
  look: ProgramLook,
  groundFt: number,
  dt: number,
): Readout {
  const air = airAt(state.altitudeFt);
  const onGround =
    state.phase === 'parked' || state.phase === 'takeoffRoll' || state.phase === 'rollout';
  look.pitchDeg = approach(
    look.pitchDeg,
    onGround && state.phase !== 'rollout' ? 0 : state.pitch,
    4 * dt,
  );
  look.bankDeg = approach(look.bankDeg, onGround ? 0 : bankForTurn(state), 10 * dt);
  const takeoffFlaps =
    state.phase === 'parked' || state.phase === 'takeoffRoll' || state.phase === 'departure';
  look.flapsDeg = approach(look.flapsDeg, state.flapsDown ? (takeoffFlaps ? 10 : 25) : 0, 1.5 * dt);
  look.gear = approach(look.gear, state.gearDown ? 1 : 0, dt / 8);
  const reverse = state.thrustIndex === 7 ? 0.85 : 0;
  const lever = reverse > 0 ? 0 : (PROGRAM_LEVERS[clamp(state.thrustIndex, 1, 6) - 1] ?? 0);
  const mach = state.airspeedKt / air.soundKt;
  look.engines = look.engines.map((engine) =>
    stepEngine(engine, { lever, reverse, onGround, hasFuel: state.fuelLb > 0 }, air, mach, dt),
  );
  const fuel = loadFuel(state.fuelLb);
  return {
    position: state.position,
    altitudeFt: state.altitudeFt,
    heightFt: state.altitudeFt - groundFt,
    headingTrue: state.heading,
    pitchDeg: look.pitchDeg,
    bankDeg: look.bankDeg,
    slipDeg: 0,
    iasKt: state.airspeedKt,
    tasKt: state.airspeedKt,
    mach,
    verticalSpeedFpm: state.climbRateFpm,
    groundSpeedKt: state.airspeedKt,
    trackTrue: state.heading,
    alphaDeg: 3,
    stallAlphaDeg: 12,
    loadFactor: 1,
    onGround,
    gear: look.gear,
    flapsDeg: look.flapsDeg,
    speedbrake: state.phase === 'rollout' ? 1 : 0,
    engines: look.engines,
    fuel,
    fuelLb: state.fuelLb,
    weightLb: JUMBO.emptyWeightLb + JUMBO.payloadLb + state.fuelLb,
  };
}

/** The bank a coordinated turn at the program's rate would need, capped at what looks sane. */
function bankForTurn(state: ProgramState): number {
  if (state.phase === 'ils') return 0;
  const rate = (TURN_RATES[Math.abs(state.rudder)] ?? 0) / DEGREES_PER_RADIAN;
  const bank = atan((state.airspeedKt * FPS_PER_KNOT * rate) / GRAVITY) * DEGREES_PER_RADIAN;
  return Math.sign(state.rudder) * (bank < MAX_LOOK_BANK ? bank : MAX_LOOK_BANK);
}
