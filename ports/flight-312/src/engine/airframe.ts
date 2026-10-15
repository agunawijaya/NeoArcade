import { airAt, casFromTas, dynamicPressure, pressureAltitude } from './atmosphere';
import {
  FLAP_DETENTS,
  flapAero,
  GEAR_DRAG,
  JUMBO,
  SPEEDBRAKE_DRAG,
  stallAlpha,
  TANK_ORDER,
  type TankId,
} from './aircraft';
import { idleEngine, stepEngine, type EngineState } from './engines';
import {
  angleDifference,
  approach,
  atan2,
  clamp,
  DEGREES_PER_RADIAN,
  normaliseDegrees,
  pow,
  sinCosDegrees,
} from './exact-math';
import { advance, type LatLon } from './geo';
import { FPM_PER_FPS, FPS_PER_KNOT, GRAVITY } from './units';

/**
 * The jumbo as a point mass with an attitude: lift, drag, thrust and weight
 * move it along its flight path; the pitch and the bank, flown by the
 * controls (or the autopilot), set the angle of attack and the turn. On the
 * ground it rolls on its wheels with brakes, nose-wheel steering and
 * reversers, rotates when the tail has the authority, and strikes it past
 * eleven degrees. The model is tuned to the type's public performance
 * figures; tests in airframe.test.ts hold it to them.
 */
export interface AirframeState {
  position: LatLon;
  /** Wheels above sea level. */
  altitudeFt: number;
  /** Speed through the air. */
  tasKt: number;
  /** Climb angle of the path through the air, degrees. */
  pathDeg: number;
  /** True direction of the path through the air. */
  pathHeading: number;
  /** Where the nose points, true. */
  headingTrue: number;
  pitchDeg: number;
  bankDeg: number;
  /** Degrees per second. */
  pitchRate: number;
  rollRate: number;
  sideslipDeg: number;
  onGround: boolean;
  /** On the ground: speed along the heading, feet per second. */
  rollFps: number;
  /** 0 up, 1 down and locked. */
  gear: number;
  /** Flap angle, degrees, as it travels. */
  flaps: number;
  speedbrake: number;
  engines: EngineState[];
  fuel: Record<TankId, number>;
  /** Stabiliser trim, expressed as the angle of attack it holds hands off. */
  trimAlphaDeg: number;
  // Derived each step, for the instruments.
  iasKt: number;
  mach: number;
  alphaDeg: number;
  verticalSpeedFpm: number;
  groundSpeedKt: number;
  trackTrue: number;
  loadFactor: number;
  weightLb: number;
}

export interface AirframeControls {
  /** −1 full forward … 1 full back. */
  elevator: number;
  /** −1 left … 1 right. */
  aileron: number;
  rudder: number;
  /** Forward thrust levers, 0 idle … 1 full. */
  levers: readonly number[];
  /** Reverse levers, 0 stowed … 1 full reverse. */
  reverse: readonly number[];
  /** Index into FLAP_DETENTS. */
  flapLever: number;
  gearDown: boolean;
  /** 0 down … 1 full up (flight detent at 0.5). */
  speedbrake: number;
  /** Toe brakes, 0 … 1; the parking brake is full brakes. */
  brakes: number;
  /** −1 nose down, 0, 1 nose up: the trim switches held. */
  trim: number;
  /** Neutral stick holds the attitude (the Arcade level's auto-trim, and the autopilot). */
  holdAttitude: boolean;
  /** The autopilot's commands, degrees per second, when it is flying. */
  autopilot: { pitchRate: number; rollRate: number } | null;
  /** The crew opens the crossfeed valves, so every engine draws from every main tank. */
  crossfeed: boolean;
}

export interface AirframeEnvironment {
  /** Air mass velocity, feet per second toward north, east and up. */
  wind: { north: number; east: number; up: number };
  groundFt: number;
  temperatureOffset: number;
  qnh: number;
}

export type AirframeEvent =
  | { kind: 'liftoff' }
  | {
      kind: 'touchdown';
      sinkFpm: number;
      pitchDeg: number;
      bankDeg: number;
      crabDeg: number;
      gearDown: boolean;
      speedKt: number;
    }
  | { kind: 'tailStrike'; pitchDeg: number }
  | { kind: 'stopped' }
  | { kind: 'fuelExhausted'; engine: number };

const MAX_PITCH_RATE = 4;
const MAX_ROLL_RATE = 12;
const PITCH_RESPONSE_S = 0.5;
const ROLL_RESPONSE_S = 0.45;
const ROLLING_FRICTION = 0.02;
/** Effective braking friction with anti-skid on a dry runway. */
const MAX_BRAKING = 0.34;
const NOSE_STEER_DEG = 7;

export function startOnRunway(
  position: LatLon,
  elevationFt: number,
  headingTrue: number,
  fuel: Record<TankId, number>,
): AirframeState {
  const state: AirframeState = {
    position,
    altitudeFt: elevationFt,
    tasKt: 0,
    pathDeg: 0,
    pathHeading: headingTrue,
    headingTrue,
    pitchDeg: 0,
    bankDeg: 0,
    pitchRate: 0,
    rollRate: 0,
    sideslipDeg: 0,
    onGround: true,
    rollFps: 0,
    gear: 1,
    flaps: 0,
    speedbrake: 0,
    engines: Array.from({ length: JUMBO.engineCount }, idleEngine),
    fuel: { ...fuel },
    trimAlphaDeg: 6,
    iasKt: 0,
    mach: 0,
    alphaDeg: 0,
    verticalSpeedFpm: 0,
    groundSpeedKt: 0,
    trackTrue: headingTrue,
    loadFactor: 1,
    weightLb: 0,
  };
  state.weightLb = weightOf(state);
  return state;
}

/** In the air, on a path: for practice approaches and tests. */
export function startInFlight(
  position: LatLon,
  altitudeFt: number,
  headingTrue: number,
  tasKt: number,
  fuel: Record<TankId, number>,
  flaps: number,
  gearDown: boolean,
): AirframeState {
  const state = startOnRunway(position, altitudeFt, headingTrue, fuel);
  state.onGround = false;
  state.tasKt = tasKt;
  state.flaps = flaps;
  state.gear = gearDown ? 1 : 0;
  state.weightLb = weightOf(state);
  // Trimmed for level flight at this speed.
  const air = airAt(altitudeFt);
  const lift = state.weightLb / (dynamicPressure(tasKt, air) * JUMBO.wingAreaFt2);
  const alpha = (lift - flapAero(flaps).liftAtZero) / JUMBO.liftSlopePerDeg;
  state.pitchDeg = alpha;
  state.alphaDeg = alpha;
  state.trimAlphaDeg = alpha;
  state.iasKt = casFromTas(tasKt, air);
  state.groundSpeedKt = tasKt;
  // The engines spooled to the thrust that holds this speed level.
  const drag =
    dynamicPressure(tasKt, air) *
    JUMBO.wingAreaFt2 *
    dragCoefficient(state, lift, altitudeFt, tasKt / air.soundKt);
  const lever = leverForThrust(drag / JUMBO.engineCount, air, tasKt / air.soundKt);
  for (let settle = 0; settle < 600; settle++) {
    state.engines = state.engines.map((engine) =>
      stepEngine(
        engine,
        { lever, reverse: 0, onGround: false, hasFuel: true },
        air,
        tasKt / air.soundKt,
        0.1,
      ),
    );
  }
  return state;
}

/** The lever that gives a thrust per engine, found by halving the interval. */
export function leverForThrust(
  thrust: number,
  air: ReturnType<typeof airAt>,
  mach: number,
): number {
  let low = 0;
  let high = 1;
  for (let step = 0; step < 30; step++) {
    const middle = (low + high) / 2;
    let engine = idleEngine();
    for (let settle = 0; settle < 200; settle++) {
      engine = stepEngine(
        engine,
        { lever: middle, reverse: 0, onGround: false, hasFuel: true },
        air,
        mach,
        0.2,
      );
    }
    if (engine.thrust < thrust) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

export function fuelOnBoard(fuel: Record<TankId, number>): number {
  return TANK_ORDER.reduce((sum, tank) => sum + fuel[tank], 0);
}

export function weightOf(state: AirframeState): number {
  return JUMBO.emptyWeightLb + JUMBO.payloadLb + fuelOnBoard(state.fuel);
}

export function stepAirframe(
  state: AirframeState,
  controls: AirframeControls,
  environment: AirframeEnvironment,
  dt: number,
): AirframeEvent[] {
  const events: AirframeEvent[] = [];
  const air = airAt(
    pressureAltitude(state.altitudeFt, environment.qnh),
    environment.temperatureOffset,
  );

  moveSurfaces(state, controls, dt);
  burnFuel(state, controls, dt, events);
  const mach = state.tasKt / air.soundKt;
  state.engines = state.engines.map((engine, index) =>
    stepEngine(
      engine,
      {
        lever: controls.levers[index] ?? 0,
        reverse: controls.reverse[index] ?? 0,
        onGround: state.onGround,
        hasFuel: hasFuelFor(state, index, controls.crossfeed),
      },
      air,
      mach,
      dt,
    ),
  );
  state.weightLb = weightOf(state);
  const thrust = state.engines.reduce((sum, engine) => sum + engine.thrust, 0);

  if (state.onGround) groundRoll(state, controls, environment, air, thrust, dt, events);
  else flight(state, controls, environment, air, thrust, dt, events);

  instruments(state, environment, air);
  return events;
}

function moveSurfaces(state: AirframeState, controls: AirframeControls, dt: number) {
  const wanted =
    FLAP_DETENTS[clamp(Math.round(controls.flapLever), 0, FLAP_DETENTS.length - 1)]?.degrees ?? 0;
  // The flaps travel about two degrees a second in the first notches and one a second beyond.
  state.flaps = approach(state.flaps, wanted, (state.flaps < 5 ? 2 : 1) * dt);
  // The gear takes ten seconds down and eight up, and does not retract on the ground.
  if (controls.gearDown) state.gear = approach(state.gear, 1, dt / 10);
  else if (!state.onGround) state.gear = approach(state.gear, 0, dt / 8);
  state.speedbrake = approach(state.speedbrake, clamp(controls.speedbrake, 0, 1), dt);
  state.trimAlphaDeg = clamp(state.trimAlphaDeg + controls.trim * 0.5 * dt, -2, 14);
}

function hasFuelFor(state: AirframeState, engine: number, crossfeed: boolean): boolean {
  if (state.fuel.centre > 0) return true;
  if (crossfeed) return MAIN_TANKS.some((tank) => state.fuel[tank] > 0);
  return state.fuel[mainTank(engine)] > 0;
}

const MAIN_TANKS = ['main1', 'main2', 'main3', 'main4'] as const;
const mainTank = (engine: number): TankId => MAIN_TANKS[engine] ?? 'main1';

/**
 * The centre tank feeds all four engines while it has fuel; then each engine
 * draws from its own main tank, or from all of them with the crossfeed
 * open. The reserve tanks drain into the outer mains once those run low.
 */
function burnFuel(
  state: AirframeState,
  controls: AirframeControls,
  dt: number,
  events: AirframeEvent[],
) {
  state.engines.forEach((engine, index) => {
    let need = (engine.fuelFlow / 3600) * dt;
    if (need <= 0) return;
    if (state.fuel.centre > 0) {
      const taken = Math.min(need, state.fuel.centre);
      state.fuel.centre -= taken;
      need -= taken;
    }
    const tanks: readonly TankId[] = controls.crossfeed ? MAIN_TANKS : [mainTank(index)];
    // Evenly from every tank that still has fuel, until the need is met or they are dry.
    for (let pass = 0; pass < tanks.length && need > 1e-9; pass++) {
      const live = tanks.filter((tank) => state.fuel[tank] > 0);
      if (live.length === 0) break;
      const each = need / live.length;
      for (const tank of live) {
        const taken = Math.min(each, state.fuel[tank]);
        state.fuel[tank] -= taken;
        need -= taken;
      }
    }
    if (need > 0 && engine.running) events.push({ kind: 'fuelExhausted', engine: index });
  });
  for (const [reserve, main] of [
    ['reserve1', 'main1'],
    ['reserve4', 'main4'],
  ] as const) {
    if (state.fuel[main] < 6000 && state.fuel[reserve] > 0) {
      const flow = Math.min(state.fuel[reserve], 2 * dt);
      state.fuel[reserve] -= flow;
      state.fuel[main] += flow;
    }
  }
}

/** How much the tail and the ailerons can do: they need dynamic pressure. */
const authority = (q: number) => clamp(q / 75, 0.15, 1.3);

function liftCoefficient(alpha: number, flaps: number, heightFt: number): number {
  const aero = flapAero(flaps);
  const stall = stallAlpha(flaps);
  let lift =
    alpha <= stall
      ? aero.liftAtZero + JUMBO.liftSlopePerDeg * alpha
      : aero.maxLift - 0.05 * (alpha - stall);
  // Near the ground the wing lifts a little more.
  const relative = heightFt / JUMBO.spanFt;
  if (relative < 1) lift *= 1 + 0.08 * (1 - (relative > 0 ? relative : 0));
  return lift;
}

function dragCoefficient(
  state: AirframeState,
  lift: number,
  heightFt: number,
  mach: number,
): number {
  const aero = flapAero(state.flaps);
  // Ground effect weakens the induced drag: φ = (16h/b)² / (1 + (16h/b)²).
  const relative = (16 * (heightFt > 1 ? heightFt : 1)) / JUMBO.spanFt;
  const groundEffect = relative < 6 ? (relative * relative) / (1 + relative * relative) : 1;
  const wave = mach > 0.84 ? 30 * pow(mach - 0.84, 3) : 0;
  return (
    aero.drag +
    GEAR_DRAG * state.gear +
    SPEEDBRAKE_DRAG * state.speedbrake +
    JUMBO.inducedDragFactor * groundEffect * lift * lift +
    wave
  );
}

function flight(
  state: AirframeState,
  controls: AirframeControls,
  environment: AirframeEnvironment,
  air: ReturnType<typeof airAt>,
  thrust: number,
  dt: number,
  events: AirframeEvent[],
) {
  const height = state.altitudeFt - environment.groundFt;
  const speed = state.tasKt * FPS_PER_KNOT > 30 ? state.tasKt * FPS_PER_KNOT : 30;
  const q = dynamicPressure(speed / FPS_PER_KNOT, air);
  const alpha = state.pitchDeg - state.pathDeg;
  const mach = state.tasKt / air.soundKt;
  const liftCoeff = liftCoefficient(alpha, state.flaps, height);
  const lift = q * JUMBO.wingAreaFt2 * liftCoeff;
  const drag = q * JUMBO.wingAreaFt2 * dragCoefficient(state, liftCoeff, height, mach);
  const mass = state.weightLb / GRAVITY;
  const a = sinCosDegrees(alpha);
  const gamma = sinCosDegrees(state.pathDeg);
  const bank = sinCosDegrees(state.bankDeg);
  const normal = lift + thrust * a.sin;

  const speedChange = (thrust * a.cos - drag) / mass - GRAVITY * gamma.sin;
  const pathChange = (normal * bank.cos) / (mass * speed) - (GRAVITY * gamma.cos) / speed;
  const turnRate = (normal * bank.sin) / (mass * speed * (gamma.cos > 0.1 ? gamma.cos : 0.1));

  attitude(state, controls, q, alpha, dt);

  const nextSpeed = speed + speedChange * dt;
  state.tasKt = (nextSpeed > 30 ? nextSpeed : 30) / FPS_PER_KNOT;
  state.pathDeg = clamp(state.pathDeg + pathChange * DEGREES_PER_RADIAN * dt, -60, 60);
  // A sideslip pushes the path sideways a little.
  state.pathHeading = normaliseDegrees(
    state.pathHeading + (turnRate * DEGREES_PER_RADIAN - 0.12 * state.sideslipDeg) * dt,
  );
  state.headingTrue = normaliseDegrees(state.pathHeading + state.sideslipDeg);
  state.loadFactor = normal / state.weightLb;

  // Ground velocity: the path through the air, carried by the air.
  const path = sinCosDegrees(state.pathHeading);
  const horizontal = speed * gamma.cos;
  const north = path.cos * horizontal + environment.wind.north;
  const east = path.sin * horizontal + environment.wind.east;
  const up = speed * gamma.sin + environment.wind.up;
  state.position = advance(state.position, north * dt, east * dt);
  state.altitudeFt += up * dt;
  state.verticalSpeedFpm = up * FPM_PER_FPS;

  if (state.altitudeFt <= environment.groundFt)
    touchdown(state, environment, north, east, up, events);
}

function attitude(
  state: AirframeState,
  controls: AirframeControls,
  q: number,
  alpha: number,
  dt: number,
) {
  const reach = authority(q);
  let pitchCommand: number;
  let rollCommand: number;
  if (controls.autopilot) {
    pitchCommand = controls.autopilot.pitchRate + controls.elevator * MAX_PITCH_RATE * reach;
    rollCommand = controls.autopilot.rollRate + controls.aileron * MAX_ROLL_RATE * reach;
  } else {
    pitchCommand = controls.elevator * MAX_PITCH_RATE * reach;
    rollCommand = controls.aileron * MAX_ROLL_RATE * reach;
    // Hands off, a trimmed jumbo returns to the angle of attack it is trimmed for.
    if (!controls.holdAttitude) pitchCommand += 0.45 * (state.trimAlphaDeg - alpha) * reach;
  }
  // Past the stall the nose falls whatever the pilot does.
  const stall = stallAlpha(state.flaps);
  if (alpha > stall) pitchCommand -= 1.6 * (alpha - stall);
  // Rolled steeply, the nose drops too, and a sideslip rolls the wings level (dihedral).
  rollCommand -= 0.4 * state.sideslipDeg;

  state.pitchRate += ((clamp(pitchCommand, -6, 6) - state.pitchRate) / PITCH_RESPONSE_S) * dt;
  state.rollRate += ((clamp(rollCommand, -15, 15) - state.rollRate) / ROLL_RESPONSE_S) * dt;
  state.pitchDeg = clamp(state.pitchDeg + state.pitchRate * dt, -45, 45);
  state.bankDeg = clamp(state.bankDeg + state.rollRate * dt, -90, 90);
  state.sideslipDeg += ((controls.rudder * 6 - state.sideslipDeg) / 1.2) * dt;
}

function touchdown(
  state: AirframeState,
  environment: AirframeEnvironment,
  north: number,
  east: number,
  up: number,
  events: AirframeEvent[],
) {
  const track = normaliseDegrees(atan2(east, north) * DEGREES_PER_RADIAN);
  events.push({
    kind: 'touchdown',
    sinkFpm: -up * FPM_PER_FPS,
    pitchDeg: state.pitchDeg,
    bankDeg: state.bankDeg,
    crabDeg: angleDifference(state.headingTrue, track),
    gearDown: state.gear > 0.99,
    speedKt: state.tasKt,
  });
  state.onGround = true;
  state.altitudeFt = environment.groundFt;
  const heading = sinCosDegrees(state.headingTrue);
  // The tyres keep the speed along the nose and scrub off the rest.
  const along = north * heading.cos + east * heading.sin;
  state.rollFps = along > 0 ? along : 0;
  state.pathDeg = 0;
  state.bankDeg = 0;
  state.rollRate = 0;
  state.pitchRate = state.pitchRate < 0 ? state.pitchRate : 0;
  state.verticalSpeedFpm = 0;
}

function groundRoll(
  state: AirframeState,
  controls: AirframeControls,
  environment: AirframeEnvironment,
  air: ReturnType<typeof airAt>,
  thrust: number,
  dt: number,
  events: AirframeEvent[],
) {
  const heading = sinCosDegrees(state.headingTrue);
  const airNorth = heading.cos * state.rollFps - environment.wind.north;
  const airEast = heading.sin * state.rollFps - environment.wind.east;
  const airspeed = Math.sqrt(airNorth * airNorth + airEast * airEast);
  state.tasKt = airspeed / FPS_PER_KNOT;
  const q = dynamicPressure(state.tasKt, air);
  const alpha = state.pitchDeg;
  const liftCoeff = liftCoefficient(alpha, state.flaps, 0);
  // Spoilers dump the lift once they are up.
  const lift = q * JUMBO.wingAreaFt2 * liftCoeff * (1 - 0.6 * state.speedbrake);
  const drag = q * JUMBO.wingAreaFt2 * dragCoefficient(state, liftCoeff, 0, 0);
  const mass = state.weightLb / GRAVITY;
  const normal = state.weightLb - lift > 0 ? state.weightLb - lift : 0;
  const braking = MAX_BRAKING * clamp(controls.brakes, 0, 1);
  const friction = (ROLLING_FRICTION + braking) * normal;

  let acceleration = (thrust * sinCosDegrees(alpha).cos - drag) / mass;
  if (state.rollFps > 0.05) acceleration -= friction / mass;
  else if (Math.abs(thrust) * 1.05 < (ROLLING_FRICTION + braking) * normal) acceleration = 0;
  const wasMoving = state.rollFps > 0.5;
  state.rollFps = state.rollFps + acceleration * dt > 0 ? state.rollFps + acceleration * dt : 0;
  if (wasMoving && state.rollFps <= 0.5) events.push({ kind: 'stopped' });

  // Nose-wheel steering from the pedals, more of it at taxi speeds; the tail weathervanes into a crosswind.
  const steerDeg = controls.rudder * (NOSE_STEER_DEG + 50 * clamp(1 - state.rollFps / 40, 0, 1));
  const steer = sinCosDegrees(steerDeg);
  let yawRate = (state.rollFps / JUMBO.wheelbaseFt) * (steer.sin / steer.cos) * DEGREES_PER_RADIAN;
  const crossWind = environment.wind.east * heading.cos - environment.wind.north * heading.sin;
  yawRate -= 0.012 * (crossWind / FPS_PER_KNOT) * clamp(state.tasKt / 120, 0, 1.5);
  state.headingTrue = normaliseDegrees(state.headingTrue + yawRate * dt);
  state.pathHeading = state.headingTrue;
  state.sideslipDeg = 0;

  // Rotation: the elevator lifts the nose once the tail has the air; with the stick neutral it settles back.
  const reach = clamp((q - 25) / 55, 0, 1.2);
  let pitchCommand = controls.elevator * 3.2 * reach;
  if (controls.autopilot) pitchCommand += controls.autopilot.pitchRate * reach;
  if (pitchCommand <= 0.05 && state.pitchDeg > 0) pitchCommand = -2.2;
  state.pitchRate += ((pitchCommand - state.pitchRate) / PITCH_RESPONSE_S) * dt;
  state.pitchDeg = clamp(state.pitchDeg + state.pitchRate * dt, 0, 20);
  if (state.pitchDeg === 0 && state.pitchRate < 0) state.pitchRate = 0;
  if (state.pitchDeg >= JUMBO.tailStrikePitchDeg) {
    events.push({ kind: 'tailStrike', pitchDeg: state.pitchDeg });
  }

  state.position = advance(
    state.position,
    heading.cos * state.rollFps * dt,
    heading.sin * state.rollFps * dt,
  );
  state.altitudeFt = environment.groundFt;
  state.verticalSpeedFpm = 0;
  state.loadFactor = 1;

  if (lift > state.weightLb) {
    state.onGround = false;
    state.pathDeg = 0.2;
    state.pathHeading = state.headingTrue;
    state.altitudeFt = environment.groundFt + 0.1;
    events.push({ kind: 'liftoff' });
  }
}

function instruments(
  state: AirframeState,
  environment: AirframeEnvironment,
  air: ReturnType<typeof airAt>,
) {
  state.mach = state.tasKt / air.soundKt;
  state.iasKt = state.tasKt > 1 ? casFromTas(state.tasKt, air) : 0;
  state.alphaDeg = state.onGround ? state.pitchDeg : state.pitchDeg - state.pathDeg;
  if (state.onGround) {
    state.groundSpeedKt = state.rollFps / FPS_PER_KNOT;
    state.trackTrue = state.headingTrue;
    return;
  }
  const path = sinCosDegrees(state.pathHeading);
  const horizontal = state.tasKt * FPS_PER_KNOT * sinCosDegrees(state.pathDeg).cos;
  const north = path.cos * horizontal + environment.wind.north;
  const east = path.sin * horizontal + environment.wind.east;
  state.groundSpeedKt = Math.sqrt(north * north + east * east) / FPS_PER_KNOT;
  state.trackTrue = normaliseDegrees(atan2(east, north) * DEGREES_PER_RADIAN);
}
