import {
  BIRDS_IN_A_FLOCK,
  CEILING,
  FLOCK_SPEED,
  TICKS_PER_MOVE,
  movesToTicks,
  perTick,
} from './constants';
import type { WorldMap } from './map';
import { TURN, cosine, sine } from './trig';
import { nextId, type Bird, type Flock, type World } from './world';

/** Flocks wheel back and forth over the middle of the world, never out over the mountains. */
export function flockLimits(map: WorldMap): { left: number; right: number } {
  const margin = map.width * 0.123;
  return { left: margin, right: map.width - margin };
}

/** Scattered birds wheel about for this long, in moves, then fly off out of the battle. */
const SCATTERED_MOVES = [36, 72] as const;
/** Leaving, a bird climbs this fast, units a move, until it is gone over the top. */
const LEAVING_CLIMB = 3;

/** A lone bird drifts away from each flock as the round begins, gently downhill. */
export function spawnStray(world: World, flock: Flock) {
  const direction = world.rng.chance(0.5) ? 1 : -1;
  world.birds.push(makeBird(world, flock.x + direction * 6, flock.y - 4, direction * 2, -1, null));
}

function makeBird(
  world: World,
  x: number,
  y: number,
  vx: number,
  vy: number,
  leavesIn: number | null,
): Bird {
  return {
    id: nextId(world),
    x,
    y,
    vx: perTick(vx),
    vy: perTick(vy),
    wander: movesToTicks(world.rng.int(12, 40)),
    leavesIn,
  };
}

/**
 * Anything but another bird breaks a flock up: eight frightened birds burst
 * out in a ring, each at its own speed, and none of them upwards for long
 * because the ceiling turns them back.
 */
export function scatterFlock(world: World, flock: Flock) {
  world.flocks = world.flocks.filter((other) => other !== flock);
  const offset = world.rng.float(0, TURN / BIRDS_IN_A_FLOCK);
  for (let index = 0; index < BIRDS_IN_A_FLOCK; index++) {
    const heading = offset + (index * TURN) / BIRDS_IN_A_FLOCK;
    const speed = world.rng.float(1.5, 3.5);
    world.birds.push(
      makeBird(
        world,
        flock.x + cosine(heading) * 5,
        flock.y + sine(heading) * 4,
        cosine(heading) * speed,
        sine(heading) * speed - 0.5,
        movesToTicks(world.rng.int(SCATTERED_MOVES[0], SCATTERED_MOVES[1])),
      ),
    );
  }
  world.events.push({ type: 'flock-scattered', x: flock.x, y: flock.y });
}

export function moveFlocks(world: World) {
  const { left, right } = flockLimits(world.map);
  for (const flock of world.flocks) {
    if ((flock.x < left && flock.vx < 0) || (flock.x > right && flock.vx > 0)) flock.vx = -flock.vx;
    flock.x += flock.vx;
  }
}

export function flockVelocity(direction: 1 | -1): number {
  return perTick(FLOCK_SPEED) * direction;
}

/**
 * Birds fly straight until they meet the ground or the ceiling, then bounce
 * off in a new direction. Now and then one changes its mind on its own.
 * Birds scattered from a flock settle down after a while and fly off over
 * the top: in 1984 they stayed for good, and a busy round ended with the
 * sky full of them.
 */
export function moveBirds(world: World) {
  world.birds = world.birds.filter((bird) => {
    if (bird.leavesIn === null) return true;
    bird.leavesIn -= 1;
    if (bird.leavesIn > 0) return true;
    bird.vy = perTick(LEAVING_CLIMB);
    return bird.y < CEILING - 2;
  });
  for (const bird of world.birds) {
    bird.x += bird.vx;
    bird.y += bird.vy;
    if (bird.leavesIn !== null && bird.leavesIn <= 0) continue;
    bird.wander -= 1;
    const ground = world.terrain.heightAt(bird.x);
    const blocked =
      bird.y >= CEILING - 2 || bird.y <= ground + 2 || bird.x < 4 || bird.x > world.map.width - 4;
    if (blocked || bird.wander <= 0) turnBird(world, bird, blocked);
  }
}

function turnBird(world: World, bird: Bird, blocked: boolean) {
  if (blocked) {
    bird.x -= bird.vx;
    bird.y -= bird.vy;
    bird.vy = -bird.vy;
  }
  bird.vx = perTick(world.rng.int(-4, 3)) || perTick(1);
  if (bird.vy === 0) bird.vy = perTick(world.rng.chance(0.5) ? 1 : -1);
  bird.wander = movesToTicks(world.rng.int(12, 40));
}

/** A plane this low over an ox makes it look up and complain. */
const STARTLE_HEIGHT = 34;
const STARTLE_REACH = 22;
const STARTLE_REST_MOVES = 60;

/**
 * An ox that a plane roars low over lifts its head and moos, then will
 * not be bothered again for a while. Nothing more: it is unimpressed.
 */
export function startleOxen(world: World) {
  if (world.tick % TICKS_PER_MOVE !== 0) return;
  for (const ox of world.oxen) {
    if (!ox.alive || world.tick < ox.calmUntil) continue;
    const buzzed = world.planes.some(
      (plane) =>
        (plane.state === 'flying' || plane.state === 'stalled' || plane.state === 'falling') &&
        Math.abs(plane.x - ox.x) < STARTLE_REACH &&
        plane.y - ox.y < STARTLE_HEIGHT &&
        plane.y > ox.y,
    );
    if (!buzzed) continue;
    ox.calmUntil = world.tick + movesToTicks(STARTLE_REST_MOVES);
    world.events.push({ type: 'ox-startled', ox: ox.id });
  }
}
