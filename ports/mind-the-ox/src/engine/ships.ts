import { BULLET_LIFE_MOVES, TICKS_PER_MOVE, movesToTicks, perTick } from './constants';
import { explode } from './debris';
import { SHIP_CLASSES, type ShipKind } from './fleet';
import { weightedRangeSquared, type Box } from './geometry';
import type { Side } from './map';
import type { Rules } from './rules';
import { scoreShipLost } from './scoring';
import { isLit, isSpotted } from './sight';
import { HALF_TURN, TURN, cosine, sine } from './trig';
import { nextId, type Plane, type Ship, type World } from './world';

/** A ship takes this long to come round, moves; it slows to half speed through the turn. */
export const TURN_MOVES = 60;
const TURN_SPEED = 0.5;
/** Speed changes by this much a tick, units a move: ships answer slowly. */
const SPEED_CHANGE = 0.004;
/** From the first list to the last bubbles, moves. */
const SINKING_MOVES = 120;
/** A sinking ship goes down this far below where it floated. */
const SINKING_DEPTH = 24;
/** A wounded ship settles by this share of its freeboard as it nears its end, catching up over this many moves… */
const SETTLE_SHARE = 0.3;
const FLOOD_MOVES = 60;
/** …and loses up to this share of its speed. */
const FLOODED_SLOWDOWN = 0.5;
/** The heavy blows remembered on each ship, for the views to show. */
const WOUND_LIMIT = 8;
/** The swell's height for each sea state, units, and how long a swell takes to pass, ticks. */
const SWELL = [0, 1.3, 2.6] as const;
const SWELL_PERIOD = 330;
/** Small hulls ride the swell harder than big ones. */
const SMALL_HULL = 60;
/** A destroyer this close fishes a pilot out of the water. */
export const RESCUE_RANGE = 130;
/** Ships see a torpedo coming from this far and, if they are nimble enough, turn to comb its track… */
const TORPEDO_LOOKOUT = 260;
/** …starting the turn when it is this many moves off: it then arrives as the hull swings end-on. */
const COMB_LEAD_MOVES = TURN_MOVES / 2;
/** Ships' gunners lead like the shore gunners and scatter like softened flak. */
const LEAD_MOVES = 4;
const SCATTER = 18;
const SCATTER_PER_UNIT = 0.14;
/** A shell's fuze runs a few ticks past the aiming point. */
const FUZE_SLACK = 4;
/** How far below level a ship's guns can be laid, as a slope: about five degrees. */
const GUN_DEPRESSION = 0.09;

/** The fleet as the round begins, every ship at its station and steaming. */
export function launchFleet(world: World) {
  world.map.fleet.forEach((site, index) => {
    const kind = SHIP_CLASSES[site.kind];
    const cruise = site.speed ?? kind.speed;
    world.ships.push({
      id: nextId(world),
      index,
      kind: site.kind,
      side: site.side,
      x: site.x,
      y: seaLevel(world),
      direction: site.direction,
      cruise,
      speed: cruise,
      vx: perTick(cruise) * site.direction,
      turn: 0,
      patrol: site.patrol ? { ...site.patrol } : null,
      bound: site.bound ?? null,
      escaped: false,
      protect: site.protect ?? false,
      convoy: site.convoy ?? false,
      hitPoints: kind.hitPoints,
      maxHitPoints: kind.hitPoints,
      wounds: [],
      flooded: 0,
      state: 'afloat',
      sinking: 0,
      heave: 0,
      heaveRate: 0,
      gunCooldown: world.rng.int(0, movesToTicks(kind.guns?.everyMoves ?? 1)),
      torpedoCooldown: movesToTicks(40),
      lastHitBy: null,
    });
  });
}

export function seaLevel(world: World): number {
  return world.map.sea?.level ?? 0;
}

export function shipById(world: World, id: number): Ship | undefined {
  return world.ships.find((ship) => ship.id === id);
}

export function shipAtIndex(world: World, index: number): Ship | undefined {
  return world.ships.find((ship) => ship.index === index);
}

/** The hull from end to end, at this moment. */
export function hullSpan(ship: Ship): { left: number; right: number } {
  const half = (SHIP_CLASSES[ship.kind].length / 2) * hullFacing(ship);
  return { left: ship.x - half, right: ship.x + half };
}

/**
 * How much of its length a ship shows along the line of play: all of it
 * steaming straight, almost none bow-on halfway through a turn, when a
 * torpedo running along the line can slip past.
 */
export function hullFacing(ship: Ship): number {
  return Math.max(0.12, Math.abs(cosine(ship.turn * HALF_TURN)));
}

export function isAfloat(ship: Ship): boolean {
  return ship.state === 'afloat';
}

/** The bridge, funnels and turrets stand over the middle of the hull, this share of its length. */
const SUPERSTRUCTURE_SHARE = 0.45;
/** A carrier's hull stops just under its deck, so what rolls on the deck never touches it. */
const DECK_CLEARANCE = 1.5;

/**
 * What of a ship can be hit, as boxes: the hull from the keel to the deck,
 * and over the middle of it the superstructure. A carrier is all flat deck.
 */
export function shipBoxes(ship: Ship): Box[] {
  const kind = SHIP_CLASSES[ship.kind];
  const hull = hullSpan(ship);
  const deck = ship.y + kind.freeboard - (ship.kind === 'carrier' ? DECK_CLEARANCE : 0);
  const boxes: Box[] = [
    { left: hull.left, right: hull.right, bottom: ship.y - kind.draft, top: deck },
  ];
  if (kind.superstructure > kind.freeboard) {
    const half = ((hull.right - hull.left) * SUPERSTRUCTURE_SHARE) / 2;
    boxes.push({
      left: ship.x - half,
      right: ship.x + half,
      bottom: deck,
      top: ship.y + kind.superstructure,
    });
  }
  return boxes;
}

/**
 * Steams every ship on a tick: up to speed, along its patrol or towards
 * where it is bound, round at the ends, up and down on the swell; a ship
 * going down settles and lists until it is gone.
 */
export function moveShips(world: World) {
  for (const ship of world.ships) {
    if (ship.state === 'sunk' || ship.escaped) continue;
    if (ship.state === 'afloat') flood(ship);
    ride(world, ship);
    if (ship.state === 'sinking') {
      settle(world, ship);
      continue;
    }
    steam(world, ship);
  }
}

function steam(world: World, ship: Ship) {
  if (ship.turn === 0 && shouldTurn(world, ship)) {
    ship.turn = 1 / movesToTicks(TURN_MOVES);
    world.events.push({ type: 'ship-turn', ship: ship.id });
  }
  const cruise = ship.cruise * (1 - FLOODED_SLOWDOWN * ship.flooded);
  const wanted = ship.turn > 0 ? cruise * TURN_SPEED : cruise;
  ship.speed += Math.max(-SPEED_CHANGE, Math.min(SPEED_CHANGE, wanted - ship.speed));
  if (ship.turn > 0) {
    const before = ship.turn;
    ship.turn += 1 / movesToTicks(TURN_MOVES);
    // Halfway round the bow points the other way.
    if (before < 0.5 && ship.turn >= 0.5) ship.direction = ship.direction === 1 ? -1 : 1;
    if (ship.turn >= 1) ship.turn = 0;
  }
  // Through a turn the ship swings out of the line of play and back: its way along it falls away and returns.
  const along = ship.turn === 0 ? 1 : Math.abs(cosine(ship.turn * HALF_TURN));
  ship.vx = perTick(ship.speed) * along * ship.direction;
  ship.x += ship.vx;
  if (ship.bound !== null && (ship.bound - ship.x) * ship.direction <= 0) {
    ship.escaped = true;
    world.events.push({ type: 'ship-escaped', ship: ship.id, x: ship.x });
  }
}

/** At the end of its patrol, before it runs out of sea, or to comb a torpedo's track. */
function shouldTurn(world: World, ship: Ship): boolean {
  const kind = SHIP_CLASSES[ship.kind];
  // How far the ship still travels while it comes round.
  const turning = (perTick(ship.cruise * TURN_SPEED) * movesToTicks(TURN_MOVES)) / Math.PI;
  const ahead = ship.x + ship.direction * (kind.length / 2 + turning);
  if (ship.patrol) {
    if (ship.direction === 1 && ship.x >= ship.patrol.right) return true;
    if (ship.direction === -1 && ship.x <= ship.patrol.left) return true;
  } else if (ship.bound === null && !world.terrain.isWater(ahead)) return true;
  return combsTorpedo(world, ship);
}

/**
 * Destroyers, cruisers and torpedo boats see a torpedo coming and put the
 * helm over so that it arrives as they swing end-on to it and slips past:
 * the turn starts when the torpedo is as many moves away as the bow takes
 * to come round halfway.
 */
function combsTorpedo(world: World, ship: Ship): boolean {
  if (!canComb(ship.kind)) return false;
  return world.torpedoes.some((torpedo) => {
    if (torpedo.state !== 'running' || torpedo.owner.side === ship.side) return false;
    const ahead = (ship.x - torpedo.x) * torpedo.direction;
    if (ahead <= 0 || ahead > TORPEDO_LOOKOUT) return false;
    const closing = Math.abs(torpedo.vx) - ship.vx * torpedo.direction;
    if (closing <= 0) return false;
    const arrives = ahead / closing / TICKS_PER_MOVE;
    return arrives <= COMB_LEAD_MOVES;
  });
}

/** Destroyers, cruisers and torpedo boats are nimble enough to turn end-on to a torpedo. */
export function canComb(kind: ShipKind): boolean {
  return kind === 'destroyer' || kind === 'cruiser' || kind === 'torpedo-boat';
}

/** Up and down on the swell; a carrier's deck holds steady with the landing assist on. */
function ride(world: World, ship: Ship) {
  const steady = ship.kind === 'carrier' && world.rules.landingAssist;
  const height = steady ? 0 : SWELL[world.rules.seaState] * swellShare(ship);
  const phase = ((world.tick % SWELL_PERIOD) / SWELL_PERIOD) * TURN + ship.index * 911;
  const heave = height * sine(phase);
  ship.heaveRate = heave - ship.heave;
  ship.heave = heave;
  const settled = ship.flooded * SHIP_CLASSES[ship.kind].freeboard * SETTLE_SHARE;
  ship.y = seaLevel(world) + heave - settled - ship.sinking * SINKING_DEPTH;
}

/** Water comes in through the wounds: the ship settles towards how badly it is hurt. */
function flood(ship: Ship) {
  const hurt = 1 - ship.hitPoints / ship.maxHitPoints;
  ship.flooded = Math.min(hurt, ship.flooded + 1 / movesToTicks(FLOOD_MOVES));
}

/** How fast a carrier's deck rises and falls at most in a sea, units a move; 0 with the assist holding it steady. */
export function deckHeaveRate(seaState: Rules['seaState'], landingAssist: boolean): number {
  if (landingAssist) return 0;
  return ((SWELL[seaState] * 2 * Math.PI) / SWELL_PERIOD) * TICKS_PER_MOVE;
}

function swellShare(ship: Ship): number {
  return SHIP_CLASSES[ship.kind].length < SMALL_HULL ? 1.5 : 1;
}

function settle(world: World, ship: Ship) {
  ship.speed = Math.max(0, ship.speed - SPEED_CHANGE * 2);
  ship.vx = perTick(ship.speed) * ship.direction;
  ship.x += ship.vx;
  ship.sinking += 1 / movesToTicks(SINKING_MOVES);
  if (ship.sinking >= 1) {
    ship.sinking = 1;
    ship.state = 'sunk';
    world.events.push({ type: 'ship-sunk', ship: ship.id });
  }
}

export type ShipHitCause = 'shot' | 'bomb' | 'torpedo' | 'plane' | 'raid';

/**
 * Damage the hull takes from each kind of blow. One torpedo sinks anything
 * up to a cruiser and a battleship or carrier takes two; five bombs on
 * target sink a battleship.
 */
export const SHIP_DAMAGE: Readonly<Record<ShipHitCause, number>> = {
  shot: 1,
  bomb: 20,
  torpedo: 50,
  plane: 15,
  raid: 12,
};

/** Takes a blow; out of hit points, the ship starts to go down and the other side is paid. */
export function damageShip(
  world: World,
  ship: Ship,
  cause: ShipHitCause,
  culprit: Side | null,
  x: number,
  y: number,
) {
  if (ship.state !== 'afloat') return;
  ship.hitPoints = Math.max(0, ship.hitPoints - SHIP_DAMAGE[cause]);
  if (culprit !== null) ship.lastHitBy = culprit;
  if (cause !== 'shot' && ship.wounds.length < WOUND_LIMIT) wound(world, ship, cause, x, y);
  world.events.push({ type: 'ship-hit', ship: ship.id, x, y, cause, by: culprit });
  if (ship.hitPoints > 0) return;
  ship.state = 'sinking';
  ship.turn = 0;
  explode(world, ship.x, ship.y + SHIP_CLASSES[ship.kind].freeboard, 0, 0, 'huge');
  world.events.push({
    type: 'ship-sinking',
    ship: ship.id,
    kind: ship.kind,
    side: ship.side,
    by: ship.lastHitBy,
    x: ship.x,
  });
  scoreShipLost(world, ship.side, ship.kind, ship.lastHitBy);
}

/** Where on the hull a blow landed, in the hull's own frame, so the mark turns with the ship. */
function wound(world: World, ship: Ship, cause: ShipHitCause, x: number, y: number) {
  const kind = SHIP_CLASSES[ship.kind];
  const half = kind.length / 2;
  const along = ((x - ship.x) * ship.direction) / hullFacing(ship);
  ship.wounds.push({
    along: Math.max(-half, Math.min(half, along)),
    height: Math.max(-kind.draft, Math.min(kind.superstructure, y - ship.y)),
    cause,
    tick: world.tick,
  });
}

/** A friendly destroyer close enough to pick a pilot out of the water, if there is one. */
export function rescuerNear(world: World, side: Side, x: number): Ship | null {
  let best: Ship | null = null;
  for (const ship of world.ships) {
    if (ship.side !== side || ship.kind !== 'destroyer' || !isAfloat(ship)) continue;
    const distance = Math.abs(ship.x - x);
    if (distance <= RESCUE_RANGE && (!best || distance < Math.abs(best.x - x))) best = ship;
  }
  return best;
}

/**
 * Every ship with guns fires at the nearest enemy plane it can see within
 * reach, as often as its class allows: aimed ahead of the plane like the
 * shore gunners, and scattered like softened flak.
 */
export function shipsFireBack(world: World) {
  for (const ship of world.ships) {
    if (!isAfloat(ship)) continue;
    const guns = SHIP_CLASSES[ship.kind].guns;
    if (!guns) continue;
    ship.gunCooldown = Math.max(0, ship.gunCooldown - 1);
    if (ship.gunCooldown > 0) continue;
    const muzzleY = ship.y + SHIP_CLASSES[ship.kind].superstructure;
    const gunnery = world.rules.shipGunnery;
    const quarry = nearestEnemyPlane(world, ship, muzzleY, guns.range * gunnery);
    if (!quarry) continue;
    ship.gunCooldown = movesToTicks(Math.max(1, Math.round(guns.everyMoves / gunnery)));
    fireAt(world, ship, muzzleY, quarry);
  }
}

function nearestEnemyPlane(world: World, ship: Ship, muzzleY: number, range: number): Plane | null {
  let best: Plane | null = null;
  let bestRange = Number.POSITIVE_INFINITY;
  for (const plane of world.planes) {
    if (plane.side === ship.side || plane.ghost) continue;
    if (plane.state !== 'flying' && plane.state !== 'stalled') continue;
    if (!isSpotted(world, plane, ship.x, muzzleY)) continue;
    // The guns cannot be laid far below level: a plane low over the water and a way off is under them.
    if (muzzleY - plane.y > Math.abs(plane.x - ship.x) * GUN_DEPRESSION) continue;
    const reach = world.rules.searchlights && isLit(world, plane.x, plane.y) ? range * 1.2 : range;
    const distance = weightedRangeSquared(plane.x - ship.x, plane.y - muzzleY);
    if (distance < reach * reach && distance < bestRange) {
      best = plane;
      bestRange = distance;
    }
  }
  return best;
}

function fireAt(world: World, ship: Ship, muzzleY: number, quarry: Plane) {
  const lead = movesToTicks(LEAD_MOVES);
  let aimX = quarry.x + quarry.vx * lead - ship.x;
  let aimY = quarry.y + quarry.vy * lead - muzzleY;
  const reach = Math.sqrt(aimX * aimX + aimY * aimY);
  const scatter = SCATTER + reach * SCATTER_PER_UNIT;
  aimX += world.rng.float(-scatter, scatter);
  aimY += world.rng.float(-scatter, scatter);
  const distance = Math.sqrt(aimX * aimX + aimY * aimY);
  if (distance < 1) return;
  const speed = perTick(world.tuning.bulletSpeed);
  world.shots.push({
    id: nextId(world),
    owner: { side: ship.side, plane: null },
    x: ship.x,
    y: muzzleY,
    vx: (aimX / distance) * speed,
    vy: (aimY / distance) * speed,
    // Time-fuzed: the shell bursts where the gunners reckoned the plane would be.
    life: Math.min(movesToTicks(BULLET_LIFE_MOVES), Math.ceil(distance / speed) + FUZE_SLACK),
    shell: true,
  });
  world.events.push({ type: 'ship-gun', ship: ship.id, x: ship.x, y: muzzleY });
}
