import { approach, clamp, pow } from './exact-math';
import type { Air } from './atmosphere';
import { JUMBO } from './aircraft';

/**
 * A high-bypass turbofan of the JT9D class, as its gauges show it: the fan
 * (N1) spools towards what the thrust lever asks, slowly at the bottom of
 * its range; EPR, EGT, N2 and fuel flow follow from where the fan is and
 * how thin and fast the air is. Thrust lapses with density and Mach. A
 * reverser deploys only on the ground with the lever at idle.
 */
export interface EngineState {
  /** Fan speed, % of rated. */
  n1: number;
  n2: number;
  /** Exhaust gas temperature, °C. */
  egt: number;
  /** Engine pressure ratio. */
  epr: number;
  /** Pounds per hour. */
  fuelFlow: number;
  /** Net thrust, pounds force; negative in reverse. */
  thrust: number;
  /** How far the reverser sleeves are open, 0–1. */
  reverser: number;
  running: boolean;
}

export const IDLE_N1 = 26;
const MAX_N1 = 100;
/** A windmilling fan with no fuel. */
const WINDMILL_N1 = 9;

export function idleEngine(): EngineState {
  return {
    n1: IDLE_N1,
    n2: 62,
    egt: 400,
    epr: 1.01,
    fuelFlow: 1150,
    thrust: 1500,
    reverser: 0,
    running: true,
  };
}

/** How much of rated thrust a fan speed gives, before the air takes its share. */
function fanFraction(n1: number): number {
  const t = clamp((n1 - IDLE_N1) / (MAX_N1 - IDLE_N1), 0, 1);
  return 0.035 + 0.965 * t * t;
}

/** The forward lever that holds a fan speed once the engine has settled. */
export const leverForN1 = (n1: number) => clamp((n1 - IDLE_N1) / (MAX_N1 - IDLE_N1), 0, 1);

export interface EngineDemand {
  /** Forward thrust lever, 0 idle to 1 full. */
  lever: number;
  /** Reverse thrust lever, 0 stowed to 1 full reverse. */
  reverse: number;
  onGround: boolean;
  hasFuel: boolean;
}

export function stepEngine(
  engine: EngineState,
  demand: EngineDemand,
  air: Air,
  mach: number,
  dt: number,
): EngineState {
  const running = engine.running && demand.hasFuel;
  // Reversers open only on the ground with the forward lever closed.
  const wantReverse = demand.onGround && demand.lever < 0.02 && demand.reverse > 0.02;
  const reverser = approach(engine.reverser, wantReverse ? 1 : 0, dt / 2);
  const setting = reverser > 0.95 ? demand.reverse * 0.85 : reverser > 0.05 ? 0 : demand.lever;
  const target = running ? IDLE_N1 + (MAX_N1 - IDLE_N1) * clamp(setting, 0, 1) : WINDMILL_N1;
  // Fans accelerate slowly from idle and quickly once they are turning fast.
  const rate = engine.n1 < target ? 2.5 + 0.11 * engine.n1 : 9;
  const n1 = approach(engine.n1, target, rate * dt);

  const fraction = running ? fanFraction(n1) : 0;
  // A high-bypass fan loses thrust quickly with speed, then flattens out at cruise Mach.
  const lapse = pow(air.densityRatio, 0.85) * (1 - 0.75 * mach + 0.45 * mach * mach);
  const forward = JUMBO.staticThrustLbf * fraction * lapse;
  const thrust = reverser > 0.05 ? -forward * 0.42 * reverser : forward;
  const tsfc = 0.34 + 0.36 * mach;
  const fuelFlow = running ? 900 * air.pressureRatio + 250 + tsfc * forward : 0;
  return {
    n1,
    n2: running ? 55 + 45 * pow(clamp((n1 - 20) / 80, 1e-6, 1), 0.7) : n1 * 2.2,
    egt: running ? 360 + 480 * fraction + (air.temperature - 288.15) * 0.8 : 80,
    epr: running ? 1 + 0.56 * pow(fraction, 0.9) * (1 - 0.15 * mach) : 0.98,
    fuelFlow,
    thrust,
    reverser,
    running,
  };
}
