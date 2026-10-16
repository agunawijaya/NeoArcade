import { explode } from './debris';
import type { Side } from './map';
import { scoreBirdKilled, scoreOxKilled, scoreTargetLost } from './scoring';
import { clearDecoy } from './weapons';
import type { Bird, Bomb, Missile, Ox, Starburst, Target, World } from './world';

/** What happens to the things that get hit; the collision pass decides who hit whom. */

export function damageTarget(world: World, target: Target, culprit: Side) {
  if (!target.standing) return;
  target.damage += 10;
  if (target.damage > world.tuning.targetToughness) destroyTarget(world, target, culprit);
  else
    world.events.push({
      type: 'target-hit',
      target: target.id,
      x: target.x,
      y: target.y + target.height / 2,
    });
}

export function destroyTarget(world: World, target: Target, culprit: Side | null) {
  if (!target.standing) return;
  target.standing = false;
  const centreY = target.y + target.height / 2;
  explode(world, target.x, centreY, 0, 0, target.kind === 'depot' ? 'huge' : 'large');
  world.events.push({
    type: 'target-destroyed',
    target: target.id,
    kind: target.kind,
    side: target.side,
    by: culprit,
    x: target.x,
    y: target.y,
  });
  scoreTargetLost(world, target.side, target.kind, culprit);
}

export function killOx(world: World, ox: Ox, culprit: Side | null) {
  if (!ox.alive) return;
  ox.alive = false;
  world.events.push({ type: 'ox-hit', ox: ox.id, x: ox.x, y: ox.y, by: culprit });
  if (culprit !== null) scoreOxKilled(world, culprit);
}

export function killBird(world: World, bird: Bird, culprit: Side | null) {
  world.birds = world.birds.filter((other) => other !== bird);
  world.events.push({ type: 'bird-hit', x: bird.x, y: bird.y, by: culprit });
  if (culprit !== null) scoreBirdKilled(world, culprit);
}

/** A bird knocked about by wreckage tumbles off the other way. */
export function bounceBird(bird: Bird) {
  bird.vx = -bird.vx;
  bird.vy = -bird.vy;
}

/**
 * Bombs and missiles go off where they are; on the ground they also dig a
 * crater. Into the sea they only throw up a column of water.
 */
export function detonate(
  world: World,
  explosive: { kind: 'bomb'; body: Bomb } | { kind: 'missile'; body: Missile },
  onGround: boolean,
) {
  if (explosive.kind === 'bomb')
    world.bombs = world.bombs.filter((bomb) => bomb !== explosive.body);
  else world.missiles = world.missiles.filter((missile) => missile !== explosive.body);
  const { x, y, vx, vy } = explosive.body;
  if (onGround && world.terrain.isWater(x)) {
    world.events.push({ type: 'splash', x, y: world.terrain.heightAt(x), size: 'large' });
    return;
  }
  explode(world, x, y, vx, vy, 'large');
  if (!onGround) return;
  world.terrain.carve(x, 3, world.tick);
  world.events.push({
    type: 'crater',
    x,
    y: world.terrain.heightAt(x),
    cause: explosive.kind,
    by: explosive.body.owner.side,
  });
}

export function snuffStarburst(world: World, burst: Starburst) {
  world.bursts = world.bursts.filter((other) => other !== burst);
  clearDecoy(world, burst.id);
}
