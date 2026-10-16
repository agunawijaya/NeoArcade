import {
  BOMB_DRAG_MOVES,
  BOMB_INTERVAL_MOVES,
  TICKS_PER_MOVE,
  movesToTicks,
  perTick,
} from './constants';
import { applyDrag, explode } from './debris';
import { SHIP_CLASSES } from './fleet';
import { pilotUpHeading, uprightness } from './geometry';
import { damageShip, hullFacing, hullSpan, isAfloat, shipBoxes } from './ships';
import { HALF_TURN, cosine, sine } from './trig';
import { nextId, type Owner, type Plane, type Ship, type Torpedo, type World } from './world';

/** A torpedo runs this far under the surface; a hull drawing less than that lets it pass beneath. */
export const TORPEDO_DEPTH = 2.5;
/** Units a move once it is running, and how far it runs before it sinks. */
export const TORPEDO_SPEED = 2.6;
export const TORPEDO_RANGE = 560;
/**
 * A drop that runs true: no higher than this over the water, no faster
 * than this over the slowest flying speed, and near enough level (the sine
 * of the climb or dive).
 */
export const DROP_HEIGHT = 28;
export const DROP_SPEED_MARGIN = 2.5;
export const DROP_LEVEL = 0.26;
/** A hull showing less than this share of its length (turning) lets a torpedo slip by. */
const COMBED = 0.5;
/** Torpedo boats fire at an enemy hull ahead within this reach, then reload for so many moves. */
export const BOAT_REACH = 380;
const BOAT_RELOAD_MOVES = 150;

/** Torpedo boats go for the nearest enemy ship ahead of their bow that a torpedo can hit. */
export function torpedoBoatsAttack(world: World) {
  for (const boat of world.ships) {
    if (boat.kind !== 'torpedo-boat' || !isAfloat(boat) || boat.turn > 0) continue;
    boat.torpedoCooldown = Math.max(0, boat.torpedoCooldown - 1);
    if (boat.torpedoCooldown > 0) continue;
    const quarry = world.ships.some(
      (ship) =>
        ship.side !== boat.side &&
        isAfloat(ship) &&
        SHIP_CLASSES[ship.kind].draft > TORPEDO_DEPTH &&
        (ship.x - boat.x) * boat.direction > 0 &&
        Math.abs(ship.x - boat.x) < BOAT_REACH,
    );
    if (!quarry) continue;
    boat.torpedoCooldown = movesToTicks(BOAT_RELOAD_MOVES);
    fireTorpedoFromShip(world, boat);
  }
}

/** Whether a torpedo let go now would run true: low, level, slow and the right way up. */
export function dropRunsTrue(world: World, plane: Plane): boolean {
  const height = plane.y - world.terrain.heightAt(plane.x);
  return (
    height <= DROP_HEIGHT &&
    plane.speed <= world.tuning.minSpeed + DROP_SPEED_MARGIN &&
    Math.abs(sine(plane.heading)) <= DROP_LEVEL &&
    uprightness(plane.heading, plane.inverted) > 0.5
  );
}

/** Lets the torpedo go from under the belly, like a bomb, with the plane's own motion. */
export function dropTorpedo(world: World, plane: Plane, usesStores: boolean) {
  if (usesStores) {
    if (plane.torpedoes <= 0) return;
    plane.torpedoes -= 1;
  }
  plane.bombCooldown = movesToTicks(BOMB_INTERVAL_MOVES);
  const belly = pilotUpHeading(plane.heading, plane.inverted) + HALF_TURN;
  const x = plane.x + cosine(belly) * 4;
  const y = plane.y + sine(belly) * 4;
  world.torpedoes.push({
    id: nextId(world),
    owner: { side: plane.side, plane: plane.id },
    x,
    y,
    vx: plane.vx,
    vy: plane.vy,
    state: 'falling',
    direction: plane.vx >= 0 ? 1 : -1,
    run: TORPEDO_RANGE,
    armed: dropRunsTrue(world, plane),
    passed: [],
  });
  world.events.push({ type: 'torpedo-away', plane: plane.id, ship: null, x, y });
}

/** A torpedo boat's shot: straight into the water ahead of its bow, already running. */
export function fireTorpedoFromShip(world: World, ship: Ship) {
  const owner: Owner = { side: ship.side, plane: null };
  const x = ship.x + (ship.direction * SHIP_CLASSES[ship.kind].length) / 2;
  const y = ship.y - TORPEDO_DEPTH;
  world.torpedoes.push({
    id: nextId(world),
    owner,
    x,
    y,
    vx: perTick(TORPEDO_SPEED) * ship.direction,
    vy: 0,
    state: 'running',
    direction: ship.direction,
    run: TORPEDO_RANGE,
    armed: true,
    passed: [],
  });
  world.events.push({ type: 'torpedo-away', plane: null, ship: ship.id, x, y: ship.y });
}

/**
 * Falling torpedoes arc down like bombs; one that hits a deck goes off
 * there, one that hits land goes off on the beach, and one that hits the
 * water either runs or (dropped badly) breaks up. Running torpedoes go
 * straight along the line until they hit a ship, run aground or run out.
 */
export function moveTorpedoes(world: World) {
  world.torpedoes = world.torpedoes.filter((torpedo) =>
    torpedo.state === 'falling' ? fall(world, torpedo) : run(world, torpedo),
  );
}

function fall(world: World, torpedo: Torpedo): boolean {
  applyDrag(torpedo, BOMB_DRAG_MOVES);
  torpedo.vx += perTick(world.rules.wind) / (BOMB_DRAG_MOVES * TICKS_PER_MOVE);
  torpedo.x += torpedo.vx;
  torpedo.y += torpedo.vy;
  if (torpedo.x < 0 || torpedo.x >= world.map.width) return false;
  const deck = shipStruckFromAbove(world, torpedo);
  if (deck) {
    explode(world, torpedo.x, torpedo.y, torpedo.vx, torpedo.vy, 'large');
    damageShip(world, deck, 'bomb', torpedo.owner.side, torpedo.x, torpedo.y);
    return false;
  }
  const surface = world.terrain.heightAt(torpedo.x);
  if (torpedo.y > surface) return true;
  if (!world.terrain.isWater(torpedo.x)) {
    explode(world, torpedo.x, surface, 0, 0, 'small');
    return false;
  }
  world.events.push({ type: 'splash', x: torpedo.x, y: surface, size: 'small' });
  if (!torpedo.armed) {
    world.events.push({ type: 'torpedo-broke', x: torpedo.x, y: surface });
    return false;
  }
  torpedo.state = 'running';
  torpedo.y = surface - TORPEDO_DEPTH;
  torpedo.vx = perTick(TORPEDO_SPEED) * torpedo.direction;
  torpedo.vy = 0;
  world.events.push({ type: 'torpedo-running', torpedo: torpedo.id, x: torpedo.x, y: surface });
  return true;
}

function run(world: World, torpedo: Torpedo): boolean {
  const from = torpedo.x;
  torpedo.x += torpedo.vx;
  torpedo.run -= Math.abs(torpedo.vx);
  if (torpedo.run <= 0 || torpedo.x < 0 || torpedo.x >= world.map.width) return false;
  if (!world.terrain.isWater(torpedo.x)) {
    explode(world, torpedo.x, world.terrain.heightAt(torpedo.x), 0, 0, 'small');
    return false;
  }
  const ship = shipInTheWay(world, torpedo, from);
  if (!ship) return true;
  const sea = world.map.sea?.level ?? ship.y;
  world.events.push({ type: 'splash', x: torpedo.x, y: sea, size: 'large' });
  world.events.push({
    type: 'torpedo-hit',
    ship: ship.id,
    x: torpedo.x,
    y: sea,
    by: torpedo.owner.side,
    distance: TORPEDO_RANGE - torpedo.run,
  });
  damageShip(world, ship, 'torpedo', torpedo.owner.side, torpedo.x, sea);
  return false;
}

/**
 * The first enemy hull the torpedo's run crosses this tick: deep enough
 * not to pass underneath, and broadside enough not to have combed it.
 */
function shipInTheWay(world: World, torpedo: Torpedo, from: number): Ship | null {
  const left = Math.min(from, torpedo.x);
  const right = Math.max(from, torpedo.x);
  let first: Ship | null = null;
  for (const ship of world.ships) {
    if (!isAfloat(ship) || ship.side === torpedo.owner.side) continue;
    if (SHIP_CLASSES[ship.kind].draft <= TORPEDO_DEPTH) continue;
    if (torpedo.passed.includes(ship.id)) continue;
    const hull = hullSpan(ship);
    if (hull.right < left || hull.left > right) continue;
    // End-on as it turns, the hull lets the torpedo run past alongside it, for good.
    if (hullFacing(ship) < COMBED) {
      torpedo.passed.push(ship.id);
      continue;
    }
    const nearer =
      first === null || (ship.x - from) * torpedo.direction < (first.x - from) * torpedo.direction;
    if (nearer) first = ship;
  }
  return first;
}

/** A ship the falling torpedo has come down onto, before it ever reached the water. */
function shipStruckFromAbove(world: World, torpedo: Torpedo): Ship | null {
  for (const ship of world.ships) {
    if (!isAfloat(ship)) continue;
    const struck = shipBoxes(ship).some(
      (box) =>
        torpedo.x >= box.left &&
        torpedo.x <= box.right &&
        torpedo.y <= box.top &&
        torpedo.y > ship.y,
    );
    if (struck) return ship;
  }
  return null;
}
