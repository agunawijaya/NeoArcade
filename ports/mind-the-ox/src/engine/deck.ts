import {
  BASE_MIN_SPEED,
  MAX_FUEL,
  MAX_THROTTLE,
  TICKS_PER_MOVE,
  movesToTicks,
  perTick,
} from './constants';
import { ditchPlane, woundPlane } from './damage';
import { SHIP_CLASSES } from './fleet';
import { WHEEL_DROP, planeContactPoints, uprightness } from './geometry';
import type { Rules } from './rules';
import { deckHeaveRate, shipAtIndex } from './ships';
import { LEFT, RIGHT, cosine, sine } from './trig';
import type { Plane, Ship, World } from './world';

/**
 * A carrier's flight deck, measured from the stern along the ship: the
 * arresting wires near the stern, the deck park ahead of them, and the
 * run to the bow for take-off. The ship carries it all with it as it
 * steams, turns and rides the swell (see ADR "deck model").
 */

/** Where the wires are, units from the stern; the landing assist widens the window. */
const WIRES = { first: 12, last: 30 };
const ASSISTED_WIRES = { first: 9, last: 38 };
const WIRE_COUNT = 4;
/** The first parking spot, units from the stern, and the room each plane takes behind it. */
const PARK_SPOT = 44;
const SPOT_SPACING = 12;
/** Speed gained a tick rolling down the deck at full throttle, units a move, at the first round's speeds. */
const DECK_ACCEL = 0.034;
/** Speed lost a tick rolling with the throttle closed, and after the hook catches a wire, units a move. */
const DECK_FRICTION = 0.012;
const WIRE_BRAKING = 0.16;
/** How fast the deck crew push a plane along to its spot, units a move. */
const TAXI_SPEED = 1.2;
/** The settle off the bow: always a little, more for every unit short of flying speed. */
const BOW_SINK = 0.05;
const SINK_PER_MISSING_SPEED = 0.35;
/**
 * A landing the wires can take: coming in no faster than this over the
 * deck, units a move, and sinking no faster than the first number; up to
 * the second the plane is damaged, beyond it the undercarriage goes and the
 * plane over the side. The assist is more forgiving. The closure is for
 * the first round's planes; later rounds' fly faster, and the wires take
 * them as much faster (see `landingLimits`).
 */
const LANDING = { closure: 4.6, sink: 1.7, wreck: 2.9 };
const ASSISTED_LANDING = { closure: 5.4, sink: 2.2, wreck: 3.4 };
/** The window for this round's planes: as wide over their slowest flying speed as the first round's. */
function landingLimits(world: World): typeof LANDING {
  const limits = world.rules.landingAssist ? ASSISTED_LANDING : LANDING;
  return { ...limits, closure: limits.closure + world.tuning.minSpeed - BASE_MIN_SPEED };
}

/**
 * Whether a deck can be landed on at all in this sea: it must rise no
 * faster than half the sink the wires forgive, or it would strike a plane
 * coming down as gently as a pilot can.
 */
export function deckLandable(rules: Pick<Rules, 'seaState' | 'landingAssist'>): boolean {
  const limits = rules.landingAssist ? ASSISTED_LANDING : LANDING;
  return deckHeaveRate(rules.seaState, rules.landingAssist) < limits.sink / 2;
}

/** Below this share of its hit points, a carrier's deck is too damaged to take planes. */
const DECK_DAMAGE_LIMIT = 0.4;
/** Patching a fouled deck takes this many moves for each hit point. */
const DECK_REPAIR_MOVES = 40;

export function carrierOf(world: World, plane: Plane): Ship | null {
  if (plane.base.carrier === undefined) return null;
  return shipAtIndex(world, plane.base.carrier) ?? null;
}

/** Where home is now: the airfield, or wherever the carrier has steamed to. */
export function homeX(world: World, plane: Plane): number {
  return carrierOf(world, plane)?.x ?? plane.base.x;
}

export function deckLength(ship: Ship): number {
  return SHIP_CLASSES[ship.kind].length;
}

/** The deck's surface height, riding the swell with the ship. */
export function deckHeight(ship: Ship): number {
  return ship.y + SHIP_CLASSES[ship.kind].freeboard;
}

export function sternX(ship: Ship): number {
  return ship.x - (ship.direction * deckLength(ship)) / 2;
}

export function deckX(ship: Ship, offset: number): number {
  return sternX(ship) + ship.direction * offset;
}

export function offsetOnDeck(ship: Ship, x: number): number {
  return (x - sternX(ship)) * ship.direction;
}

/** Afloat, steaming straight, and not so badly hit that the deck is fouled. */
export function deckOpen(ship: Ship): boolean {
  return ship.state === 'afloat' && ship.turn === 0 && !deckFouled(ship);
}

/** So badly hit that no plane can land on it or take off from it, turning or not. */
export function deckFouled(ship: Ship): boolean {
  return ship.hitPoints <= ship.maxHitPoints * DECK_DAMAGE_LIMIT;
}

/**
 * The deck crew patch a fouled deck: hit points come back slowly, but only
 * until the deck can be used again, so a carrier is never shut for good
 * with its planes on it.
 */
export function clearTheDeck(ship: Ship) {
  if (ship.kind !== 'carrier' || ship.state !== 'afloat' || !deckFouled(ship)) return;
  ship.hitPoints = Math.min(
    ship.maxHitPoints * DECK_DAMAGE_LIMIT + 1,
    ship.hitPoints + 1 / movesToTicks(DECK_REPAIR_MOVES),
  );
}

export function wireWindow(world: World): { first: number; last: number } {
  return world.rules.landingAssist ? ASSISTED_WIRES : WIRES;
}

export function parkingSpot(plane: Plane): number {
  return PARK_SPOT + plane.deckSpot * SPOT_SPACING;
}

/**
 * The wind over the deck: the ship's own way, plus the wind when it blows
 * from ahead. A plane rolling down the deck flies as fast as its roll plus
 * this.
 */
export function windOverDeck(world: World, ship: Ship): number {
  const steaming = ship.turn === 0 ? ship.speed : 0;
  return steaming - world.rules.wind * ship.direction;
}

/** Puts a plane on its spot on the deck, engine ticking over, facing the bow. */
export function parkOnDeck(plane: Plane, ship: Ship) {
  plane.state = 'parked';
  plane.deckOffset = parkingSpot(plane);
  plane.deckSpeed = 0;
  plane.sink = 0;
  holdOnDeck(plane, ship);
}

/** Rides along with the ship: on the deck, facing its bow, moving with it. */
function holdOnDeck(plane: Plane, ship: Ship) {
  plane.x = deckX(ship, plane.deckOffset);
  plane.y = deckHeight(ship) + WHEEL_DROP;
  plane.heading = ship.direction === 1 ? RIGHT : LEFT;
  plane.inverted = ship.direction === -1;
  plane.vx = ship.vx + perTick(plane.deckSpeed) * ship.direction;
  plane.vy = ship.heaveRate;
  plane.turnRate = 0;
}

/**
 * A plane on its carrier this tick: parked, running down the deck to take
 * off, or pulled up by the wires and wheeled to its spot. A ship going
 * down takes its deck park with it.
 */
export function updateOnDeck(world: World, plane: Plane, ship: Ship) {
  if (ship.state !== 'afloat') {
    ditchPlane(world, plane);
    return;
  }
  if (plane.state === 'parked') {
    const { controls } = plane;
    if ((controls.throttle > 0 || controls.pitch !== 0) && deckOpen(ship)) {
      plane.state = 'launching';
      plane.throttle = Math.max(plane.throttle, world.rules.flight === 'classic' ? 1 : 0.1);
    }
  } else if (plane.state === 'launching') {
    runDownTheDeck(world, plane, ship);
    if (plane.state !== 'launching') return;
  } else if (plane.state === 'rolling') {
    rollToSpot(plane);
  }
  if (plane.state !== 'launching') plane.speed = plane.deckSpeed;
  holdOnDeck(plane, ship);
}

/**
 * Down the deck under power. With the throttle closed the plane only
 * rolls on (there are no brakes for a bolter: open up and go round, or go
 * off the bow slow); one that rolls to a stop is wheeled back to its spot.
 */
function runDownTheDeck(world: World, plane: Plane, ship: Ship) {
  const { controls } = plane;
  const opening = Math.sign(controls.throttle);
  if (world.rules.flight === 'classic') {
    if (opening !== 0 && world.tick % TICKS_PER_MOVE === 0)
      plane.throttle = Math.min(MAX_THROTTLE, Math.max(0, plane.throttle + opening));
  } else {
    const rate = MAX_THROTTLE / 30;
    plane.throttle = Math.min(MAX_THROTTLE, Math.max(0, plane.throttle + opening * rate));
  }
  // The faster the round, the harder the engines pull: the run is the same length at any speed.
  const lift = world.tuning.minSpeed / BASE_MIN_SPEED;
  if (plane.throttle > 0)
    plane.deckSpeed += DECK_ACCEL * lift * lift * (plane.throttle / MAX_THROTTLE);
  else plane.deckSpeed = Math.max(0, plane.deckSpeed - DECK_FRICTION);
  plane.deckOffset += perTick(plane.deckSpeed);
  const airspeed = plane.deckSpeed + windOverDeck(world, ship);
  // What the airspeed indicator shows on the run: the roll and the wind over the deck together.
  plane.speed = airspeed;
  const rotating = controls.pitch > 0 && airspeed >= world.tuning.minSpeed;
  if (rotating || plane.deckOffset >= deckLength(ship)) {
    flyOff(world, plane, ship, airspeed);
    return;
  }
  if (plane.deckSpeed === 0) plane.state = 'rolling';
}

/**
 * Off the deck, by rotating or over the bow: flying at the roll's speed
 * plus the wind over the deck, settling a little at first and a lot when
 * short of flying speed. Too short, and the sea is waiting.
 */
function flyOff(world: World, plane: Plane, ship: Ship, airspeed: number) {
  holdOnDeck(plane, ship);
  plane.state = 'flying';
  plane.speed = Math.max(0.5, airspeed);
  plane.deckSpeed = 0;
  plane.sink = BOW_SINK + Math.max(0, world.tuning.minSpeed - airspeed) * SINK_PER_MISSING_SPEED;
  plane.vx = perTick(plane.speed) * ship.direction + perTick(world.rules.wind);
  plane.vy = -plane.sink;
  plane.wounded = false;
  world.events.push({ type: 'takeoff', plane: plane.id });
}

/** Caught by a wire: pulled up short, then wheeled forward to its spot. */
function rollToSpot(plane: Plane) {
  if (plane.deckSpeed > 0) {
    plane.deckSpeed = Math.max(0, plane.deckSpeed - WIRE_BRAKING);
    plane.deckOffset += perTick(plane.deckSpeed);
    return;
  }
  const spot = parkingSpot(plane);
  const step = perTick(TAXI_SPEED);
  if (Math.abs(spot - plane.deckOffset) <= step) {
    plane.deckOffset = spot;
    plane.state = 'parked';
    return;
  }
  plane.deckOffset += spot > plane.deckOffset ? step : -step;
}

/**
 * Its own carrier's deck, if the plane is over it. Only a plane's own
 * carrier takes it aboard; any other ship's deck is just a hull to fly into.
 */
export function deckUnder(world: World, plane: Plane): Ship | null {
  const ship = carrierOf(world, plane);
  if (!ship || ship.state !== 'afloat') return null;
  const offset = offsetOnDeck(ship, plane.x);
  return offset >= -6 && offset <= deckLength(ship) ? ship : null;
}

/**
 * Whether the wheels or the tail have come down to the deck this tick. Only
 * a plane coming down onto it from above counts; anything else meets the
 * hull, in the collision pass.
 */
export function touchesDeck(plane: Plane, ship: Ship): boolean {
  const deck = deckHeight(ship);
  const points = planeContactPoints(plane.x, plane.y, plane.heading, plane.inverted);
  const lowest = Math.min(points.wheels.y, points.tail.y, points.nose.y);
  return lowest <= deck && plane.y >= deck - 1;
}

/**
 * The moment of truth on a carrier: what the deck makes of a plane that
 * has just touched it. Short of the deck, the stern takes the plane; in
 * the wire window, and slow and gentle enough, the hook catches a wire;
 * past the wires (or on a deck too damaged to recover), a bolter: full
 * throttle and off the bow again. Too hard, and the plane is damaged, or
 * goes over the side.
 */
export function landOnDeck(world: World, plane: Plane, ship: Ship) {
  const limits = landingLimits(world);
  const dir = ship.direction;
  const points = planeContactPoints(plane.x, plane.y, plane.heading, plane.inverted);
  const hook = offsetOnDeck(ship, points.tail.x);
  const closure = ((plane.vx - ship.vx) * dir) / perTick(1);
  const sinkRate = -(plane.vy - ship.heaveRate) / perTick(1);
  const facingBow = cosine(plane.heading) * dir > 0.5;
  const climb = sine(plane.heading);
  const upright = uprightness(plane.heading, plane.inverted) > 0.8;
  const aligned = plane.state === 'flying' && facingBow && upright && climb > -0.32 && climb < 0.4;
  // Wide open on touching down, the pilot means to go round: the hook is kept clear of the
  // wires, and a fast touch is no harm.
  const touchAndGo = plane.throttle >= MAX_THROTTLE;
  const tooFast = !touchAndGo && closure > limits.closure + 2;

  if (!aligned || hook < 0 || sinkRate > limits.wreck || tooFast) {
    // Into the round-down, or a crash on deck: over the side it goes.
    ditchPlane(world, plane);
    return;
  }
  if (sinkRate > limits.sink) {
    world.events.push({ type: 'hard-landing', plane: plane.id, ship: ship.id });
    woundPlane(world, plane, 'deck', null);
    if (plane.state !== 'flying') return;
  }
  // Down short of the first wire, the hook still picks it up as the plane rolls over it.
  const wires = wireWindow(world);
  const caught = deckOpen(ship) && hook <= wires.last && closure <= limits.closure && closure > -1;
  plane.deckOffset = offsetOnDeck(ship, plane.x);
  plane.deckSpeed = Math.max(0, closure);
  plane.sink = 0;
  plane.homing = false;
  if (touchAndGo) {
    plane.state = 'launching';
    world.events.push({ type: 'touch-and-go', plane: plane.id, ship: ship.id });
    if (plane.side === 0 && plane.pilot.kind === 'human') world.touchAndGoes += 1;
  } else if (caught) {
    const spacing = (wires.last - wires.first) / (WIRE_COUNT - 1);
    const wire = Math.min(WIRE_COUNT, Math.max(1, 1 + Math.round((hook - wires.first) / spacing)));
    plane.state = 'rolling';
    plane.throttle = 0;
    plane.wounded = false;
    world.events.push({ type: 'trap', plane: plane.id, ship: ship.id, wire });
    world.events.push({ type: 'landed', plane: plane.id, fuel: plane.fuel / MAX_FUEL });
  } else {
    plane.state = 'launching';
    world.events.push({ type: 'bolter', plane: plane.id, ship: ship.id });
  }
  holdOnDeck(plane, ship);
}
