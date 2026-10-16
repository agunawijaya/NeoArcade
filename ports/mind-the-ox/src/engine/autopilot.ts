import { BASE_MIN_SPEED, CEILING, MAX_THROTTLE, perTick } from './constants';
import { carrierOf, deckHeight, deckOpen, deckX, sternX, wireWindow } from './deck';
import { SHIP_CLASSES } from './fleet';
import { PLANE_HALF_LENGTH, WHEEL_DROP } from './geometry';
import { pitchToward, wantsToRollUpright } from './steering';
import { DOWN, UP, cosine, headingOf, sine } from './trig';
import { IDLE_CONTROLS, type Controls, type Plane, type Ship, type World } from './world';

/** Within this of the parking spot, 1984's autopilot simply put the plane down. */
export const SNAP_HOME = 16;
const CRUISE_CLEARANCE = 45;
const FINAL_APPROACH = 380;
/** The steepest glide the autopilot will fly on final, a little under ten degrees… */
const GLIDE_SLOPE = 0.17;
/** …unless it is well above it: then down at about twenty-five to meet it. */
const STEEP_DESCENT = 0.45;
/** Height enough to turn back round underneath, in a half loop. */
const TURN_UNDER_ROOM = 70;

/**
 * A carrier approach is flown as a circuit: downwind past the ship at this
 * height over the deck, out to this far astern, round onto its heading,
 * then down a glide path to the wires at about this speed over the deck.
 * A plane that misses, or comes in too high, flies on past the bow by
 * this much before it turns.
 */
const GATE_HEIGHT = 34;
const DOWNWIND_LEG = 520;
const PAST_THE_BOW = 120;
const DECK_GLIDE = 0.13;
const DECK_CLOSURE = 3;
/** Higher over the glide path than this share of the way still to go, a pilot cannot make the wires. */
const TOO_HIGH = 0.35;
/**
 * The downwind leg ends this far short of high ground astern, room to come
 * round over the top; never shorter than the second, the glide path's length.
 */
const TURN_ROOM = 220;
const SHORTEST_LEG = 300;
/** On the circuit's legs, stay this far over the ground ahead, and look this far for it. */
const LEG_CLEARANCE = 40;
const LEG_LOOKAHEAD = 160;

export function parkingHeight(world: World, plane: Plane): number {
  return world.terrain.heightAt(plane.base.x) + WHEEL_DROP;
}

/** Near enough the airfield to be set down on it, as 1984 did; a carrier has to be landed on. */
export function isNearHome(world: World, plane: Plane): boolean {
  if (plane.base.carrier !== undefined) return false;
  return (
    Math.abs(plane.x - plane.base.x) < SNAP_HOME &&
    Math.abs(plane.y - parkingHeight(world, plane)) < SNAP_HOME
  );
}

/**
 * Flies home: up to a safe height over the ground between here and the
 * airfield, round in a climbing turn if pointed the wrong way, then down a
 * gentle glide to the runway with the throttle closed, so it lands itself.
 * A carrier is flown to properly, down the glide path to its wires.
 */
export function autopilotControls(world: World, plane: Plane): Controls {
  const controls: Controls = { ...IDLE_CONTROLS };
  if (plane.state === 'stalled') {
    controls.pitch = pitchToward(plane, DOWN, 0);
    controls.throttle = 1;
    return controls;
  }
  const ship = carrierOf(world, plane);
  if (ship && ship.state === 'afloat') return carrierApproach(world, plane, ship, controls);
  const dx = plane.base.x - plane.x;
  const towards = dx >= 0 ? 1 : -1;
  const distance = Math.abs(dx);
  const runway = parkingHeight(world, plane);
  const flyingAway = cosine(plane.heading) * towards < -0.1;
  // Too high to come down in the room left before the airfield: fly out, away from it, to make room.
  const tooHigh = distance < (plane.y - runway) / STEEP_DESCENT;

  if (tooHigh) {
    if (flyingAway) {
      controls.pitch = pitchToward(plane, headingOf(-towards, 0), 12);
      if (wantsToRollUpright(plane)) controls.flip = true;
    } else turnBack(world, plane, controls);
    return controls;
  }
  if (flyingAway) {
    turnBack(world, plane, controls);
    return controls;
  }
  if (wantsToRollUpright(plane)) controls.flip = true;

  let aimY: number;
  if (distance > FINAL_APPROACH) {
    const ground = world.terrain.highestBetween(plane.x, plane.x + towards * 160);
    aimY = Math.min(CEILING - 30, Math.max(ground + CRUISE_CLEARANCE, runway + 60));
    controls.throttle = 1;
  } else {
    aimY = runway + Math.max(1, (distance - 30) * GLIDE_SLOPE);
    controls.throttle = plane.y > aimY - 6 ? -1 : 1;
  }
  // Well above the glide, it comes down more steeply to meet it, never in a dive.
  const descent = plane.y > aimY + 12 ? STEEP_DESCENT : GLIDE_SLOPE;
  const climb = Math.max(-descent * 30, Math.min(40, aimY - plane.y));
  const wanted = headingOf(towards * 30, climb);
  controls.pitch = pitchToward(plane, wanted, 12);
  // Never let the glide bring the nose below level once over the runway.
  if (distance < 40 && sine(plane.heading) < -0.2)
    controls.pitch = pitchToward(plane, headingOf(towards, 0), 0);
  return controls;
}

/**
 * Pointed the wrong way: round in a half loop, underneath when there is
 * height to spare (a climb near the ceiling would end in a stall), over
 * the top when the ground is close.
 */
function turnBack(world: World, plane: Plane, controls: Controls) {
  const ground = world.terrain.highestBetween(plane.x - 60, plane.x + 60);
  const under = plane.y - ground > TURN_UNDER_ROOM;
  controls.pitch = pitchToward(plane, under ? DOWN : UP);
  controls.throttle = under ? -1 : 1;
}

/**
 * Around the circuit to the carrier: downwind, against its heading, out to
 * the end of the downwind leg; round over the top onto its heading; then
 * down the glide path to the middle of the wires, throttle working to keep
 * a steady pace over the deck. Missed, too high, or with the deck fouled
 * or the ship turning: on past the bow and round again.
 */
function carrierApproach(world: World, plane: Plane, ship: Ship, controls: Controls): Controls {
  const dir = ship.direction;
  const wires = wireWindow(world);
  // Where the plane's middle should be when its hook reaches the middle of the wires.
  const touchdown = deckX(ship, (wires.first + wires.last) / 2 + PLANE_HALF_LENGTH);
  const deck = deckHeight(ship) + WHEEL_DROP;
  const astern = (touchdown - plane.x) * dir;
  const alongTheShip = cosine(plane.heading) * dir > 0.3;
  if (wantsToRollUpright(plane)) controls.flip = true;

  const circuit = deck + GATE_HEIGHT;
  if (!alongTheShip) {
    // Downwind, out to the end of the leg, then round onto the ship's heading.
    if (astern < downwindLeg(world, ship, circuit))
      return cruise(world, plane, dir === 1 ? -1 : 1, circuit, controls);
    return roundOnto(plane, dir, controls);
  }
  const pathY = Math.min(CEILING - 40, deck + Math.max(0, astern) * DECK_GLIDE);
  const tooHigh = plane.y - pathY > Math.max(10, astern * TOO_HIGH);
  if (astern < -4 || tooHigh || !deckOpen(ship)) {
    // On past the bow at circuit height, and round again.
    if (astern > -(SHIP_CLASSES[ship.kind].length + PAST_THE_BOW))
      return cruise(world, plane, dir, circuit, controls);
    return roundOnto(plane, dir === 1 ? -1 : 1, controls);
  }

  // The path is drawn on the moving ship: over the ground it is shallower, by the ship's share of the pace.
  const closure = ((plane.vx - ship.vx) * dir) / perTick(1);
  const groundSpeed = Math.max(1, Math.abs(plane.vx) / perTick(1));
  const slope = (DECK_GLIDE * Math.max(0.5, closure)) / groundSpeed;
  const offPath = pathY - plane.y;
  const vertical = -slope * 30 + Math.max(-6, Math.min(6, offPath));
  controls.pitch = pitchToward(plane, headingOf(dir * 30, vertical), 8);
  // Later rounds' planes fly faster, and come in as much faster. Never wide open on the
  // glide: a plane that touches down at full throttle is going round, not landing.
  const wanted = DECK_CLOSURE + world.tuning.minSpeed - BASE_MIN_SPEED;
  const roomToOpen = plane.throttle < MAX_THROTTLE - 1;
  controls.throttle = closure > wanted + 0.4 ? -1 : closure < wanted - 0.4 && roomToOpen ? 1 : 0;
  return controls;
}

/**
 * How far astern the downwind leg runs: its full length over open water,
 * shorter where a coast rises astern of the ship, so the turn at its end
 * is never into a cliff.
 */
function downwindLeg(world: World, ship: Ship, circuit: number): number {
  const stern = sternX(ship);
  for (let away = 0; away <= DOWNWIND_LEG + TURN_ROOM; away += 20) {
    const ground = world.terrain.heightAt(stern - ship.direction * away);
    if (ground > circuit - LEG_CLEARANCE) return Math.max(SHORTEST_LEG, away - TURN_ROOM);
  }
  return DOWNWIND_LEG;
}

/** Level (or easing to a height) the given way at a steady pace: a leg of the circuit, over any ground ahead. */
function cruise(
  world: World,
  plane: Plane,
  direction: 1 | -1,
  circuit: number,
  controls: Controls,
): Controls {
  const ahead = plane.x + direction * LEG_LOOKAHEAD;
  const ground = world.terrain.highestBetween(Math.min(plane.x, ahead), Math.max(plane.x, ahead));
  const height = Math.min(CEILING - 40, Math.max(circuit, ground + LEG_CLEARANCE));
  const climb = Math.max(-12, Math.min(30, height - plane.y));
  controls.pitch = pitchToward(plane, headingOf(direction * 30, climb), 12);
  controls.throttle = 1;
  return controls;
}

/** Round over the top onto a heading: up first, then on over onto it, never back the short way under. */
function roundOnto(plane: Plane, direction: 1 | -1, controls: Controls): Controls {
  const facing = cosine(plane.heading) * direction;
  controls.pitch =
    facing < -0.1 ? pitchToward(plane, UP) : pitchToward(plane, headingOf(direction * 30, 6), 8);
  controls.throttle = 1;
  return controls;
}
