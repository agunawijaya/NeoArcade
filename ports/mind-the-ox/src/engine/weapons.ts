import {
  BOMB_DRAG_MOVES,
  BOMB_INTERVAL_MOVES,
  BULLET_LIFE_MOVES,
  BURST_INTERVAL_MOVES,
  BURST_LIFE_MOVES,
  CEILING,
  GUN_INTERVAL_MOVES,
  MISSILE_INTERVAL_MOVES,
  MISSILE_LIFE_MOVES,
  TICKS_PER_MOVE,
  movesToTicks,
  perTick,
} from './constants';
import { applyDrag } from './debris';
import { pilotUpHeading, weightedRangeSquared } from './geometry';
import { inFog } from './map';
import { isLit, isSpotted } from './sight';
import { dropTorpedo } from './torpedo';
import {
  CLASSIC_STEP,
  HALF_TURN,
  cosine,
  headingDelta,
  headingOf,
  sine,
  wrapHeading,
} from './trig';
import { nextId, type Missile, type Owner, type Plane, type Target, type World } from './world';

/** A missile turns a sixteenth of a circle every two moves, like the 1984 one. */
const MISSILE_TURN_RATE = CLASSIC_STEP / (2 * TICKS_PER_MOVE);
/** Missiles lock on to the nearest enemy within this half-angle of the nose. */
const LOCK_CONE = CLASSIC_STEP * 2.5;
const LOCK_RANGE = 260;
/** Anti-aircraft guns at the depots reach this far from the first round. */
const ANTI_AIR_RANGE = 140;
/** On a night raid, a plane caught in a searchlight draws fire from this far. */
const SEARCHLIGHT_GUN_RANGE = 170;
/** Softened flak reaches this share as far, and misses by up to this much plus a little per unit of range. */
const SOFTENED_REACH = 0.8;
const SOFTENED_SCATTER = 6;
const SOFTENED_SCATTER_PER_UNIT = 0.08;

function ownerOf(plane: Plane): Owner {
  return { side: plane.side, plane: plane.id };
}

/** CPU planes never run dry, as in 1984; humans count every round. */
function usesStores(world: World, plane: Plane): boolean {
  return world.rules.expert && plane.pilot.kind === 'human';
}

/** Guns, bombs and the secret weapons, each with its own rate of fire. */
export function fireWeapons(world: World, plane: Plane) {
  if (plane.state !== 'flying' && plane.state !== 'stalled') return;
  if (plane.ghost) return;
  const { controls } = plane;
  if (controls.fire && plane.gunCooldown === 0) fireGun(world, plane);
  if (controls.bomb && plane.bombCooldown === 0) {
    // The bomb key lets go of whatever hangs underneath: bombs, or the torpedo.
    if (plane.loadout === 'torpedo') dropTorpedo(world, plane, usesStores(world, plane));
    else dropBomb(world, plane);
  }
  if (!world.rules.secretWeapons) return;
  if (controls.missile && plane.missileCooldown === 0) launchMissile(world, plane);
  if (controls.starburst && plane.burstCooldown === 0) releaseStarburst(world, plane);
}

/** Bullets leave along the nose at the plane's speed plus the gun's. */
function fireGun(world: World, plane: Plane) {
  if (usesStores(world, plane)) {
    if (plane.rounds <= 0) return;
    plane.rounds -= 1;
  }
  plane.gunCooldown = movesToTicks(GUN_INTERVAL_MOVES);
  const speed = perTick(plane.speed + world.tuning.bulletSpeed);
  world.shots.push({
    id: nextId(world),
    owner: ownerOf(plane),
    x: plane.x,
    y: plane.y,
    vx: cosine(plane.heading) * speed,
    vy: sine(plane.heading) * speed,
    life: movesToTicks(BULLET_LIFE_MOVES),
  });
  world.events.push({ type: 'gun', plane: plane.id, x: plane.x, y: plane.y });
}

/** Bombs drop from the belly with the plane's own motion, then arc over and steepen. */
function dropBomb(world: World, plane: Plane) {
  if (usesStores(world, plane)) {
    if (plane.bombs <= 0) return;
    plane.bombs -= 1;
  }
  plane.bombCooldown = movesToTicks(BOMB_INTERVAL_MOVES);
  const belly = pilotUpHeading(plane.heading, plane.inverted) + HALF_TURN;
  const x = plane.x + cosine(belly) * 5;
  const y = plane.y + sine(belly) * 5;
  world.bombs.push({
    id: nextId(world),
    owner: ownerOf(plane),
    x,
    y,
    vx: plane.vx,
    vy: plane.vy,
    age: 0,
  });
  world.events.push({ type: 'bomb-away', plane: plane.id, x, y });
}

function launchMissile(world: World, plane: Plane) {
  if (usesStores(world, plane)) {
    if (plane.missiles <= 0) return;
    plane.missiles -= 1;
  }
  plane.missileCooldown = movesToTicks(MISSILE_INTERVAL_MOVES);
  const speed = world.tuning.maxSpeed * 1.5;
  const x = plane.x + cosine(plane.heading) * 12;
  const y = plane.y + sine(plane.heading) * 12;
  world.missiles.push({
    id: nextId(world),
    owner: ownerOf(plane),
    quarry: lockOn(world, plane),
    x,
    y,
    vx: cosine(plane.heading) * perTick(speed),
    vy: sine(plane.heading) * perTick(speed),
    heading: plane.heading,
    speed,
    life: movesToTicks(MISSILE_LIFE_MOVES),
    burnedOut: false,
    decoyed: false,
  });
  world.events.push({ type: 'missile-away', plane: plane.id, x, y });
}

/** The nearest enemy plane in front of the nose, if any. */
function lockOn(world: World, plane: Plane): number | null {
  let best: Plane | null = null;
  let bestRange = LOCK_RANGE * LOCK_RANGE;
  for (const other of world.planes) {
    if (other.side === plane.side || other.ghost) continue;
    if (other.state !== 'flying' && other.state !== 'stalled') continue;
    if (inFog(world.map, other.x, other.y)) continue;
    const dx = other.x - plane.x;
    const dy = other.y - plane.y;
    const range = dx * dx + dy * dy;
    if (range >= bestRange) continue;
    if (Math.abs(headingDelta(plane.heading, headingOf(dx, dy))) > LOCK_CONE) continue;
    best = other;
    bestRange = range;
  }
  return best ? best.id : null;
}

/**
 * A starburst drops out behind the plane and falls, burning, drawing any
 * missile chasing that plane after it. 1984 set the delay between them on
 * the starburst instead of the plane, so they could be fired endlessly;
 * here the plane waits its five moves.
 */
function releaseStarburst(world: World, plane: Plane) {
  if (usesStores(world, plane)) {
    if (plane.bursts <= 0) return;
    plane.bursts -= 1;
  }
  plane.burstCooldown = movesToTicks(BURST_INTERVAL_MOVES);
  const backwards = wrapHeading(plane.heading + (plane.inverted ? 3 : 5) * (HALF_TURN / 4));
  const speed = perTick(world.tuning.minSpeed);
  const id = nextId(world);
  world.bursts.push({
    id,
    owner: ownerOf(plane),
    x: plane.x,
    y: plane.y,
    vx: cosine(backwards) * speed + plane.vx,
    vy: sine(backwards) * speed + plane.vy,
    life: movesToTicks(BURST_LIFE_MOVES),
  });
  plane.decoy = id;
  world.events.push({ type: 'starburst', plane: plane.id, x: plane.x, y: plane.y });
}

export function moveShots(world: World) {
  world.shots = world.shots.filter((shot) => {
    shot.life -= 1;
    shot.x += shot.vx;
    shot.y += shot.vy;
    if (shot.life <= 0) {
      if (shot.shell) world.events.push({ type: 'flak-burst', x: shot.x, y: shot.y });
      return false;
    }
    if (shot.y >= CEILING || shot.x < 0 || shot.x >= world.map.width) return false;
    return shot.y > world.terrain.heightAt(shot.x);
  });
}

/** Bombs fly on until they hit something; the collision pass decides what. */
export function moveBombs(world: World) {
  const wind = perTick(world.rules.wind) / (BOMB_DRAG_MOVES * TICKS_PER_MOVE);
  world.bombs = world.bombs.filter((bomb) => {
    applyDrag(bomb, BOMB_DRAG_MOVES);
    bomb.vx += wind;
    bomb.x += bomb.vx;
    bomb.y += bomb.vy;
    bomb.age += 1;
    return bomb.x >= 0 && bomb.x < world.map.width && bomb.y > -20;
  });
}

/**
 * Missiles steer for their quarry, or for the starburst it dropped, at a
 * fixed speed until their fuel runs out; then they tumble down.
 */
export function moveMissiles(world: World) {
  world.missiles = world.missiles.filter((missile) => {
    if (missile.burnedOut) {
      applyDrag(missile, BOMB_DRAG_MOVES);
      missile.heading = wrapHeading(missile.heading + MISSILE_TURN_RATE * 2);
    } else {
      steerMissile(world, missile);
      missile.life -= 1;
      if (missile.life <= 0 || missile.y >= CEILING * 1.5) missile.burnedOut = true;
    }
    missile.x += missile.vx;
    missile.y += missile.vy;
    return missile.x >= 0 && missile.x < world.map.width && missile.y > -20;
  });
}

function steerMissile(world: World, missile: Missile) {
  const quarry = world.planes.find((plane) => plane.id === missile.quarry);
  let aimX: number | null = null;
  let aimY = 0;
  if (quarry && (quarry.state === 'flying' || quarry.state === 'stalled')) {
    const decoy =
      quarry.decoy === null ? undefined : world.bursts.find((burst) => burst.id === quarry.decoy);
    if (decoy) {
      aimX = decoy.x;
      aimY = decoy.y;
      if (!missile.decoyed) world.events.push({ type: 'missile-decoyed', missile: missile.id });
      missile.decoyed = true;
    } else {
      aimX = quarry.x;
      aimY = quarry.y;
    }
  }
  if (aimX !== null) {
    const wanted = headingOf(aimX - missile.x, aimY - missile.y);
    const turn = Math.max(
      -MISSILE_TURN_RATE,
      Math.min(MISSILE_TURN_RATE, headingDelta(missile.heading, wanted)),
    );
    missile.heading = wrapHeading(missile.heading + turn);
  }
  missile.vx = cosine(missile.heading) * perTick(missile.speed);
  missile.vy = sine(missile.heading) * perTick(missile.speed);
}

export function moveStarbursts(world: World) {
  world.bursts = world.bursts.filter((burst) => {
    applyDrag(burst, BOMB_DRAG_MOVES);
    burst.x += burst.vx;
    burst.y += burst.vy;
    burst.life -= 1;
    const alive =
      burst.life > 0 &&
      burst.x >= 0 &&
      burst.x < world.map.width &&
      burst.y > world.terrain.heightAt(burst.x);
    if (!alive) clearDecoy(world, burst.id);
    return alive;
  });
}

export function clearDecoy(world: World, burstId: number) {
  for (const plane of world.planes) if (plane.decoy === burstId) plane.decoy = null;
}

/**
 * From the second round, standing targets shoot at enemy planes that come
 * within range, leading them by four moves of flight; in that first round
 * of firing back they only manage every other move. Depots with
 * anti-aircraft guns fire every move from the start, and on a night raid a
 * plane caught in a searchlight draws fire from further off. Nobody fires
 * at what it cannot see.
 */
export function targetsFireBack(world: World) {
  if (world.tick % TICKS_PER_MOVE !== 0) return;
  const move = world.tick / TICKS_PER_MOVE;
  const softened = world.rules.flak === 'softened';
  for (const target of world.targets) {
    if (!target.standing) continue;
    const antiAir = world.rules.antiAir && target.kind === 'depot';
    const range =
      (antiAir ? Math.max(world.tuning.targetRange, ANTI_AIR_RANGE) : world.tuning.targetRange) *
      (softened ? SOFTENED_REACH : 1);
    const everyMove =
      antiAir || (world.tuning.targetFiresEveryMove && (!softened || world.rules.round >= 3));
    if (!everyMove && move % 2 === 0) continue;
    const quarry = nearestEnemy(world, target, range);
    if (quarry) fireFromTarget(world, target, quarry);
  }
}

function nearestEnemy(world: World, target: Target, range: number): Plane | null {
  let best: Plane | null = null;
  let bestRange = Number.POSITIVE_INFINITY;
  const muzzleY = target.y + target.height / 2;
  for (const plane of world.planes) {
    if (plane.side === target.side || plane.ghost) continue;
    if (plane.state !== 'flying' && plane.state !== 'stalled') continue;
    if (!isSpotted(world, plane, target.x, muzzleY)) continue;
    const reach =
      world.rules.searchlights && isLit(world, plane.x, plane.y)
        ? Math.max(range, SEARCHLIGHT_GUN_RANGE)
        : range;
    const distance = weightedRangeSquared(plane.x - target.x, plane.y - muzzleY);
    if (distance > 0 && distance < reach * reach && distance < bestRange) {
      best = plane;
      bestRange = distance;
    }
  }
  return best;
}

function fireFromTarget(world: World, target: Target, quarry: Plane) {
  const muzzleY = target.y + target.height / 2;
  const leadTicks = movesToTicks(4);
  let aimX = quarry.x + quarry.vx * leadTicks - target.x;
  let aimY = quarry.y + quarry.vy * leadTicks - muzzleY;
  if (world.rules.flak === 'softened') {
    const reach = Math.sqrt(aimX * aimX + aimY * aimY);
    const scatter = SOFTENED_SCATTER + reach * SOFTENED_SCATTER_PER_UNIT;
    aimX += world.rng.float(-scatter, scatter);
    aimY += world.rng.float(-scatter, scatter);
  }
  const distance = Math.sqrt(aimX * aimX + aimY * aimY);
  if (distance < 1) return;
  const speed = perTick(world.tuning.bulletSpeed);
  world.shots.push({
    id: nextId(world),
    owner: { side: target.side, plane: null },
    x: target.x,
    y: muzzleY,
    vx: (aimX / distance) * speed,
    vy: (aimY / distance) * speed,
    life: movesToTicks(BULLET_LIFE_MOVES),
  });
  world.events.push({ type: 'target-gun', target: target.id, x: target.x, y: muzzleY });
}
