import {
  CRASH_AT_HOME_MOVES,
  CRASH_MOVES,
  FALL_DRAG_MOVES,
  NEAR_HOME,
  movesToTicks,
} from './constants';
import { explode } from './debris';
import type { DownCause, WoundCause } from './events';
import type { Side } from './map';
import { scorePlaneLost } from './scoring';
import { rescuerNear } from './ships';
import { CLASSIC_STEP, cosine, wrapHeading } from './trig';
import type { Plane, World } from './world';

/** A plane that can still be hurt: in the air, under its pilot's control or tumbling. */
export function isAirborne(plane: Plane): boolean {
  return plane.state === 'flying' || plane.state === 'stalled';
}

/**
 * Shots, birds and oxen only wound a healthy plane: it smokes and answers
 * the stick every other move. A second wound brings it down.
 */
export function woundPlane(world: World, plane: Plane, by: WoundCause, culprit: Side | null) {
  if (!isAirborne(plane) || plane.ghost) return;
  plane.lastHitBy = culprit;
  if (!plane.wounded) {
    plane.wounded = true;
    world.events.push({ type: 'plane-wounded', plane: plane.id, by });
    return;
  }
  downPlane(world, plane, by, culprit);
}

/**
 * Shot down, rammed or out of fuel: the plane falls out of the sky, keeping
 * its momentum, and its pilot's stick can only stretch or shorten the fall.
 */
export function downPlane(world: World, plane: Plane, cause: DownCause, culprit: Side | null) {
  if (!isAirborne(plane) || plane.ghost) return;
  const wasFlying = plane.state === 'flying';
  plane.state = 'falling';
  plane.homing = false;
  // Counted in half-moves: two come off each move, more or fewer as the pilot pulls or pushes.
  plane.stateTimer = FALL_DRAG_MOVES * 2;
  plane.lastHitBy = culprit ?? plane.lastHitBy;
  if (cause !== 'fuel') explode(world, plane.x, plane.y, plane.vx, plane.vy, 'small');
  world.events.push({
    type: 'plane-down',
    plane: plane.id,
    side: plane.side,
    cause,
    by: plane.lastHitBy,
    x: plane.x,
    y: plane.y,
  });
  if (wasFlying && cause !== 'fuel') {
    world.events.push({
      type: 'bailout',
      plane: plane.id,
      side: plane.side,
      x: plane.x,
      y: plane.y,
      vx: plane.vx,
      vy: plane.vy,
    });
  }
  scorePlaneLost(world, plane.side);
}

/**
 * The plane meets the ground: a blast, a crater, and a wreck that sits for
 * a moment (longer if it came down at home) before the next plane rolls out.
 */
export function crashPlane(world: World, plane: Plane) {
  if (world.terrain.isWater(plane.x)) {
    ditchPlane(world, plane);
    return;
  }
  const stillFlying = isAirborne(plane);
  const stalled = plane.state === 'stalled';
  explode(world, plane.x, plane.y, plane.vx, plane.vy, 'small');
  world.terrain.carve(plane.x, 3, world.tick);
  world.events.push({
    type: 'crater',
    x: plane.x,
    y: world.terrain.heightAt(plane.x),
    cause: 'crash',
    by: plane.side,
  });
  if (stillFlying && !plane.ghost) scorePlaneLost(world, plane.side);

  const atHome =
    Math.abs(plane.x - plane.base.x) < NEAR_HOME &&
    Math.abs(plane.y - world.terrain.heightAt(plane.base.x)) < NEAR_HOME;
  world.events.push({
    type: 'crash',
    plane: plane.id,
    side: plane.side,
    x: plane.x,
    y: plane.y,
    atHome,
    stalled,
  });
  // Nose into the dirt.
  plane.heading = wrapHeading(plane.heading + (cosine(plane.heading) >= 0 ? -2 : 2) * CLASSIC_STEP);
  plane.state = 'crashed';
  plane.wounded = false;
  plane.homing = false;
  plane.vx = 0;
  plane.vy = 0;
  plane.speed = 0;
  plane.stateTimer = movesToTicks(atHome ? CRASH_AT_HOME_MOVES : CRASH_MOVES);
}

/**
 * Into the sea: a splash where a crater would be, and the plane sinks. A
 * pilot who came down under control (put down on the water, or over the
 * side from a deck) near one of their side's destroyers is fished out;
 * shot down, or with nobody near, it is a crash like any other. Either way
 * the plane is lost.
 */
export function ditchPlane(world: World, plane: Plane) {
  const sea = world.map.sea?.level ?? plane.y;
  const underControl = plane.state !== 'falling' && plane.state !== 'crashed';
  const rescuer = underControl ? rescuerNear(world, plane.side, plane.x) : null;
  world.events.push({ type: 'splash', x: plane.x, y: sea, size: 'large' });
  world.events.push({
    type: 'ditched',
    plane: plane.id,
    side: plane.side,
    x: plane.x,
    y: sea,
    rescuedBy: rescuer ? rescuer.id : null,
  });
  // A plane already falling was paid for when it was brought down.
  if (plane.state !== 'falling' && !plane.ghost) scorePlaneLost(world, plane.side);
  plane.state = 'crashed';
  plane.y = sea;
  plane.wounded = false;
  plane.homing = false;
  plane.vx = 0;
  plane.vy = 0;
  plane.speed = 0;
  plane.sink = 0;
  plane.deckSpeed = 0;
  plane.stateTimer = movesToTicks(CRASH_MOVES);
}
