import { CEILING, MAX_BOMBS, MAX_FUEL, MAX_TORPEDOES, TICKS_PER_MOVE, perTick } from './constants';
import { isAirborne } from './damage';
import { applyDrag } from './debris';
import { BOMB_DRAG_MOVES } from './constants';
import { cpuControls } from './cpu';
import { carrierOf, deckHeight, deckLength, deckOpen, deckX, homeX, sternX } from './deck';
import { SHIP_CLASSES } from './fleet';
import { WHEEL_DROP } from './geometry';
import { EDGE_WIDTH } from './map';
import { RAIDER_CLASSES } from './raiders';
import { canComb, hullFacing } from './ships';
import { dropRunsTrue } from './torpedo';
import { pitchToward, wantsToRollUpright } from './steering';
import { DOWN, HALF_TURN, QUARTER_TURN, UP, cosine, headingDelta, headingOf, sine } from './trig';
import {
  IDLE_CONTROLS,
  type Controls,
  type CpuLevel,
  type Plane,
  type Raider,
  type Ship,
  type World,
} from './world';

/**
 * A scripted pilot for the player's seat: it takes off, flies out to the
 * nearest enemy target, comes in level and drops its bombs where they will
 * land, shoots at what crosses its nose, and goes home to rearm when the
 * racks or the tank run low. At sea it also bombs ships (or comes in low
 * and slow to torpedo them), goes after raiders, flies the gates in order
 * and, with nothing left to do, flies home and lands. The playtests fly
 * whole games with it, and the tuning scripts measure the computer pilots
 * against it; `?pilot=bot` puts it in the player's seat on the page. It
 * only ever asks for controls, like a person.
 */
export interface BotMemory {
  /** The target it is going for, by id. */
  target: number | null;
  /** Steers clear of oxen: true keeps bombs away from them. */
  careful: boolean;
  /** Which computer pilot it fights like. */
  fights: CpuLevel;
  /** At sea: how long the fight has gone on, and until when it is broken off, ticks. */
  fightingFor: number;
  breakOffUntil: number;
}

/** Cruising this high over the ground; bombing runs come in lower. */
const CRUISE = 62;
const RUN_HEIGHT = 38;
/** An enemy plane this close is fought rather than ignored. */
const FIGHT_RANGE = 170;
/** Turn back for home with this much of the tank left; below the second, run for it whatever happens. */
const FUEL_RESERVE = 0.32;
const FUEL_EMPTY = 0.12;
/** A carrier's circuit and approach, and a fight on the way, in fuel. */
const CIRCUIT_FUEL = 1800;
/** A fight at sea is broken off after this long, ticks, for this long. */
const LONGEST_FIGHT = 12 * 60;
const BREAK_OFF = 8 * 60;
/** In a fight, another plane's path is looked at this many ticks ahead, and kept this far off. */
const COLLISION_LOOKAHEAD = [5, 10, 15, 20, 25, 30, 35, 40, 50] as const;
const COLLISION_CLEARANCE = 28;
/** A bomb that would land this close to an ox is not dropped. */
const OX_CLEARANCE = 24;
/** A torpedo is let go this far out from its ship, and this high over the water. */
const TORPEDO_DROP = { near: 130, far: 360 };
const TORPEDO_HEIGHT = 16;
/** Down to the water this far out, fast; throttled back to drop only this far short of the drop. */
const TORPEDO_LOW = 400;
const TORPEDO_SLOWING = 120;
/** Waiting for a raid: back and forth this far either side of home, this high over the sea. */
const LOITER_REACH = 260;
const LOITER_HEIGHT = 80;
/** Going over the top to turn round wants this much more than flying speed; below this height, climb anyway. */
const LOOP_SPEED = 3;
const LOOP_ROOM = 70;
/** For a touch-and-go, the throttle goes wide open this far astern of the deck: long enough to reach full. */
const TOUCH_AND_GO_REACH = 45;
/**
 * A raider is fired on from just outside its gunners' reach (our guns
 * reach further), and passed over if the gap closes to well inside it.
 */
const STAND_OFF_MARGIN = 12;
const PASS_OVER_INSIDE = 30;
const GUNS_REACH = 120;
/** A raider going home is let go once it is this close to the coast it leaves by. */
const COAST_MARGIN = 250;
/** A torpedo boat this close to one of our ships is gone after before anything else. */
const BOAT_THREAT = 750;
/** Strafing a boat: in at this height over the water, pulling up this far short of it. */
const STRAFE_HEIGHT = 12;
const STRAFE_BREAK = 45;
/** Birds and flocks are looked for this many ticks ahead, and passed this far above or below. */
const BIRD_LOOKAHEAD = [10, 20, 30, 45, 60] as const;
const BIRD_REACH = { flock: 30, bird: 14 };
const BIRD_DODGE = 36;

/** Something to bomb: a target ashore or a ship's deck, as the box a bomb must fall into. */
interface Aim {
  id: number;
  x: number;
  /** The bottom of the box, and its size. */
  y: number;
  width: number;
  height: number;
  /** How far it moves a tick: a ship steaming on while the bomb falls. */
  vx: number;
  ship: boolean;
  /** A ship that does not turn away from a torpedo: worth carrying one for. */
  steady: boolean;
}

export function createBotMemory(fights: CpuLevel = 'hard', careful = true): BotMemory {
  return { target: null, careful, fights, fightingFor: 0, breakOffUntil: 0 };
}

export function botControls(world: World, plane: Plane, memory: BotMemory): Controls {
  const controls = flyBot(world, plane, memory);
  if (world.map.sea && plane.state === 'flying') steerClearOfCollision(world, plane, controls);
  return controls;
}

function flyBot(world: World, plane: Plane, memory: BotMemory): Controls {
  const controls: Controls = { ...IDLE_CONTROLS };
  if (plane.state === 'parked') {
    // Nothing left that a torpedo will catch: bombs instead. Then wait for the crew, and go.
    if (plane.loadout === 'torpedo' && !torpedoWorthy(aimsFor(world, plane)))
      controls.loadout = 'bombs';
    const ready = storesFull(plane) && plane.fuel >= MAX_FUEL * 0.98;
    if (ready || !world.rules.expert) controls.throttle = 1;
    return controls;
  }
  if (plane.state === 'rolling') return controls;
  // Down a carrier's deck at full throttle, as a person holds the key down.
  if (plane.state === 'launching') {
    controls.throttle = 1;
    return controls;
  }
  if (plane.state === 'stalled') {
    controls.pitch = pitchToward(plane, DOWN, 0);
    controls.throttle = 1;
    return controls;
  }
  if (!isAirborne(plane)) return controls;

  const low = world.rules.expert && plane.fuel < fuelReserve(world, plane);
  const dry = world.rules.expert && plane.fuel < fuelToGetHome(world, plane);
  const aims = aimsFor(world, plane);
  const anyTargets =
    aims.length > 0 || world.map.gates.length > world.gatesPassed || world.raiders.length > 0;
  if (world.map.sea && !anyTargets && !enemyNear(world, plane)) return idleAtSea(world, plane);
  // Somebody close, or nothing left to bomb: fight the way the computer's own pilots do,
  // even on the way home, unless the tank is all but dry. At sea a wounded plane goes
  // home instead, and a fight that goes round and round is broken off for a while.
  const errand = aims.length > 0 || world.map.gates.length > world.gatesPassed;
  const fightOn = world.map.sea ? keepFighting(world, plane, memory, errand) : true;
  if (!dry && fightOn && (enemyNear(world, plane) || (!anyTargets && !low))) {
    plane.homing = false;
    return cpuControls(world, plane, memory.fights);
  }

  // A torpedo and nothing left it can sink: home for bombs.
  const wrongStores =
    plane.loadout === 'torpedo' && aims.length > 0 && !aims.some((aim) => aim.ship);
  const needsHome =
    world.rules.expert && (storesEmpty(plane) || low || plane.wounded || wrongStores);
  if (needsHome) {
    controls.home = !plane.homing;
    shootIfLinedUp(world, plane, controls);
    return controls;
  }

  // At sea: a torpedo boat closing on one of ours first, then raiders, then the next gate,
  // before anything on the ground or the water.
  const boat = threateningBoat(world, plane);
  if (boat) {
    if (plane.loadout === 'torpedo' || plane.bombs === 0)
      return strafe(world, plane, boat, controls);
    memory.target = boat.id;
  } else {
    const raider = nearestRaider(world, plane);
    if (raider) return chaseRaider(world, plane, raider, controls);
  }
  const gate = world.map.gates[world.gatesPassed];
  if (gate) {
    plane.homing = false;
    steerTo(world, plane, gate.x, (gate.bottom + gate.top) / 2, controls);
    holdSpeed(world, plane, controls);
    shootIfLinedUp(world, plane, controls);
    return controls;
  }

  const target = chooseTarget(
    plane.loadout === 'torpedo' && torpedoWorthy(aims) ? aims.filter((aim) => aim.steady) : aims,
    plane,
    memory,
  );
  const ground = world.terrain.heightAt(plane.x);
  let aimX: number;
  let aimY: number;
  if (!target) {
    // Nothing left to do at sea: fly home and land aboard.
    if (world.map.sea) {
      controls.home = !plane.homing;
      shootIfLinedUp(world, plane, controls);
      return controls;
    }
    aimX = plane.base.x;
    aimY = ground + CRUISE;
  } else if (target.ship && plane.loadout === 'torpedo') {
    return torpedoRun(world, plane, target, controls);
  } else {
    const dx = target.x - plane.x;
    const towards = dx >= 0 ? 1 : -1;
    const distance = Math.abs(dx);
    const over = highestBetween(world, plane.x, plane.x + towards * 140);
    // Out of reach of the target guns where they fire back, low enough to aim where they do not.
    const guns = gunReach(world);
    const height = Math.max(
      over + 30,
      target.y + (guns > 0 ? guns / 1.5 + 14 : distance > 260 ? CRUISE : RUN_HEIGHT),
    );
    aimX = plane.x + towards * 60;
    aimY = Math.min(CEILING - 24, height);
    if (distance < 420 && flyingTowards(plane, dx) && wouldHit(world, plane, target, memory))
      controls.bomb = true;
  }
  steerTo(world, plane, aimX, aimY, controls);
  holdSpeed(world, plane, controls);
  shootIfLinedUp(world, plane, controls);
  return controls;
}

/**
 * Nothing left to bomb or fly through at sea: a raid still to come is
 * waited for over home, with the tank to do it; otherwise home to land
 * aboard. Enemy fighters that come close are fought on the way (above);
 * they keep coming back, so they are never waited for.
 */
function idleAtSea(world: World, plane: Plane): Controls {
  const controls: Controls = { ...IDLE_CONTROLS };
  const raidsToCome = world.map.raids.some((raid) => raid.at * TICKS_PER_MOVE > world.tick);
  const fuelToWait = !world.rules.expert || plane.fuel > fuelReserve(world, plane);
  if (raidsToCome && fuelToWait && !plane.wounded) {
    // A long racetrack over home, low enough that turning at its ends never stalls.
    plane.homing = false;
    const sea = world.map.sea?.level ?? 0;
    const home = homeX(world, plane);
    const heading = plane.vx >= 0 ? 1 : -1;
    const end =
      plane.x > home + LOITER_REACH
        ? home - LOITER_REACH
        : plane.x < home - LOITER_REACH
          ? home + LOITER_REACH
          : home + heading * LOITER_REACH;
    steerTo(world, plane, end, sea + LOITER_HEIGHT, controls);
    holdSpeed(world, plane, controls);
    shootIfLinedUp(world, plane, controls);
    return controls;
  }
  if (touchAndGo(world, plane, controls)) return controls;
  controls.home = !plane.homing;
  return controls;
}

/**
 * A deck trial asks for a touch-and-go once the gates are flown: the
 * autopilot brings the plane down the glide path, and on the last stretch
 * the script takes over and opens the throttle wide for the touch.
 */
function touchAndGo(world: World, plane: Plane, controls: Controls): boolean {
  const { gates } = world.map;
  if (world.touchAndGoes > 0 || gates.length === 0 || world.gatesPassed < gates.length)
    return false;
  const ship = carrierOf(world, plane);
  if (!ship || !deckOpen(ship)) return false;
  const astern = (sternX(ship) - plane.x) * ship.direction;
  const overDeck = plane.y - deckHeight(ship);
  const onFinal = cosine(plane.heading) * ship.direction > 0.8;
  const pastTheBow = astern < -deckLength(ship) * 0.8;
  if (!onFinal || astern > TOUCH_AND_GO_REACH || pastTheBow || overDeck > 16 || overDeck < -2)
    return false;
  plane.homing = false;
  // Aimed a little below the wheels' height, a third of the way up the deck: firmly down, then away.
  steerTo(
    world,
    plane,
    deckX(ship, deckLength(ship) / 3),
    deckHeight(ship) + WHEEL_DROP * 0.5,
    controls,
  );
  controls.throttle = 1;
  return true;
}

/**
 * Turn for home with this much left: a share of the tank, or at sea, where
 * home can be a long way off and a carrier's circuit is long, enough to get
 * there and round it with some over.
 */
function fuelReserve(world: World, plane: Plane): number {
  const share = MAX_FUEL * FUEL_RESERVE;
  if (!world.map.sea) return share;
  return Math.max(share, Math.abs(homeX(world, plane) - plane.x) * 1.4 + CIRCUIT_FUEL);
}

/**
 * Whether to stay in a fight at sea: not wounded, and, with somewhere to
 * be (targets, gates), not stuck in one that has gone on too long.
 */
function keepFighting(world: World, plane: Plane, memory: BotMemory, errand: boolean): boolean {
  if (plane.wounded) return false;
  if (world.tick < memory.breakOffUntil) return false;
  if (!errand || !enemyNear(world, plane)) {
    memory.fightingFor = 0;
    return true;
  }
  memory.fightingFor += 1;
  if (memory.fightingFor < LONGEST_FIGHT) return true;
  memory.fightingFor = 0;
  memory.breakOffUntil = world.tick + BREAK_OFF;
  return false;
}

/** Below this, home at once whatever is going on: a share of the tank, or at sea just enough to get there. */
function fuelToGetHome(world: World, plane: Plane): number {
  const share = MAX_FUEL * FUEL_EMPTY;
  if (!world.map.sea) return share;
  return Math.max(share, Math.abs(homeX(world, plane) - plane.x) * 1.15 + CIRCUIT_FUEL / 2);
}

/**
 * In a fight, two planes turning hard at each other can meet: if an enemy
 * flying on as it is would come this close in the next moments, pull up
 * over it or push down under it, whichever it is not doing.
 */
function steerClearOfCollision(world: World, plane: Plane, controls: Controls) {
  for (const other of world.planes) {
    if (other.side === plane.side || other.ghost || !isAirborne(other)) continue;
    for (const ticks of COLLISION_LOOKAHEAD) {
      const dx = other.x + other.vx * ticks - (plane.x + plane.vx * ticks);
      const dy = other.y + other.vy * ticks - (plane.y + plane.vy * ticks);
      if (dx * dx + dy * dy > COLLISION_CLEARANCE * COLLISION_CLEARANCE) continue;
      const ground = world.terrain.heightAt(plane.x);
      const under = dy > 0 && plane.y - ground > 40;
      controls.pitch = pitchToward(plane, under ? DOWN : UP, 0);
      controls.fire = false;
      return;
    }
  }
}

/** Keep a little more than flying speed, more in a climb. */
function holdSpeed(world: World, plane: Plane, controls: Controls) {
  const wanted = world.tuning.minSpeed + 2;
  controls.throttle =
    plane.speed < wanted || sine(plane.heading) > 0.25 ? 1 : plane.speed > wanted + 1 ? -1 : 0;
}

function storesFull(plane: Plane): boolean {
  return plane.loadout === 'torpedo'
    ? plane.torpedoes === MAX_TORPEDOES
    : plane.bombs === MAX_BOMBS;
}

function storesEmpty(plane: Plane): boolean {
  return plane.loadout === 'torpedo' ? plane.torpedoes === 0 : plane.bombs === 0;
}

/** Everything of the enemy's there is to bomb: targets ashore, then ships afloat. */
function aimsFor(world: World, plane: Plane): Aim[] {
  const aims: Aim[] = world.targets
    .filter((target) => target.standing && target.side !== plane.side)
    .map((target) => ({ ...target, vx: 0, ship: false, steady: false }));
  for (const ship of world.ships) {
    if (ship.side === plane.side || ship.state !== 'afloat' || ship.escaped) continue;
    const kind = SHIP_CLASSES[ship.kind];
    aims.push({
      id: ship.id,
      x: ship.x,
      y: ship.y,
      width: kind.length * hullFacing(ship),
      height: kind.freeboard,
      vx: ship.vx,
      ship: true,
      steady: !canComb(ship.kind),
    });
  }
  return aims;
}

/** Whether any ship left is one a torpedo will catch. */
function torpedoWorthy(aims: readonly Aim[]): boolean {
  return aims.some((aim) => aim.steady);
}

/** An enemy torpedo boat closing on one of our ships, the nearest to its quarry first. */
function threateningBoat(world: World, plane: Plane): Ship | null {
  let best: Ship | null = null;
  let bestGap = BOAT_THREAT;
  for (const boat of world.ships) {
    if (boat.kind !== 'torpedo-boat' || boat.side === plane.side || boat.state !== 'afloat')
      continue;
    for (const ours of world.ships) {
      if (ours.side !== plane.side || ours.state !== 'afloat' || ours.escaped) continue;
      const gap = Math.abs(ours.x - boat.x);
      if (gap < bestGap) {
        best = boat;
        bestGap = gap;
      }
    }
  }
  return best;
}

/**
 * Guns on a boat a bomb cannot be spared for: in low over the water behind
 * it, firing as the nose comes on, and up and away before reaching it.
 */
function strafe(world: World, plane: Plane, boat: Ship, controls: Controls): Controls {
  plane.homing = false;
  const sea = world.map.sea?.level ?? boat.y;
  const dx = boat.x - plane.x;
  const towards = dx >= 0 ? 1 : -1;
  const hull = boat.y + SHIP_CLASSES[boat.kind].freeboard / 2;
  if (Math.abs(dx) < STRAFE_BREAK || !flyingTowards(plane, dx)) {
    steerTo(world, plane, plane.x + towards * 160, sea + CRUISE, controls);
    holdSpeed(world, plane, controls);
    return controls;
  }
  steerTo(world, plane, boat.x, Math.abs(dx) > 220 ? sea + STRAFE_HEIGHT + 20 : hull, controls);
  holdSpeed(world, plane, controls);
  const noseX = cosine(plane.heading);
  const noseY = sine(plane.heading);
  const along = dx * noseX + (hull - plane.y) * noseY;
  const across = Math.abs(-dx * noseY + (hull - plane.y) * noseX);
  if (along > 0 && along < 150 && across < 4) controls.fire = true;
  return controls;
}

/**
 * Down to the water well out and in fast, throttled back only for the last
 * stretch before the drop, level, heading for the ship; the torpedo goes
 * when it would run true from far enough out, then up and away.
 */
function torpedoRun(world: World, plane: Plane, ship: Aim, controls: Controls): Controls {
  const dx = ship.x - plane.x;
  const towards = dx >= 0 ? 1 : -1;
  const sea = world.map.sea?.level ?? ship.y;
  const distance = Math.abs(dx);
  if (distance < TORPEDO_DROP.near) {
    // Too close to drop: open out and come round again.
    steerTo(world, plane, plane.x - towards * 200, sea + CRUISE, controls);
    holdSpeed(world, plane, controls);
    return controls;
  }
  // Low over the water, but over any other ship in the way.
  const inTheWay = shipTopBetween(world, plane.x, ship.x - towards * TORPEDO_DROP.near, ship.id);
  const low = Math.max(sea + TORPEDO_HEIGHT, inTheWay + 8);
  const height = distance > TORPEDO_DROP.far + TORPEDO_LOW ? sea + CRUISE : low;
  steerTo(world, plane, plane.x + towards * 60, height, controls);
  const slow = world.tuning.minSpeed + 2;
  if (distance > TORPEDO_DROP.far + TORPEDO_SLOWING) holdSpeed(world, plane, controls);
  else controls.throttle = plane.speed > slow + 0.3 ? -1 : plane.speed < slow - 0.3 ? 1 : 0;
  if (distance <= TORPEDO_DROP.far && flyingTowards(plane, dx) && dropRunsTrue(world, plane))
    controls.bomb = true;
  return controls;
}

/** The top of the tallest ship between two points, other than the one being attacked. */
function shipTopBetween(world: World, from: number, to: number, except: number): number {
  const left = Math.min(from, to);
  const right = Math.max(from, to);
  let top = 0;
  for (const ship of world.ships) {
    if (ship.id === except || ship.state === 'sunk') continue;
    const half = (SHIP_CLASSES[ship.kind].length / 2) * hullFacing(ship) + 10;
    if (ship.x + half < left || ship.x - half > right) continue;
    top = Math.max(top, ship.y + SHIP_CLASSES[ship.kind].superstructure);
  }
  return top;
}

/**
 * The nearest raider worth chasing: any still coming, and one going home
 * only while it is over the sea, not out over the mountains it leaves by.
 */
function nearestRaider(world: World, plane: Plane): Raider | null {
  let best: Raider | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  const sea = world.map.sea?.spans ?? [];
  for (const raider of world.raiders) {
    if (raider.side === plane.side || raider.state === 'falling') continue;
    const overSea = sea.some(
      (span) => raider.x > span.left + COAST_MARGIN && raider.x < span.right - COAST_MARGIN,
    );
    if (raider.state === 'outbound' && !overSea) continue;
    const distance = Math.abs(raider.x - plane.x);
    if (distance < bestDistance) {
      best = raider;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Takes a raider from astern: up behind it at its height, just outside its
 * gunners' reach, throttled back to its pace and firing; over the top of it
 * if the gap closes too far, to come round for another pass. Never into it.
 */
function chaseRaider(world: World, plane: Plane, raider: Raider, controls: Controls): Controls {
  plane.homing = false;
  const kind = RAIDER_CLASSES[raider.kind];
  const heading = raider.vx >= 0 ? 1 : -1;
  // How far astern of it: negative once alongside or ahead.
  const gap = (raider.x - plane.x) * heading;
  const hold = kind.gunRange + STAND_OFF_MARGIN;
  if (gap < hold - PASS_OVER_INSIDE) {
    const over = raider.y + kind.radius + BIRD_DODGE;
    const beyond = raider.x + heading * (kind.length + 160);
    // Never on towards the mountains at the ends of the world.
    const edge = EDGE_WIDTH + COAST_MARGIN;
    steerTo(world, plane, Math.max(edge, Math.min(world.map.width - edge, beyond)), over, controls);
    holdSpeed(world, plane, controls);
    return controls;
  }
  steerTo(world, plane, raider.x, raider.y, controls);
  controls.throttle = gap > hold ? 1 : plane.speed > kind.speed + 0.4 ? -1 : 1;
  const dx = raider.x - plane.x;
  const dy = raider.y - plane.y;
  const noseX = cosine(plane.heading);
  const noseY = sine(plane.heading);
  const along = dx * noseX + dy * noseY;
  const across = Math.abs(-dx * noseY + dy * noseX);
  if (along > 0 && along < GUNS_REACH && across < kind.radius + 2) controls.fire = true;
  shootIfLinedUp(world, plane, controls);
  return controls;
}

function enemyNear(world: World, plane: Plane): boolean {
  return world.planes.some(
    (other) =>
      other.side !== plane.side &&
      !other.ghost &&
      isAirborne(other) &&
      Math.abs(other.x - plane.x) < FIGHT_RANGE &&
      Math.abs(other.y - plane.y) < FIGHT_RANGE,
  );
}

/** How far the target guns reach this round, the furthest-reaching kind included. */
function gunReach(world: World): number {
  let reach = world.tuning.targetRange;
  if (world.rules.antiAir) reach = Math.max(reach, 140);
  if (world.rules.searchlights) reach = Math.max(reach, 170);
  return reach;
}

/** The highest thing to clear on the way: the ground, or a building or lorry standing on it. */
function highestBetween(world: World, from: number, to: number): number {
  const left = Math.min(from, to);
  const right = Math.max(from, to);
  let highest = world.terrain.highestBetween(left, right);
  for (const target of world.targets) {
    if (!target.standing || target.x < left - target.width || target.x > right + target.width)
      continue;
    highest = Math.max(highest, target.y + target.height);
  }
  return highest;
}

function flyingTowards(plane: Plane, dx: number): boolean {
  return cosine(plane.heading) * dx > 0;
}

/** The nearest thing left to bomb, keeping to the one already chosen. */
function chooseTarget(standing: readonly Aim[], plane: Plane, memory: BotMemory): Aim | null {
  const kept = standing.find((target) => target.id === memory.target);
  if (kept) return kept;
  let best: Aim | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const target of standing) {
    const distance = Math.abs(target.x - plane.x);
    if (distance < bestDistance) {
      best = target;
      bestDistance = distance;
    }
  }
  memory.target = best ? best.id : null;
  return best;
}

function steerTo(world: World, plane: Plane, x: number, wantedY: number, controls: Controls) {
  // Over the sea's open flocks it looks out for birds; ashore it flies as it always has.
  const y = world.map.sea ? clearOfBirds(world, plane, wantedY) : wantedY;
  const level = x >= plane.x ? 0 : HALF_TURN;
  // Never point the nose more than about forty degrees from level, the way it is going.
  const wanted = headingOf(x - plane.x, (y - plane.y) * 0.6);
  const offset = Math.max(-470, Math.min(470, headingDelta(level, wanted)));
  // Turning back the other way, go up first and over the top: the short way
  // round can be a half loop downwards, and a bombing run is too low for one.
  // At sea, high up but too slow to go over the top without stalling, it first gathers speed level.
  const reversing =
    Math.abs(headingDelta(plane.heading, level + offset)) > QUARTER_TURN + 256 &&
    sine(plane.heading) < 0.7;
  const tooSlowToLoop =
    world.map.sea !== null &&
    plane.speed < world.tuning.minSpeed + LOOP_SPEED &&
    plane.y - world.terrain.heightAt(plane.x) > LOOP_ROOM;
  const toward = reversing && tooSlowToLoop ? plane.heading - (plane.heading % HALF_TURN) : UP;
  controls.pitch = pitchToward(plane, reversing ? toward : level + offset, 10);
  if (controls.pitch === 0 && wantsToRollUpright(plane)) controls.flip = true;
}

/**
 * The height to steer for so that no bird or flock on the way is flown
 * into: over one that is level or below, under one above (if there is
 * room over the ground), and as asked when the way is clear.
 */
function clearOfBirds(world: World, plane: Plane, wanted: number): number {
  for (const ticks of BIRD_LOOKAHEAD) {
    const x = plane.x + plane.vx * ticks;
    const y = plane.y + plane.vy * ticks;
    const near = (otherX: number, otherY: number, reach: number) =>
      Math.abs(otherX - x) < reach && Math.abs(otherY - y) < reach;
    const flock = world.flocks.find((it) => near(it.x + it.vx * ticks, it.y, BIRD_REACH.flock));
    const bird = world.birds.find((it) =>
      near(it.x + it.vx * ticks, it.y + it.vy * ticks, BIRD_REACH.bird),
    );
    const danger = flock ?? bird;
    if (!danger) continue;
    const ground = world.terrain.heightAt(x);
    const under = danger.y - BIRD_DODGE;
    return plane.y < danger.y && under > ground + 24 ? under : danger.y + BIRD_DODGE;
  }
  return wanted;
}

/**
 * Flies a bomb dropped now forward through the same drag and wind the
 * engine uses, and says whether it would land on the target (and not on
 * an ox).
 */
function wouldHit(world: World, plane: Plane, target: Aim, memory: BotMemory): boolean {
  if (plane.bombCooldown > 0 || plane.bombs === 0) return false;
  const bomb = { x: plane.x, y: plane.y - 5, vx: plane.vx, vy: plane.vy };
  const wind = perTick(world.rules.wind) / (BOMB_DRAG_MOVES * TICKS_PER_MOVE);
  // Where the target will be when the bomb gets there.
  let targetX = target.x;
  for (let tick = 0; tick < 600; tick++) {
    applyDrag(bomb, BOMB_DRAG_MOVES);
    bomb.vx += wind;
    bomb.x += bomb.vx;
    bomb.y += bomb.vy;
    targetX += target.vx;
    if (bomb.y <= target.y + target.height && Math.abs(bomb.x - targetX) <= target.width / 2) break;
    if (bomb.y <= world.terrain.heightAt(bomb.x)) break;
  }
  if (Math.abs(bomb.x - targetX) > target.width / 2 - 1) return false;
  if (memory.careful && world.oxen.some((ox) => ox.alive && Math.abs(ox.x - bomb.x) < OX_CLEARANCE))
    return false;
  return true;
}

/** Fires at an enemy plane or a target straight ahead and close. */
function shootIfLinedUp(world: World, plane: Plane, controls: Controls) {
  const noseX = cosine(plane.heading);
  const noseY = sine(plane.heading);
  for (const other of world.planes) {
    if (other.side === plane.side || other.ghost || !isAirborne(other)) continue;
    const dx = other.x - plane.x;
    const dy = other.y - plane.y;
    const along = dx * noseX + dy * noseY;
    const across = Math.abs(-dx * noseY + dy * noseX);
    if (along > 0 && along < 110 && across < 5) {
      controls.fire = true;
      return;
    }
  }
}
