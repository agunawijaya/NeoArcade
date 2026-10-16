import { perTick } from './constants';
import { crashPlane, downPlane, isAirborne, woundPlane } from './damage';
import { carrierOf, deckUnder, landOnDeck, touchesDeck } from './deck';
import { canTouchRunway, park, touchRunway } from './flight';
import { RAIDER_CLASSES, hitRaider } from './raiders';
import { damageShip, isAfloat, shipBoxes } from './ships';
import {
  boxesOverlap,
  capsuleBounds,
  capsuleTouchesBox,
  capsulesTouch,
  planeCapsule,
  planeContactPoints,
  sweptCapsule,
  type Box,
  type Capsule,
} from './geometry';
import {
  bounceBird,
  damageTarget,
  destroyTarget,
  detonate,
  killBird,
  killOx,
  snuffStarburst,
} from './hits';
import type { DownCause } from './events';
import { scatterFlock } from './wildlife';
import type {
  Bird,
  Bomb,
  Debris,
  Flock,
  Missile,
  Ox,
  Plane,
  Raider,
  Ship,
  Shot,
  Starburst,
  Target,
  World,
} from './world';

type Body =
  | { kind: 'plane'; ref: Plane }
  | { kind: 'shot'; ref: Shot }
  | { kind: 'bomb'; ref: Bomb }
  | { kind: 'missile'; ref: Missile }
  | { kind: 'burst'; ref: Starburst }
  | { kind: 'debris'; ref: Debris }
  | { kind: 'bird'; ref: Bird }
  | { kind: 'flock'; ref: Flock }
  | { kind: 'ox'; ref: Ox }
  | { kind: 'target'; ref: Target }
  | { kind: 'ship'; ref: Ship }
  | { kind: 'raider'; ref: Raider };

/** A plane knocked out of the sky by another, and the motion it falls with. */
interface Momentum {
  plane: Plane;
  vx: number;
  vy: number;
}

interface Placed {
  body: Body;
  shape: Capsule | Box;
  bounds: Box;
  /** Set once the body is gone, so later pairs in the same tick leave it alone. */
  gone: boolean;
  order: number;
}

const OX_WIDTH = 14;
const OX_HEIGHT = 8;
const FLOCK_RADIUS = 6;
/** About the size of the bird: a near miss stays a miss. */
const BIRD_RADIUS = 0.9;
const BOMB_RADIUS = 1.6;
/** A missile into a raider tears this much out of it; a fighter flying into one, this much. */
const MISSILE_ON_RAIDER = 6;
const RAMMING_A_RAIDER = 10;

/**
 * Finds everything that touches this tick and settles each meeting, then
 * checks what has hit the ground. Pairs are found by sweeping along x, and
 * settled in a fixed order, so a replay always resolves the same way.
 */
export function resolveCollisions(world: World) {
  const placed = placeBodies(world);
  placed.sort((a, b) => a.bounds.left - b.bounds.left || a.order - b.order);
  const pairs: [Placed, Placed][] = [];
  for (let index = 0; index < placed.length; index++) {
    const first = placed[index] as Placed;
    for (let next = index + 1; next < placed.length; next++) {
      const second = placed[next] as Placed;
      if (second.bounds.left > first.bounds.right) break;
      if (boxesOverlap(first.bounds, second.bounds) && touches(first.shape, second.shape)) {
        pairs.push([first, second]);
      }
    }
  }
  const momentum: Momentum[] = [];
  for (const [first, second] of pairs) {
    if (first.gone || second.gone) continue;
    settle(world, first, second, momentum);
  }
  for (const { plane, vx, vy } of momentum) {
    plane.vx = vx;
    plane.vy = vy;
  }
  checkGround(world);
}

function placeBodies(world: World): Placed[] {
  const placed: Placed[] = [];
  const add = (body: Body, shape: Capsule | Box) => {
    const bounds = 'radius' in shape ? capsuleBounds(shape) : shape;
    placed.push({ body, shape, bounds, gone: false, order: placed.length });
  };
  for (const plane of world.planes) {
    if (
      plane.state === 'crashed' ||
      plane.state === 'out' ||
      plane.state === 'victory' ||
      plane.ghost
    )
      continue;
    add({ kind: 'plane', ref: plane }, planeCapsule(plane.x, plane.y, plane.heading));
  }
  for (const shot of world.shots)
    add({ kind: 'shot', ref: shot }, sweptCapsule(shot.x, shot.y, shot.vx, shot.vy, 0.6));
  for (const bomb of world.bombs)
    add({ kind: 'bomb', ref: bomb }, sweptCapsule(bomb.x, bomb.y, bomb.vx, bomb.vy, BOMB_RADIUS));
  for (const missile of world.missiles) {
    add(
      { kind: 'missile', ref: missile },
      sweptCapsule(missile.x, missile.y, missile.vx, missile.vy, BOMB_RADIUS),
    );
  }
  for (const burst of world.bursts)
    add({ kind: 'burst', ref: burst }, sweptCapsule(burst.x, burst.y, burst.vx, burst.vy, 2));
  for (const piece of world.debris)
    add({ kind: 'debris', ref: piece }, sweptCapsule(piece.x, piece.y, piece.vx, piece.vy, 1.2));
  for (const bird of world.birds)
    add({ kind: 'bird', ref: bird }, sweptCapsule(bird.x, bird.y, bird.vx, bird.vy, BIRD_RADIUS));
  for (const flock of world.flocks) {
    add(
      { kind: 'flock', ref: flock },
      { ax: flock.x - 3, ay: flock.y, bx: flock.x + 3, by: flock.y, radius: FLOCK_RADIUS - 3 },
    );
  }
  for (const ox of world.oxen) {
    if (!ox.alive) continue;
    add(
      { kind: 'ox', ref: ox },
      {
        left: ox.x - OX_WIDTH / 2,
        right: ox.x + OX_WIDTH / 2,
        bottom: ox.y,
        top: ox.y + OX_HEIGHT,
      },
    );
  }
  for (const target of world.targets) {
    if (!target.standing) continue;
    const half = target.width / 2;
    add(
      { kind: 'target', ref: target },
      {
        left: target.x - half,
        right: target.x + half,
        bottom: target.y,
        top: target.y + target.height,
      },
    );
  }
  for (const ship of world.ships) {
    if (!isAfloat(ship)) continue;
    for (const box of shipBoxes(ship)) add({ kind: 'ship', ref: ship }, box);
  }
  for (const raider of world.raiders) {
    const half = RAIDER_CLASSES[raider.kind].length / 2;
    add(
      { kind: 'raider', ref: raider },
      {
        ax: raider.x - half,
        ay: raider.y,
        bx: raider.x + half,
        by: raider.y,
        radius: RAIDER_CLASSES[raider.kind].radius,
      },
    );
  }
  return placed;
}

function touches(first: Capsule | Box, second: Capsule | Box): boolean {
  const firstIsCapsule = 'radius' in first;
  const secondIsCapsule = 'radius' in second;
  if (firstIsCapsule && secondIsCapsule) return capsulesTouch(first, second);
  if (firstIsCapsule) return capsuleTouchesBox(first, second as Box);
  if (secondIsCapsule) return capsuleTouchesBox(second, first);
  return false;
}

const KIND_ORDER: readonly Body['kind'][] = [
  'plane',
  'target',
  'ship',
  'raider',
  'ox',
  'flock',
  'bird',
  'bomb',
  'missile',
  'burst',
  'shot',
  'debris',
];

/** Puts the pair in a fixed order of kinds so each meeting is handled in one place. */
function settle(world: World, first: Placed, second: Placed, momentum: Momentum[]) {
  const [a, b] =
    KIND_ORDER.indexOf(first.body.kind) <= KIND_ORDER.indexOf(second.body.kind)
      ? [first, second]
      : [second, first];
  switch (a.body.kind) {
    case 'plane':
      planeMeets(world, a.body.ref, b, momentum);
      return;
    case 'target':
      targetMeets(world, a.body.ref, b);
      return;
    case 'ship':
      shipMeets(world, a.body.ref, b);
      return;
    case 'raider':
      raiderMeets(world, a.body.ref, b);
      return;
    case 'ox':
      oxMeets(world, a.body.ref, b);
      return;
    case 'flock':
      flockMeets(world, a, b);
      return;
    case 'bird':
      birdMeets(world, a, b);
      return;
    case 'bomb':
    case 'missile':
      explosiveMeets(world, a, b);
      return;
    default:
      return;
  }
}

function isGrounded(plane: Plane): boolean {
  return plane.state === 'parked' || plane.state === 'rolling' || plane.state === 'launching';
}

/** On a carrier's deck: parked, launching or wheeled along it. */
function isOnDeck(world: World, plane: Plane): boolean {
  return isGrounded(plane) && carrierOf(world, plane) !== null;
}

function planeMeets(world: World, plane: Plane, other: Placed, momentum: Momentum[]) {
  const body = other.body;
  const airborne = isAirborne(plane);
  switch (body.kind) {
    case 'plane':
      // A deck park is wider than it looks from the side: planes on it roll past one another.
      if (isOnDeck(world, plane) && isOnDeck(world, body.ref)) return;
      collide(world, plane, body.ref, momentum);
      return;
    case 'ship': {
      const ship = body.ref;
      if (isGrounded(plane) && carrierOf(world, plane) === ship) return;
      if (!airborne && plane.state !== 'falling') return;
      // Our pilots keep clear of our escorts' masts and funnels: only a plane coming down,
      // or one flown into its own carrier's side, hits one of ours.
      if (airborne && ship.side === plane.side && carrierOf(world, plane) !== ship) return;
      damageShip(world, ship, 'plane', plane.side, plane.x, plane.y);
      if (airborne) downPlane(world, plane, 'ship', ship.side);
      crashPlane(world, plane);
      return;
    }
    case 'raider': {
      if (!airborne) return;
      const raider = body.ref;
      hitHard(world, plane, raider.side, 'rammed');
      hitRaider(world, raider, RAMMING_A_RAIDER, plane.side);
      return;
    }
    case 'shot': {
      const shot = body.ref;
      if (shot.owner.plane === plane.id) return;
      // Gunners on a ship or a raider never hit their own side's planes.
      if (shot.owner.plane === null && shot.owner.side === plane.side && world.map.sea) return;
      removeShot(world, shot, other);
      if (airborne) {
        splat(world, plane, 'hole');
        woundPlane(world, plane, shot.owner.plane === null ? 'flak' : 'shot', shot.owner.side);
      } else if (plane.state === 'falling') splat(world, plane, 'hole');
      return;
    }
    case 'bomb':
    case 'missile': {
      const weapon = body.ref;
      // A bomb dropped in a climb can hang beside its plane for seconds; it never hits it.
      if (weapon.owner.plane === plane.id) return;
      other.gone = true;
      detonate(
        world,
        body.kind === 'bomb'
          ? { kind: 'bomb', body: body.ref }
          : { kind: 'missile', body: body.ref },
        false,
      );
      hitHard(world, plane, weapon.owner.side, 'bomb');
      return;
    }
    case 'debris':
      // Wreckage only matters in the air; a plane on its runway shrugs it off.
      if (airborne) downPlane(world, plane, 'wreckage', null);
      return;
    case 'bird':
    case 'flock': {
      if (airborne) {
        splat(world, plane, 'bird');
        woundPlane(world, plane, 'bird', null);
      } else if (plane.state === 'falling') splat(world, plane, 'bird');
      if (body.kind === 'bird') {
        other.gone = true;
        // A falling wreck takes the bird with it, unpaid: it would otherwise splat again every tick.
        if (airborne) killBird(world, body.ref, plane.side);
        else if (plane.state === 'falling') killBird(world, body.ref, null);
        else bounceBird(body.ref);
      } else {
        other.gone = true;
        scatterFlock(world, body.ref);
      }
      return;
    }
    case 'ox': {
      if (!airborne && plane.state !== 'falling') return;
      other.gone = true;
      if (airborne) {
        splat(world, plane, 'ox');
        woundPlane(world, plane, 'ox', null);
      }
      killOx(world, body.ref, airborne ? plane.side : null);
      return;
    }
    case 'target': {
      other.gone = true;
      destroyTarget(world, body.ref, plane.side);
      hitHard(world, plane, body.ref.side, 'target');
      return;
    }
    default:
      return;
  }
}

/** Things that bring a plane straight down; on the runway they wreck it where it stands. */
function hitHard(world: World, plane: Plane, culprit: 0 | 1 | null, cause: DownCause) {
  if (isAirborne(plane)) downPlane(world, plane, cause, culprit);
  else if (isGrounded(plane)) crashPlane(world, plane);
}

function splat(world: World, plane: Plane, kind: 'bird' | 'hole' | 'ox') {
  if (plane.pilot.kind !== 'human') return;
  world.events.push({ type: 'splat', plane: plane.id, kind });
}

/**
 * Two planes that collide both go down and fall on together: each one that
 * was still flying takes the average of their motions, nudged a little apart
 * so the wrecks separate. A falling wreck takes down whatever it falls into
 * and carries on as it was.
 */
function collide(world: World, first: Plane, second: Plane, momentum: Momentum[]) {
  const vx = (first.vx + second.vx) / 2;
  const vy = (first.vy + second.vy) / 2;
  const nudge = perTick(1) / 2;
  if (isAirborne(first)) momentum.push({ plane: first, vx: vx + nudge, vy: vy + nudge });
  if (isAirborne(second)) momentum.push({ plane: second, vx: vx - nudge, vy: vy - nudge });
  hitHard(world, first, second.side, 'rammed');
  hitHard(world, second, first.side, 'rammed');
}

function targetMeets(world: World, target: Target, other: Placed) {
  const body = other.body;
  switch (body.kind) {
    case 'shot':
      // A target's own guns fire from inside it.
      if (body.ref.owner.plane === null) return;
      removeShot(world, body.ref, other);
      damageTarget(world, target, body.ref.owner.side);
      return;
    case 'bomb':
    case 'missile':
      other.gone = true;
      detonate(
        world,
        body.kind === 'bomb'
          ? { kind: 'bomb', body: body.ref }
          : { kind: 'missile', body: body.ref },
        false,
      );
      destroyTarget(world, target, body.ref.owner.side);
      return;
    default:
      return;
  }
}

/** A ship takes bullets from planes (its own gunners' shots pass it by), bombs and missiles. */
function shipMeets(world: World, ship: Ship, other: Placed) {
  const body = other.body;
  switch (body.kind) {
    case 'shot': {
      const { owner } = body.ref;
      if (owner.plane === null || owner.side === ship.side) return;
      removeShot(world, body.ref, other);
      damageShip(world, ship, 'shot', owner.side, body.ref.x, body.ref.y);
      return;
    }
    case 'bomb':
    case 'missile':
      other.gone = true;
      detonate(
        world,
        body.kind === 'bomb'
          ? { kind: 'bomb', body: body.ref }
          : { kind: 'missile', body: body.ref },
        false,
      );
      damageShip(world, ship, 'bomb', body.ref.owner.side, body.ref.x, body.ref.y);
      return;
    default:
      return;
  }
}

/** Raiders take bullets and missiles from the other side's planes; their own gunners never hit them. */
function raiderMeets(world: World, raider: Raider, other: Placed) {
  const body = other.body;
  switch (body.kind) {
    case 'shot': {
      const { owner } = body.ref;
      if (owner.side === raider.side) return;
      removeShot(world, body.ref, other);
      hitRaider(world, raider, 1, owner.side);
      return;
    }
    case 'missile':
      if (body.ref.owner.side === raider.side) return;
      other.gone = true;
      detonate(world, { kind: 'missile', body: body.ref }, false);
      hitRaider(world, raider, MISSILE_ON_RAIDER, body.ref.owner.side);
      return;
    default:
      return;
  }
}

function oxMeets(world: World, ox: Ox, other: Placed) {
  const body = other.body;
  switch (body.kind) {
    case 'shot':
      removeShot(world, body.ref, other);
      killOx(world, ox, body.ref.owner.side);
      return;
    case 'bomb':
    case 'missile':
      other.gone = true;
      detonate(
        world,
        body.kind === 'bomb'
          ? { kind: 'bomb', body: body.ref }
          : { kind: 'missile', body: body.ref },
        false,
      );
      killOx(world, ox, body.ref.owner.side);
      return;
    default:
      return;
  }
}

function flockMeets(world: World, flock: Placed, other: Placed) {
  if (other.body.kind === 'bird' || flock.body.kind !== 'flock') return;
  flock.gone = true;
  scatterFlock(world, flock.body.ref);
  if (other.body.kind === 'shot') removeShot(world, other.body.ref, other);
}

function birdMeets(world: World, bird: Placed, other: Placed) {
  if (bird.body.kind !== 'bird') return;
  const body = other.body;
  switch (body.kind) {
    case 'shot':
      removeShot(world, body.ref, other);
      bird.gone = true;
      killBird(world, bird.body.ref, body.ref.owner.side);
      return;
    case 'bomb':
    case 'missile':
      bird.gone = true;
      killBird(world, bird.body.ref, body.ref.owner.side);
      return;
    case 'debris':
    case 'burst':
      bounceBird(bird.body.ref);
      return;
    default:
      return;
  }
}

function explosiveMeets(world: World, explosive: Placed, other: Placed) {
  const body = explosive.body;
  if (body.kind !== 'bomb' && body.kind !== 'missile') return;
  const blast =
    body.kind === 'bomb'
      ? ({ kind: 'bomb', body: body.ref } as const)
      : ({ kind: 'missile', body: body.ref } as const);
  switch (other.body.kind) {
    case 'bomb':
    case 'missile': {
      explosive.gone = true;
      other.gone = true;
      detonate(world, blast, false);
      const second = other.body;
      detonate(
        world,
        second.kind === 'bomb'
          ? { kind: 'bomb', body: second.ref }
          : { kind: 'missile', body: second.ref },
        false,
      );
      return;
    }
    case 'burst':
      explosive.gone = true;
      other.gone = true;
      detonate(world, blast, false);
      snuffStarburst(world, other.body.ref);
      return;
    case 'shot':
      explosive.gone = true;
      removeShot(world, other.body.ref, other);
      detonate(world, blast, false);
      return;
    default:
      return;
  }
}

function removeShot(world: World, shot: Shot, placed: Placed) {
  placed.gone = true;
  world.shots = world.shots.filter((other) => other !== shot);
}

/**
 * What reached the ground this tick: planes crash (or touch down on their
 * own runway), and bombs and missiles go off and dig a crater.
 */
function checkGround(world: World) {
  for (const plane of world.planes) {
    if (!isAirborne(plane) && plane.state !== 'falling') continue;
    const deck = isAirborne(plane) && !plane.ghost ? deckUnder(world, plane) : null;
    if (deck && touchesDeck(plane, deck)) {
      landOnDeck(world, plane, deck);
      continue;
    }
    const points = planeContactPoints(plane.x, plane.y, plane.heading, plane.inverted);
    const below = (point: { x: number; y: number }) => point.y <= world.terrain.heightAt(point.x);
    const wheelsDown = below(points.wheels) || below(points.tail);
    const bodyDown = below(points.nose) || below(points.top);
    if (!wheelsDown && !bodyDown) continue;
    // A ghost leaves no wreck: it is simply back on its runway.
    if (plane.ghost) park(world, plane);
    else if (!bodyDown && canTouchRunway(plane)) touchRunway(world, plane);
    else crashPlane(world, plane);
  }
  for (const bomb of [...world.bombs]) {
    if (bomb.y <= world.terrain.heightAt(bomb.x))
      detonate(world, { kind: 'bomb', body: bomb }, true);
  }
  for (const missile of [...world.missiles]) {
    if (missile.y <= world.terrain.heightAt(missile.x))
      detonate(world, { kind: 'missile', body: missile }, true);
  }
}
