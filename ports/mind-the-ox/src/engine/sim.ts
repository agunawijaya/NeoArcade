import { createRng } from '@shared/rng';
import { autopilotControls, isNearHome } from './autopilot';
import { resolveCollisions } from './collisions';
import { MAX_FUEL, TICKS_PER_MOVE } from './constants';
import { driveConvoys } from './convoy';
import { cpuControls } from './cpu';
import { isAirborne } from './damage';
import { carrierOf, clearTheDeck } from './deck';
import { moveDebris } from './debris';
import { park, refill, updatePlane } from './flight';
import { TARGET_SIZE, runwaySpan, type Side, type WorldMap } from './map';
import { passGates } from './objectives';
import { moveRaiders, raidersFire, sendRaids } from './raiders';
import { roundTuning, type Rules } from './rules';
import { launchFleet, moveShips, shipsFireBack } from './ships';
import { Terrain } from './terrain';
import { moveTorpedoes, torpedoBoatsAttack } from './torpedo';
import {
  fireWeapons,
  moveBombs,
  moveMissiles,
  moveShots,
  moveStarbursts,
  targetsFireBack,
} from './weapons';
import { flockVelocity, moveBirds, moveFlocks, spawnStray, startleOxen } from './wildlife';
import {
  IDLE_CONTROLS,
  nextId,
  type Controls,
  type Loadout,
  type Pilot,
  type Plane,
  type World,
} from './world';

/** Who flies from which airfield (or deck). */
export interface Seat {
  side: Side;
  pilot: Pilot;
  /** Index into the map's bases. */
  base: number;
  /** Crashes allowed; Infinity for 1984's ever-returning computer planes. */
  maxCrashes: number;
  /** Two-player games: out of planes, the pilot flies on as a harmless ghost. */
  ghostWhenOut?: boolean;
  /** What the plane starts the round carrying; bombs if left out. */
  loadout?: Loadout;
}

export interface WorldOptions {
  map: WorldMap;
  rules: Rules;
  seats: readonly Seat[];
  /** Seeds the explosions, the birds and the CPU's wobble; the same seed replays the same round. */
  seed: number;
}

export function createWorld({ map, rules, seats, seed }: WorldOptions): World {
  const runways = map.bases.filter((base) => base.carrier === undefined).map(runwaySpan);
  const terrain = new Terrain(map.heights, runways, map.sea?.spans ?? []);
  const world: World = {
    map,
    rules,
    tuning: roundTuning(rules.round),
    terrain,
    rng: createRng(`mind-the-ox:round:${seed}:${rules.round}`),
    tick: 0,
    nextId: 0,
    planes: [],
    targets: [],
    oxen: [],
    flocks: [],
    birds: [],
    shots: [],
    bombs: [],
    missiles: [],
    bursts: [],
    debris: [],
    ships: [],
    torpedoes: [],
    raiders: [],
    gatesPassed: 0,
    touchAndGoes: 0,
    score: [0, 0],
    events: [],
  };
  launchFleet(world);

  for (const site of map.targets) {
    const size = TARGET_SIZE[site.kind];
    world.targets.push({
      id: nextId(world),
      kind: site.kind,
      side: site.side,
      x: site.x,
      y: terrain.heightAt(site.x),
      width: size.width,
      height: size.height,
      standing: true,
      damage: 0,
      drivesTo: site.drivesTo ?? null,
      escaped: false,
    });
  }

  // 1984's novice flew an empty sky: no birds, no oxen.
  if (rules.expert) {
    for (const x of map.oxen) {
      world.oxen.push({
        id: nextId(world),
        x,
        y: terrain.heightAt(x),
        alive: true,
        facing: world.rng.chance(0.5) ? 1 : -1,
        calmUntil: 0,
      });
    }
    for (const site of map.flocks) {
      const flock = { id: nextId(world), x: site.x, y: site.y, vx: flockVelocity(site.direction) };
      world.flocks.push(flock);
      spawnStray(world, flock);
    }
  }

  seats.forEach((seat, index) => {
    // Planes sharing a carrier park one behind another on its deck.
    const deckSpot = seats.slice(0, index).filter((other) => other.base === seat.base).length;
    world.planes.push(createPlane(world, seat, index, deckSpot));
  });
  return world;
}

function createPlane(world: World, seat: Seat, index: number, deckSpot: number): Plane {
  const base = world.map.bases[seat.base];
  if (!base) throw new RangeError(`The map has no airfield number ${seat.base}.`);
  const plane: Plane = {
    id: nextId(world),
    side: seat.side,
    seat: index,
    pilot: seat.pilot,
    base,
    state: 'parked',
    wounded: false,
    ghost: false,
    ghostWhenOut: seat.ghostWhenOut ?? false,
    x: base.x,
    y: 0,
    vx: 0,
    vy: 0,
    heading: 0,
    inverted: false,
    speed: 0,
    throttle: 0,
    turnRate: 0,
    fuel: 0,
    rounds: 0,
    bombs: 0,
    loadout: seat.loadout ?? 'bombs',
    torpedoes: 0,
    missiles: 0,
    bursts: 0,
    gunCooldown: 0,
    bombCooldown: 0,
    missileCooldown: 0,
    burstCooldown: 0,
    stateTimer: 0,
    idleTicks: 0,
    pendingPitch: 0,
    pendingThrottle: 0,
    pendingFlip: false,
    crashes: 0,
    maxCrashes: seat.maxCrashes,
    homing: false,
    decoy: null,
    lastHitBy: null,
    controls: { ...IDLE_CONTROLS },
    cpu: { held: { ...IDLE_CONTROLS }, longWay: 0, quarry: null },
    deckOffset: 0,
    deckSpeed: 0,
    deckSpot,
    sink: 0,
  };
  refill(plane);
  park(world, plane);
  return plane;
}

/**
 * Advances the world by one tick. `controls` holds what each human seat is
 * asking for, by seat number; CPU seats and planes on autopilot decide for
 * themselves.
 */
export function step(world: World, controls: readonly (Controls | undefined)[] = []) {
  world.tick += 1;
  world.events = [];

  // The ships move first, so a deck carries its planes along with it.
  moveShips(world);
  for (const ship of world.ships) clearTheDeck(ship);
  for (const plane of world.planes)
    plane.controls = controlsFor(world, plane, controls[plane.seat]);
  for (const plane of world.planes) {
    fireWeapons(world, plane);
    updatePlane(world, plane);
    if (plane.homing && isAirborne(plane) && isNearHome(world, plane)) {
      park(world, plane);
      world.events.push({ type: 'landed', plane: plane.id, fuel: plane.fuel / MAX_FUEL });
    }
  }
  replaceWrecks(world);
  passGates(world);

  driveConvoys(world);
  targetsFireBack(world);
  shipsFireBack(world);
  sendRaids(world);
  raidersFire(world);
  torpedoBoatsAttack(world);
  healTargets(world);
  moveShots(world);
  moveBombs(world);
  moveMissiles(world);
  moveTorpedoes(world);
  moveRaiders(world);
  moveStarbursts(world);
  moveDebris(world);
  moveFlocks(world);
  moveBirds(world);
  startleOxen(world);
  resolveCollisions(world);
}

function controlsFor(world: World, plane: Plane, asked: Controls | undefined): Controls {
  if (plane.pilot.kind === 'cpu')
    return plane.homing ? autopilotControls(world, plane) : cpuControls(world, plane);
  const wanted = asked ?? IDLE_CONTROLS;
  if (wanted.home && isAirborne(plane) && plane.state === 'flying') plane.homing = true;
  if (!plane.homing) return wanted;
  // Steering takes the plane back from the autopilot; the guns stay the pilot's.
  if (wanted.pitch !== 0 || wanted.throttle !== 0 || wanted.flip) {
    plane.homing = false;
    return wanted;
  }
  return {
    ...autopilotControls(world, plane),
    fire: wanted.fire,
    bomb: wanted.bomb,
    missile: wanted.missile,
    starburst: wanted.starburst,
  };
}

/**
 * Once a wreck has sat its time, the pilot walks out to a fresh plane, or
 * is out of planes: out of the game, or in a two-player game a ghost.
 */
function replaceWrecks(world: World) {
  for (const plane of world.planes) {
    if (plane.state !== 'crashed' || plane.stateTimer > 0) continue;
    plane.crashes += 1;
    // With its carrier gone, there is no deck left to wheel the next plane out on.
    const homeless =
      plane.base.carrier !== undefined && carrierOf(world, plane)?.state !== 'afloat';
    const lastPlane = plane.crashes >= plane.maxCrashes || homeless;
    if (lastPlane && !plane.ghostWhenOut) {
      plane.state = 'out';
      world.events.push({ type: 'out', plane: plane.id });
      continue;
    }
    refill(plane);
    park(world, plane);
    if (lastPlane) {
      plane.ghost = true;
      world.events.push({ type: 'ghost', plane: plane.id });
    } else world.events.push({ type: 'respawn', plane: plane.id });
  }
}

/** Damaged targets patch themselves up by one point a move. */
function healTargets(world: World) {
  if (world.tick % TICKS_PER_MOVE !== 0) return;
  for (const target of world.targets) target.damage = Math.max(0, target.damage - 1);
}
