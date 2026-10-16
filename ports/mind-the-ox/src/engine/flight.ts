import {
  CEILING,
  GRAVITY_SPEED,
  MAX_BOMBS,
  MAX_BURSTS,
  MAX_FUEL,
  MAX_MISSILES,
  MAX_ROUNDS,
  MAX_THROTTLE,
  MAX_TORPEDOES,
  REARM_ROUNDS_PER_MOVE,
  REARM_STORE_MOVES,
  REFUEL_PER_MOVE,
  SPEED_STEP_MOVES,
  STALL_TUMBLE_MOVES,
  TERMINAL_FALL_SPEED,
  TICKS_PER_MOVE,
  movesToTicks,
  perTick,
} from './constants';
import { downPlane } from './damage';
import { carrierOf, parkOnDeck, updateOnDeck } from './deck';
import { PLANE_HALF_LENGTH, WHEEL_DROP, planeContactPoints, uprightness } from './geometry';
import { runwaySpan } from './map';
import {
  CLASSIC_STEP,
  DOWN,
  HALF_TURN,
  LEFT,
  RIGHT,
  TURN,
  climbFactor,
  cosine,
  headingDelta,
  headingOf,
  sine,
  wrapHeading,
} from './trig';
import { IDLE_CONTROLS, type Loadout, type Plane, type World } from './world';

/** Smooth flight turns no faster than Classic: a sixteenth of a turn per move. */
export const MAX_TURN_RATE = CLASSIC_STEP / TICKS_PER_MOVE;
/** …and reaches that rate within five ticks, so the stick feels immediate but never jerky. */
const TURN_EASE = MAX_TURN_RATE / 5;
/** Smooth flight opens the throttle from idle to full in half a second. */
const THROTTLE_RATE = MAX_THROTTLE / 30;
/** A stalled plane counts as nose-down within this much of straight down in smooth flight. */
const RECOVERY_TOLERANCE = 160;
/** Smooth flight rolls an upside-down plane upright after this long without steering. */
const AUTO_ROLL_TICKS = 20;
/** The winner's climb into the sun, about fifteen degrees. */
const VICTORY_CLIMB = 170;
/** A landing roll brakes from flying speed to a stop in a little under a second. */
const ROLL_BRAKING = 0.08;
/** The settle after running off a deck dies away by this share a tick, and stops below the second. */
const SINK_DECAY = 0.93;
const SINK_GONE = 0.004;
/** …unless the plane is still short of flying speed: then it grows by this much a tick. */
const SINK_GROWTH = 0.02;

export function isMoveTick(world: World): boolean {
  return world.tick % TICKS_PER_MOVE === 0;
}

function moveNumber(world: World): number {
  return Math.floor(world.tick / TICKS_PER_MOVE);
}

/** Wheels on the runway (or its spot on the deck), nose along it, engine ticking over. */
export function park(world: World, plane: Plane, x = plane.base.x, facing = plane.base.facing) {
  plane.state = 'parked';
  plane.x = x;
  plane.y = world.terrain.heightAt(x) + WHEEL_DROP;
  plane.heading = facing === 1 ? RIGHT : LEFT;
  plane.inverted = facing === -1;
  plane.vx = 0;
  plane.vy = 0;
  plane.speed = 0;
  plane.throttle = 0;
  plane.turnRate = 0;
  plane.homing = false;
  plane.stateTimer = 0;
  plane.pendingPitch = 0;
  plane.pendingThrottle = 0;
  plane.pendingFlip = false;
  plane.cpu.held = { ...IDLE_CONTROLS };
  const ship = carrierOf(world, plane);
  if (ship) parkOnDeck(plane, ship);
}

/** What each load fills the racks with: five bombs, or one torpedo. */
export function bombsFor(loadout: Loadout): number {
  return loadout === 'bombs' ? MAX_BOMBS : 0;
}

export function torpedoesFor(loadout: Loadout): number {
  return loadout === 'torpedo' ? MAX_TORPEDOES : 0;
}

/** Full tank, full guns, full racks: what a fresh plane gets after a crash. */
export function refill(plane: Plane) {
  plane.fuel = MAX_FUEL;
  plane.rounds = MAX_ROUNDS;
  plane.bombs = bombsFor(plane.loadout);
  plane.torpedoes = torpedoesFor(plane.loadout);
  plane.missiles = MAX_MISSILES;
  plane.bursts = MAX_BURSTS;
  plane.wounded = false;
  plane.lastHitBy = null;
}

/** One tick of a plane under its pilot's control, parked, rolling or falling. */
export function updatePlane(world: World, plane: Plane) {
  switch (plane.state) {
    case 'parked':
      updateParked(world, plane);
      break;
    case 'rolling':
      updateRolling(world, plane);
      break;
    case 'launching': {
      const ship = carrierOf(world, plane);
      if (ship) updateOnDeck(world, plane, ship);
      break;
    }
    case 'flying':
    case 'stalled':
      updateFlight(world, plane);
      break;
    case 'falling':
      updateFalling(world, plane);
      break;
    case 'crashed':
      plane.stateTimer = Math.max(0, plane.stateTimer - 1);
      break;
    case 'victory':
      flyIntoTheSun(world, plane);
      break;
    case 'out':
      break;
  }
  plane.gunCooldown = Math.max(0, plane.gunCooldown - 1);
  plane.bombCooldown = Math.max(0, plane.bombCooldown - 1);
  plane.missileCooldown = Math.max(0, plane.missileCooldown - 1);
  plane.burstCooldown = Math.max(0, plane.burstCooldown - 1);
}

function updateParked(world: World, plane: Plane) {
  const { controls } = plane;
  if (controls.loadout && controls.loadout !== plane.loadout)
    changeLoadout(plane, controls.loadout);
  if (isMoveTick(world)) rearm(world, plane);
  const ship = carrierOf(world, plane);
  if (ship) {
    updateOnDeck(world, plane, ship);
    return;
  }
  // The 1984 plane leapt to its slowest flying speed the moment the pilot touched anything.
  if (controls.throttle > 0 || controls.pitch !== 0) takeOff(world, plane, world.tuning.minSpeed);
}

function takeOff(world: World, plane: Plane, speed: number) {
  plane.state = 'flying';
  plane.pendingPitch = 0;
  plane.speed = Math.max(speed, world.tuning.minSpeed);
  plane.throttle = Math.max(plane.throttle, world.rules.flight === 'classic' ? 1 : THROTTLE_RATE);
  plane.wounded = false;
  setVelocity(world, plane);
  world.events.push({ type: 'takeoff', plane: plane.id });
}

/** The ground crew take off what is in the racks, and the new load comes up at the usual rate. */
function changeLoadout(plane: Plane, loadout: Loadout) {
  plane.loadout = loadout;
  plane.bombs = 0;
  plane.torpedoes = 0;
}

/** On the runway, brakes on, until the plane stops or the pilot opens up again. */
function updateRolling(world: World, plane: Plane) {
  const ship = carrierOf(world, plane);
  if (ship) {
    updateOnDeck(world, plane, ship);
    return;
  }
  if (plane.controls.throttle > 0) {
    takeOff(world, plane, plane.speed);
    return;
  }
  plane.speed = Math.max(0, plane.speed - ROLL_BRAKING);
  const direction = cosine(plane.heading) >= 0 ? 1 : -1;
  plane.vx = perTick(plane.speed) * direction;
  plane.vy = 0;
  plane.x += plane.vx;
  const { left, right } = runwaySpan(plane.base);
  if (plane.x < left || plane.x > right) {
    // Rolled off the end: whatever is beyond, it is flying again, slowly.
    plane.state = 'flying';
    return;
  }
  plane.y = world.terrain.heightAt(plane.x) + WHEEL_DROP;
  if (plane.speed === 0) park(world, plane, plane.x, direction);
}

/**
 * Landing at home tops everything up a little each move: fuel and bullets
 * quickly, a bomb, missile or starburst every twenty moves. A wound heals.
 */
function rearm(world: World, plane: Plane) {
  plane.wounded = false;
  if (!world.rules.expert) return;
  const bombs = bombsFor(plane.loadout);
  const torpedoes = torpedoesFor(plane.loadout);
  const wasShort =
    plane.fuel < MAX_FUEL ||
    plane.rounds < MAX_ROUNDS ||
    plane.bombs < bombs ||
    plane.torpedoes < torpedoes ||
    plane.missiles < MAX_MISSILES ||
    plane.bursts < MAX_BURSTS;
  if (!wasShort) return;
  plane.fuel = Math.min(MAX_FUEL, plane.fuel + REFUEL_PER_MOVE);
  plane.rounds = Math.min(MAX_ROUNDS, plane.rounds + REARM_ROUNDS_PER_MOVE);
  if (moveNumber(world) % REARM_STORE_MOVES === 0) {
    plane.bombs = Math.min(bombs, plane.bombs + 1);
    plane.torpedoes = Math.min(torpedoes, plane.torpedoes + 1);
    plane.missiles = Math.min(MAX_MISSILES, plane.missiles + 1);
    plane.bursts = Math.min(MAX_BURSTS, plane.bursts + 1);
  }
  const full =
    plane.fuel === MAX_FUEL &&
    plane.rounds === MAX_ROUNDS &&
    plane.bombs === bombs &&
    plane.torpedoes === torpedoes &&
    plane.missiles === MAX_MISSILES &&
    plane.bursts === MAX_BURSTS;
  if (full) world.events.push({ type: 'refuelled', plane: plane.id });
}

function updateFlight(world: World, plane: Plane) {
  const { rules } = world;
  const usesFuel = rules.expert && plane.pilot.kind === 'human' && !plane.ghost;
  if (usesFuel && plane.fuel <= 0) {
    downPlane(world, plane, 'fuel', plane.lastHitBy);
    return;
  }
  if (plane.state === 'stalled' && hasRecovered(world, plane)) {
    plane.state = 'flying';
    world.events.push({ type: 'recovered', plane: plane.id });
  }

  if (rules.flight === 'classic') steerClassic(world, plane);
  else steerSmooth(world, plane);

  updateSpeed(world, plane);
  if (plane.state === 'stalled') tumble(plane);
  setVelocity(world, plane);

  if (usesFuel) plane.fuel = Math.max(0, plane.fuel - perTick(plane.speed));
  plane.x = Math.min(
    world.map.width - PLANE_HALF_LENGTH,
    Math.max(PLANE_HALF_LENGTH, plane.x + plane.vx),
  );
  plane.y += plane.vy;
  if (plane.sink > 0) settleOffTheBow(world, plane);

  if (plane.state === 'flying' && plane.y >= CEILING) {
    if (rules.expert) stall(world, plane);
    else plane.heading = DOWN;
  }
}

/** Just off a deck the plane settles towards the sea, less and less, unless it is still too slow to fly. */
function settleOffTheBow(world: World, plane: Plane) {
  plane.y -= plane.sink;
  plane.sink =
    plane.speed < world.tuning.minSpeed ? plane.sink + SINK_GROWTH : plane.sink * SINK_DECAY;
  if (plane.sink < SINK_GONE) plane.sink = 0;
}

/**
 * 1984 steering: on each move the plane turns one sixteenth of a circle,
 * the throttle moves one notch, and a requested flip happens. A wounded
 * plane only answers on every other move.
 */
function steerClassic(world: World, plane: Plane) {
  const { controls } = plane;
  if (controls.pitch !== 0) plane.pendingPitch = Math.sign(controls.pitch);
  if (controls.throttle !== 0) plane.pendingThrottle = Math.sign(controls.throttle);
  if (controls.flip) plane.pendingFlip = true;
  if (!isMoveTick(world)) return;
  if (plane.wounded && moveNumber(world) % 2 === 0) return;

  if (plane.pendingPitch !== 0) {
    plane.heading = wrapHeading(
      plane.heading + plane.pendingPitch * CLASSIC_STEP * (plane.inverted ? -1 : 1),
    );
  }
  if (plane.pendingThrottle !== 0) {
    plane.throttle = Math.min(MAX_THROTTLE, Math.max(0, plane.throttle + plane.pendingThrottle));
  }
  if (plane.pendingFlip) plane.inverted = !plane.inverted;
  plane.pendingPitch = 0;
  plane.pendingThrottle = 0;
  plane.pendingFlip = false;
}

/**
 * Smooth steering: the stick sets a rate of turn that the plane eases into,
 * up to Classic's top rate; a wound halves the authority instead of
 * skipping moves. The throttle slides rather than clicks.
 */
function steerSmooth(world: World, plane: Plane) {
  const { controls } = plane;
  const authority = plane.wounded ? 0.5 : 1;
  const pitch = Math.max(-1, Math.min(1, controls.pitch));
  const wanted = pitch * MAX_TURN_RATE * authority;
  const change = Math.max(-TURN_EASE, Math.min(TURN_EASE, wanted - plane.turnRate));
  plane.turnRate += change;
  plane.heading = wrapHeading(plane.heading + plane.turnRate * (plane.inverted ? -1 : 1));
  plane.throttle = Math.min(
    MAX_THROTTLE,
    Math.max(
      0,
      plane.throttle + Math.max(-1, Math.min(1, controls.throttle)) * THROTTLE_RATE * authority,
    ),
  );
  if (controls.flip) {
    plane.inverted = !plane.inverted;
    plane.idleTicks = 0;
  }
  plane.idleTicks = pitch === 0 ? plane.idleTicks + 1 : 0;
  const upsideDown = uprightness(plane.heading, plane.inverted) < -0.35;
  if (
    world.rules.autoRoll &&
    plane.state === 'flying' &&
    upsideDown &&
    plane.idleTicks >= AUTO_ROLL_TICKS
  ) {
    plane.inverted = !plane.inverted;
    plane.idleTicks = 0;
  }
}

/**
 * Speed drifts towards the slowest flying speed, plus the throttle, plus
 * what gravity adds in a dive or takes in a climb. Below the slowest flying
 * speed an expert plane only loses more, and at nothing it stalls. In 1984
 * (and Classic) that was so however the pilot flew; in smooth flight the
 * plane can still be saved while the throttle and the nose ask for flying
 * speed, because there speed changes every tick rather than every fourth
 * move and the smallest dip below the line would otherwise be fatal.
 */
function updateSpeed(world: World, plane: Plane) {
  const { rules, tuning } = world;
  const stalled = plane.state === 'stalled';
  const classic = rules.flight === 'classic';
  if (classic && world.tick % (SPEED_STEP_MOVES * TICKS_PER_MOVE) !== 0) return;
  const step = classic ? 1 : 1 / (SPEED_STEP_MOVES * TICKS_PER_MOVE);

  const limit = speedLimit(world, plane);
  const sinking = classic || limit < tuning.minSpeed;
  if (!stalled && plane.speed < tuning.minSpeed && rules.expert && sinking) {
    plane.speed -= step;
  } else {
    if (plane.speed < limit) plane.speed = Math.min(limit, plane.speed + step);
    else if (plane.speed > limit) plane.speed = Math.max(limit, plane.speed - step);
  }

  if (plane.speed <= 0 && !stalled) {
    if (rules.expert) stall(world, plane);
    else plane.speed = 1;
  }
}

/** Where the speed is heading for the plane's current throttle and climb. */
export function speedLimit(world: World, plane: Plane): number {
  return world.tuning.minSpeed + plane.throttle - GRAVITY_SPEED * climbFactor(plane.heading);
}

export function setVelocity(world: World, plane: Plane) {
  const wind = perTick(world.rules.wind);
  if (plane.state === 'stalled') {
    plane.vx = wind;
    plane.vy = -perTick(plane.speed);
    return;
  }
  plane.vx = perTick(plane.speed) * cosine(plane.heading) + wind;
  plane.vy = perTick(plane.speed) * sine(plane.heading);
}

/**
 * Out of speed or over the ceiling: the nose drops to one side and the
 * plane falls, tumbling from side to side every six moves until its pilot
 * points it straight down and it has flying speed again.
 */
export function stall(world: World, plane: Plane) {
  const facingRight = cosine(plane.heading) >= 0;
  plane.state = 'stalled';
  plane.heading = facingRight ? TURN - HALF_TURN / 4 : HALF_TURN + HALF_TURN / 4;
  plane.inverted = !facingRight;
  plane.speed = 0;
  plane.turnRate = 0;
  plane.vx = 0;
  plane.vy = 0;
  plane.homing = false;
  plane.stateTimer = movesToTicks(STALL_TUMBLE_MOVES);
  world.events.push({ type: 'stall', plane: plane.id });
}

function tumble(plane: Plane) {
  plane.stateTimer -= 1;
  if (plane.stateTimer > 0) return;
  plane.inverted = !plane.inverted;
  // Mirror the heading across the vertical: nose down-right becomes nose down-left.
  plane.heading = wrapHeading(3 * HALF_TURN - plane.heading);
  plane.stateTimer = movesToTicks(STALL_TUMBLE_MOVES);
}

function hasRecovered(world: World, plane: Plane): boolean {
  if (plane.speed < world.tuning.minSpeed) return false;
  if (world.rules.flight === 'classic') return plane.heading === DOWN;
  if (Math.abs(headingDelta(plane.heading, DOWN)) > RECOVERY_TOLERANCE) return false;
  plane.heading = DOWN;
  return true;
}

/**
 * Shot down: every five moves the fall steepens by a unit and, once it is
 * going down, the plane loses a unit of forward speed. Pulling up stretches
 * the time between those steps, pushing down shortens it.
 */
function updateFalling(world: World, plane: Plane) {
  const { controls } = plane;
  if (controls.pitch !== 0) plane.pendingPitch = Math.sign(controls.pitch);
  if (isMoveTick(world)) {
    let countdown = 2;
    if (plane.vy < 0 && plane.vx !== 0) {
      // Pulling up only helps when the pilot is the right way up for the direction of the fall.
      const upright = plane.inverted === plane.vx < 0;
      countdown -= upright ? plane.pendingPitch : -plane.pendingPitch;
    }
    plane.pendingPitch = 0;
    plane.stateTimer -= countdown;
    if (plane.stateTimer <= 0) {
      steepenFall(plane);
      plane.stateTimer = 10;
    }
  }
  plane.x = Math.min(
    world.map.width - PLANE_HALF_LENGTH,
    Math.max(PLANE_HALF_LENGTH, plane.x + plane.vx),
  );
  plane.y = Math.min(CEILING * 1.5, plane.y + plane.vy);
  if (plane.vx !== 0 || plane.vy !== 0) plane.heading = headingOf(plane.vx, plane.vy);
}

function steepenFall(plane: Plane) {
  const unit = perTick(1);
  if (plane.vy < 0) {
    if (plane.vx > unit) plane.vx -= unit;
    else if (plane.vx < -unit) plane.vx += unit;
    else if (plane.vx !== 0) plane.vx = 0;
    else plane.inverted = !plane.inverted;
  }
  if (plane.vy > -perTick(TERMINAL_FALL_SPEED)) plane.vy -= unit;
}

/** The winner climbs away at an easy angle, whatever the pilot does, and keeps going. */
export function flyIntoTheSun(world: World, plane: Plane) {
  const facingRight = cosine(plane.heading) >= 0;
  const climb = facingRight ? VICTORY_CLIMB : HALF_TURN - VICTORY_CLIMB;
  plane.heading = wrapHeading(
    plane.heading + Math.max(-12, Math.min(12, headingDelta(plane.heading, climb))),
  );
  plane.inverted = !facingRight;
  plane.speed = world.tuning.minSpeed;
  setVelocity(world, plane);
  plane.x += plane.vx;
  plane.y += plane.vy;
}

/**
 * Whether touching the ground here is a runway touch rather than a crash:
 * over its own runway, the right way up, not sinking fast, and either level
 * or rotating its nose up for take-off.
 */
export function canTouchRunway(plane: Plane): boolean {
  if (plane.state !== 'flying') return false;
  const { left, right } = runwaySpan(plane.base);
  if (plane.x < left || plane.x > right) return false;
  const climb = sine(plane.heading);
  const upright = uprightness(plane.heading, plane.inverted) > 0.8;
  return upright && climb > -0.22 && climb < 0.6 && plane.vy > -perTick(2.5);
}

/**
 * On the runway: the plane rides on its wheels (or its tail, nose up for
 * take-off), and settles into a landing once it is level, throttled back
 * and down to flying speed.
 */
export function touchRunway(world: World, plane: Plane) {
  const runway = world.terrain.heightAt(plane.x);
  const contact = planeContactPoints(plane.x, plane.y, plane.heading, plane.inverted);
  const lowest = Math.min(contact.wheels.y, contact.tail.y);
  plane.y += Math.max(0, runway - lowest);
  plane.vy = Math.max(0, plane.vy);
  if (sine(plane.heading) < 0) plane.heading = cosine(plane.heading) >= 0 ? RIGHT : LEFT;
  const level = Math.abs(sine(plane.heading)) < 0.22;
  const settling = level && plane.throttle === 0 && plane.speed <= world.tuning.minSpeed + 1;
  if (!settling) return;
  plane.y = runway + WHEEL_DROP;
  plane.state = 'rolling';
  plane.homing = false;
  plane.wounded = false;
  world.events.push({ type: 'landed', plane: plane.id, fuel: plane.fuel / MAX_FUEL });
}
