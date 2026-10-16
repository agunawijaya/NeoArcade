import { BULLET_LIFE_MOVES, TICKS_PER_MOVE, movesToTicks, perTick } from './constants';
import { explode } from './debris';
import { SHIP_CLASSES } from './fleet';
import { EDGE_WIDTH, type RaiderKind, type Side } from './map';
import { scoreRaiderDown } from './scoring';
import { damageShip, isAfloat, shipAtIndex, shipById } from './ships';
import { isSpotted } from './sight';
import { nextId, type Plane, type Raider, type World } from './world';

/**
 * The bombers and airships of a raid: how fast they come, what they can
 * take, how far their gunners reach and how often they fire, how many
 * bombs' worth of damage they bring, and their size for collisions.
 */
export interface RaiderClass {
  speed: number;
  hitPoints: number;
  gunRange: number;
  gunEveryMoves: number;
  /** Blows of a raid's bombs on the ship they reach. */
  load: number;
  length: number;
  radius: number;
}

export const RAIDER_CLASSES: Readonly<Record<RaiderKind, RaiderClass>> = {
  bomber: {
    speed: 2.6,
    hitPoints: 5,
    gunRange: 80,
    gunEveryMoves: 8,
    load: 1,
    length: 18,
    radius: 4,
  },
  zeppelin: {
    speed: 1.3,
    hitPoints: 26,
    gunRange: 100,
    gunEveryMoves: 5,
    load: 2,
    length: 72,
    radius: 10,
  },
};

/** Bombers in a wave fly this far apart, one behind the other, and a little stepped up. */
const WAVE_SPACING = 46;
const WAVE_STEP = 6;
/** Over the ship to within this, they let their bombs go. */
const BOMB_RELEASE = 10;
/** A raider brought down falls this fast at the most, units a move. */
const FALL_SPEED = 6;
const GUNNER_SCATTER = 12;

/** Sends each raid in on its move: a wave of bombers, or an airship, heading for its ship. */
export function sendRaids(world: World) {
  if (world.tick % TICKS_PER_MOVE !== 0) return;
  const move = world.tick / TICKS_PER_MOVE;
  for (const raid of world.map.raids) {
    if (raid.at !== move) continue;
    const target = shipAtIndex(world, raid.target);
    if (!target || !isAfloat(target)) continue;
    const direction = target.x >= raid.x ? 1 : -1;
    const kind = RAIDER_CLASSES[raid.kind];
    for (let index = 0; index < raid.count; index++) {
      world.raiders.push({
        id: nextId(world),
        kind: raid.kind,
        side: raid.side,
        x: raid.x - direction * index * WAVE_SPACING,
        y: raid.altitude + index * WAVE_STEP,
        vx: perTick(kind.speed) * direction,
        vy: 0,
        direction,
        hitPoints: kind.hitPoints,
        state: 'inbound',
        target: target.id,
        gunCooldown: movesToTicks(kind.gunEveryMoves) + index * 3,
        lastHitBy: null,
      });
    }
    world.events.push({
      type: 'raid',
      side: raid.side,
      kind: raid.kind,
      x: raid.x,
      count: raid.count,
    });
  }
}

/**
 * Inbound raiders hold their height and course for the ship; over it they
 * bomb, and fly on out of the battle. One shot down falls into the sea.
 */
export function moveRaiders(world: World) {
  world.raiders = world.raiders.filter((raider) => {
    if (raider.state === 'falling') return fall(world, raider);
    raider.x += raider.vx;
    if (raider.state === 'inbound') bombIfOver(world, raider);
    return raider.x > EDGE_WIDTH / 2 && raider.x < world.map.width - EDGE_WIDTH / 2;
  });
}

function bombIfOver(world: World, raider: Raider) {
  const ship = shipById(world, raider.target);
  if (!ship || !isAfloat(ship)) {
    raider.state = 'outbound';
    return;
  }
  if (Math.abs(raider.x - ship.x) > BOMB_RELEASE) return;
  raider.state = 'outbound';
  world.events.push({
    type: 'raider-bombs',
    raider: raider.id,
    ship: ship.id,
    x: ship.x,
    y: ship.y,
  });
  const { load } = RAIDER_CLASSES[raider.kind];
  const deck = ship.y + SHIP_CLASSES[ship.kind].freeboard;
  // A stick of bombs falls a little apart along the deck.
  for (let blow = 0; blow < load; blow++)
    damageShip(world, ship, 'raid', raider.side, raider.x + (blow - (load - 1) / 2) * 8, deck);
}

function fall(world: World, raider: Raider): boolean {
  raider.vy = Math.max(-perTick(FALL_SPEED), raider.vy - perTick(1) / TICKS_PER_MOVE);
  raider.x += raider.vx;
  raider.y += raider.vy;
  const surface = world.terrain.heightAt(raider.x);
  if (raider.y > surface) return true;
  if (world.terrain.isWater(raider.x))
    world.events.push({ type: 'splash', x: raider.x, y: surface, size: 'large' });
  else explode(world, raider.x, surface, 0, 0, 'large');
  return false;
}

/** A hit on a raider; out of hit points it goes down, and whoever did it is paid. */
export function hitRaider(world: World, raider: Raider, damage: number, culprit: Side | null) {
  if (raider.state === 'falling') return;
  raider.hitPoints -= damage;
  if (culprit !== null) raider.lastHitBy = culprit;
  world.events.push({ type: 'raider-hit', raider: raider.id, x: raider.x, y: raider.y });
  if (raider.hitPoints > 0) return;
  raider.state = 'falling';
  explode(world, raider.x, raider.y, raider.vx, 0, raider.kind === 'zeppelin' ? 'huge' : 'small');
  world.events.push({
    type: 'raider-down',
    raider: raider.id,
    kind: raider.kind,
    side: raider.side,
    by: raider.lastHitBy,
    x: raider.x,
    y: raider.y,
  });
  if (raider.lastHitBy !== null && raider.lastHitBy !== raider.side)
    scoreRaiderDown(world, raider.kind, raider.lastHitBy);
}

/** The gunners in every raider shoot at the nearest enemy fighter they can see within reach. */
export function raidersFire(world: World) {
  for (const raider of world.raiders) {
    if (raider.state === 'falling') continue;
    raider.gunCooldown = Math.max(0, raider.gunCooldown - 1);
    if (raider.gunCooldown > 0) continue;
    const kind = RAIDER_CLASSES[raider.kind];
    const quarry = nearestFighter(world, raider, kind.gunRange);
    if (!quarry) continue;
    raider.gunCooldown = movesToTicks(kind.gunEveryMoves);
    let aimX = quarry.x + quarry.vx * movesToTicks(3) - raider.x;
    let aimY = quarry.y + quarry.vy * movesToTicks(3) - raider.y;
    aimX += world.rng.float(-GUNNER_SCATTER, GUNNER_SCATTER);
    aimY += world.rng.float(-GUNNER_SCATTER, GUNNER_SCATTER);
    const distance = Math.sqrt(aimX * aimX + aimY * aimY);
    if (distance < 1) continue;
    const speed = perTick(world.tuning.bulletSpeed);
    world.shots.push({
      id: nextId(world),
      owner: { side: raider.side, plane: null },
      x: raider.x,
      y: raider.y,
      vx: (aimX / distance) * speed + raider.vx,
      vy: (aimY / distance) * speed,
      life: movesToTicks(BULLET_LIFE_MOVES),
    });
    world.events.push({ type: 'raider-gun', raider: raider.id, x: raider.x, y: raider.y });
  }
}

function nearestFighter(world: World, raider: Raider, range: number): Plane | null {
  let best: Plane | null = null;
  let bestRange = range * range;
  for (const plane of world.planes) {
    if (plane.side === raider.side || plane.ghost) continue;
    if (plane.state !== 'flying' && plane.state !== 'stalled') continue;
    if (!isSpotted(world, plane, raider.x, raider.y)) continue;
    const dx = plane.x - raider.x;
    const dy = plane.y - raider.y;
    const distance = dx * dx + dy * dy;
    if (distance < bestRange) {
      best = plane;
      bestRange = distance;
    }
  }
  return best;
}
