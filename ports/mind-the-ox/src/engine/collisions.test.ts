import { describe, expect, it } from 'vitest';
import {
  PENALTY_BIRD,
  PENALTY_OX,
  SCORE_DEPOT,
  SCORE_PLANE,
  SCORE_TARGET,
  TICKS_PER_MOVE,
} from './constants';
import { explode } from './debris';
import { DOWN, LEFT, RIGHT } from './trig';
import { airborne, cpuSeat, flatMap, HUMAN, run, testWorld } from './test-worlds';
import { nextId, type Plane, type World } from './world';

const MOVE = TICKS_PER_MOVE;

function shootAt(world: World, plane: Plane, side: 0 | 1 = 1) {
  world.shots.push({
    id: nextId(world),
    owner: { side, plane: null },
    x: plane.x - 1,
    y: plane.y,
    vx: 0.5,
    vy: 0,
    life: 20,
  });
}

describe('planes getting hurt', () => {
  it('a first bullet only wounds; a second brings the plane down', () => {
    const world = testWorld();
    const plane = world.planes[0] as Plane;
    airborne(world, plane, 600, 150, RIGHT, 6);
    shootAt(world, plane);
    const first = run(world, 1);
    expect(plane.wounded).toBe(true);
    expect(plane.state).toBe('flying');
    expect(first.some((event) => event.type === 'splat' && event.kind === 'hole')).toBe(true);
    shootAt(world, plane);
    const second = run(world, 1);
    expect(plane.state).toBe('falling');
    expect(second.some((event) => event.type === 'plane-down')).toBe(true);
  });

  it('cannot be hit by its own bullets', () => {
    const world = testWorld();
    const plane = world.planes[0] as Plane;
    airborne(world, plane, 600, 150, RIGHT, 6);
    run(world, 3 * MOVE, { fire: true });
    expect(plane.wounded).toBe(false);
  });

  it('two planes that collide both fall, carrying their shared momentum', () => {
    const world = testWorld(flatMap(), {}, [HUMAN, cpuSeat()]);
    const [plane, enemy] = world.planes as [Plane, Plane];
    airborne(world, plane, 700, 150, RIGHT, 6);
    airborne(world, enemy, 712, 150, LEFT, 6);
    run(world, 2);
    expect(plane.state).toBe('falling');
    expect(enemy.state).toBe('falling');
    expect(Math.abs(plane.vx + enemy.vx)).toBeLessThan(0.5);
  });

  it('wreckage from an explosion brings down a plane that flies into it', () => {
    const world = testWorld();
    const plane = world.planes[0] as Plane;
    airborne(world, plane, 600, 150, RIGHT, 6);
    explode(world, 604, 150, 0, 0, 'large');
    run(world, 2);
    expect(plane.state).toBe('falling');
  });
});

describe('birds and oxen', () => {
  it('a bird splats on the goggles, wounds the plane and costs 25', () => {
    const world = testWorld();
    const plane = world.planes[0] as Plane;
    airborne(world, plane, 600, 150, RIGHT, 6);
    world.birds.push({
      id: nextId(world),
      x: 604,
      y: 150,
      vx: 0,
      vy: 0,
      wander: 999,
      leavesIn: null,
    });
    const events = run(world, 1);
    expect(events.some((event) => event.type === 'splat' && event.kind === 'bird')).toBe(true);
    expect(plane.wounded).toBe(true);
    expect(world.birds).toHaveLength(0);
    expect(world.score[0]).toBe(-PENALTY_BIRD);
  });

  it('flying through a flock scatters it into eight birds', () => {
    const world = testWorld();
    const plane = world.planes[0] as Plane;
    airborne(world, plane, 600, 150, RIGHT, 6);
    world.flocks.push({ id: nextId(world), x: 606, y: 150, vx: 0 });
    run(world, 1);
    expect(world.flocks).toHaveLength(0);
    expect(world.birds.length).toBe(8);
  });

  it('shooting an ox costs 200, and so does flying into one, which also wounds', () => {
    const world = testWorld(flatMap({ oxen: [800, 1000] }));
    const plane = world.planes[0] as Plane;
    const [ox, other] = world.oxen;
    world.shots.push({
      id: nextId(world),
      owner: { side: 0, plane: plane.id },
      x: (ox?.x ?? 0) - 8,
      y: (ox?.y ?? 0) + 4,
      vx: 3,
      vy: 0,
      life: 20,
    });
    run(world, 4);
    expect(ox?.alive).toBe(false);
    expect(world.score[0]).toBe(-PENALTY_OX);
    airborne(world, plane, (other?.x ?? 0) - 9, (other?.y ?? 40) + 6, RIGHT, 6);
    run(world, 2);
    expect(other?.alive).toBe(false);
    expect(plane.wounded).toBe(true);
    expect(world.score[0]).toBe(-2 * PENALTY_OX);
  });
});

describe('targets', () => {
  const field = () =>
    flatMap({
      targets: [
        { kind: 'hangar', side: 1, x: 800 },
        { kind: 'depot', side: 1, x: 900 },
        { kind: 'factory', side: 0, x: 300 },
      ],
    });

  it('soak up bullets: each adds ten, time heals one a move, and it falls past ten per round', () => {
    const world = testWorld(field());
    const [hangar] = world.targets;
    if (!hangar) throw new Error('no hangar');
    const hit = () => {
      world.shots.push({
        id: nextId(world),
        owner: { side: 0, plane: 99 },
        x: hangar.x - 1,
        y: hangar.y + 3,
        vx: 0.4,
        vy: 0,
        life: 20,
      });
      run(world, 1);
    };
    hit();
    expect(hangar.standing).toBe(true);
    hit();
    expect(hangar.standing).toBe(false);
    expect(world.score[0]).toBe(SCORE_TARGET);
  });

  it('need more hits in later rounds', () => {
    const world = testWorld(field(), { round: 2 });
    const [hangar] = world.targets;
    if (!hangar) throw new Error('no hangar');
    for (let shot = 0; shot < 3; shot++) {
      world.shots.push({
        id: nextId(world),
        owner: { side: 0, plane: 99 },
        x: hangar.x - 1,
        y: hangar.y + 3,
        vx: 0.4,
        vy: 0,
        life: 20,
      });
      run(world, 1);
    }
    expect(hangar.standing).toBe(true);
    world.shots.push({
      id: nextId(world),
      owner: { side: 0, plane: 99 },
      x: hangar.x - 1,
      y: hangar.y + 3,
      vx: 0.4,
      vy: 0,
      life: 20,
    });
    run(world, 1);
    expect(hangar.standing).toBe(false);
  });

  it('go at once to a bomb; a depot scores double and blows up bigger', () => {
    const world = testWorld(field());
    const plane = world.planes[0] as Plane;
    const depot = world.targets[1];
    airborne(world, plane, 855, 90, RIGHT, 4);
    const events = run(world, 1, { bomb: true });
    events.push(...run(world, 120));
    expect(depot?.standing).toBe(false);
    expect(events.some((event) => event.type === 'explosion' && event.size === 'huge')).toBe(true);
    expect(world.score[0]).toBe(SCORE_DEPOT);
  });

  it('cost the player when it is one of their own', () => {
    const world = testWorld(field());
    const plane = world.planes[0] as Plane;
    airborne(world, plane, 255, 90, RIGHT, 4);
    run(world, 1, { bomb: true });
    run(world, 120);
    expect(world.targets[2]?.standing).toBe(false);
    expect(world.score[0]).toBe(-SCORE_TARGET);
  });

  it('a plane flown into a target destroys it, and itself', () => {
    const world = testWorld(field());
    const plane = world.planes[0] as Plane;
    const hangar = world.targets[0];
    airborne(world, plane, 790, (hangar?.y ?? 40) + 8, RIGHT, 6);
    run(world, 3);
    expect(hangar?.standing).toBe(false);
    expect(plane.state === 'falling' || plane.state === 'crashed').toBe(true);
  });
});

describe('scoring planes', () => {
  it('pays fifty for an enemy plane and charges fifty for losing one', () => {
    const world = testWorld(flatMap(), {}, [HUMAN, cpuSeat()]);
    const [plane, enemy] = world.planes as [Plane, Plane];
    airborne(world, enemy, 900, 150, LEFT, 6);
    enemy.wounded = true;
    shootAt(world, enemy, 0);
    run(world, 1);
    expect(world.score[0]).toBe(SCORE_PLANE);
    airborne(world, plane, 600, 60, DOWN, 8);
    run(world, 40);
    expect(world.score[0]).toBe(0);
  });
});
