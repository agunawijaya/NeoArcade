import { describe, expect, it } from 'vitest';
import { BULLET_LIFE_MOVES, MAX_ROUNDS, TICKS_PER_MOVE } from './constants';
import { HALF_TURN, LEFT, RIGHT } from './trig';
import { airborne, cpuSeat, flatMap, HUMAN, run, testWorld } from './test-worlds';
import { fireWeapons } from './weapons';
import type { Plane } from './world';

const MOVE = TICKS_PER_MOVE;

describe('guns', () => {
  it('fire one bullet a move at the plane’s speed plus the gun’s, along the nose', () => {
    const world = testWorld();
    const plane = world.planes[0] as Plane;
    airborne(world, plane, 600, 120, RIGHT, 6);
    run(world, 1, { fire: true });
    const [shot] = world.shots;
    expect(shot).toBeDefined();
    expect(shot?.vx).toBeCloseTo((6 + world.tuning.bulletSpeed) / MOVE);
    expect(shot?.vy).toBeCloseTo(0);
    run(world, 4 * MOVE - 1, { fire: true });
    expect(MAX_ROUNDS - plane.rounds).toBe(4);
  });

  it('let bullets fly for ten moves and stop when the rounds run out', () => {
    const world = testWorld();
    const plane = world.planes[0] as Plane;
    airborne(world, plane, 600, 150, RIGHT, 6);
    run(world, 1, { fire: true });
    run(world, BULLET_LIFE_MOVES * MOVE + 1);
    expect(world.shots).toHaveLength(0);
    plane.rounds = 0;
    run(world, MOVE, { fire: true });
    expect(world.shots).toHaveLength(0);
  });

  it('never run dry for the computer, as in 1984', () => {
    const world = testWorld(flatMap(), {}, [HUMAN, cpuSeat()]);
    const cpu = world.planes[1] as Plane;
    airborne(world, cpu, 900, 150, LEFT, 6);
    cpu.rounds = 0;
    cpu.controls = { ...cpu.controls, fire: true };
    fireWeapons(world, cpu);
    expect(world.shots).toHaveLength(1);
  });
});

describe('bombs', () => {
  it('drop one every ten moves with the plane’s motion, arc over and dig a crater', () => {
    const world = testWorld();
    const plane = world.planes[0] as Plane;
    airborne(world, plane, 600, 120, RIGHT, 6);
    run(world, 1, { bomb: true });
    expect(world.bombs).toHaveLength(1);
    const bomb = world.bombs[0];
    expect(bomb?.vx).toBeCloseTo(plane.vx);
    run(world, 9 * MOVE - 2, { bomb: true });
    expect(world.bombs.length).toBe(1);
    const before = world.terrain.revision;
    const events = run(world, 200);
    expect(events.some((event) => event.type === 'crater')).toBe(true);
    expect(world.terrain.revision).toBeGreaterThan(before);
  });

  it('fall steeper and slower sideways as they drop', () => {
    const world = testWorld();
    const plane = world.planes[0] as Plane;
    airborne(world, plane, 600, 190, RIGHT, 8);
    run(world, 1, { bomb: true });
    const bomb = world.bombs[0];
    const firstVx = bomb?.vx ?? 0;
    run(world, 30 * MOVE);
    expect(bomb?.vy).toBeLessThan(-1);
    expect(bomb?.vx).toBeLessThan(firstVx);
  });
});

describe('secret weapons', () => {
  it('stay locked until the Secret Hangar is open', () => {
    const world = testWorld();
    const plane = world.planes[0] as Plane;
    airborne(world, plane, 600, 120, RIGHT, 6);
    run(world, 5, { missile: true, starburst: true });
    expect(world.missiles).toHaveLength(0);
    expect(world.bursts).toHaveLength(0);
  });

  it('send a missile after the nearest enemy ahead, and a starburst draws it away', () => {
    const world = testWorld(flatMap(), { secretWeapons: true }, [HUMAN, cpuSeat()]);
    const [plane, enemy] = world.planes as [Plane, Plane];
    airborne(world, plane, 600, 120, RIGHT, 6);
    airborne(world, enemy, 760, 150, RIGHT, 6);
    enemy.pilot = { ...enemy.pilot, kind: 'human' };
    run(world, 1, { missile: true });
    const missile = world.missiles[0];
    expect(missile?.quarry).toBe(enemy.id);
    run(world, 20);
    expect(missile?.heading).toBeGreaterThan(0);
    expect(missile?.heading).toBeLessThan(HALF_TURN);
  });

  it('make the plane wait between starbursts (1984 put the delay on the starburst instead)', () => {
    const world = testWorld(flatMap(), { secretWeapons: true });
    const plane = world.planes[0] as Plane;
    airborne(world, plane, 600, 150, RIGHT, 6);
    run(world, 3, { starburst: true });
    expect(world.bursts).toHaveLength(1);
    expect(plane.decoy).toBe(world.bursts[0]?.id);
    run(world, 5 * MOVE, { starburst: true });
    expect(world.bursts).toHaveLength(2);
  });
});

describe('targets firing back', () => {
  const field = () => flatMap({ targets: [{ kind: 'hangar', side: 1, x: 800 }] });

  it('hold fire in the first round', () => {
    const world = testWorld(field(), { round: 0 });
    const plane = world.planes[0] as Plane;
    airborne(world, plane, 790, 80, RIGHT, 4);
    const events = run(world, 20 * MOVE);
    expect(events.some((event) => event.type === 'target-gun')).toBe(false);
  });

  it('shoot every other move in the second round, within a range that grows each round', () => {
    const world = testWorld(field(), { round: 1 });
    const plane = world.planes[0] as Plane;
    airborne(world, plane, 760, 75, RIGHT, 0);
    plane.state = 'stalled';
    const events = run(world, 4 * MOVE);
    const shots = events.filter((event) => event.type === 'target-gun').length;
    expect(shots).toBe(2);
    expect(world.tuning.targetRange).toBe(75);
  });

  it('shoot every move from the third round', () => {
    const world = testWorld(field(), { round: 2 });
    const plane = world.planes[0] as Plane;
    airborne(world, plane, 760, 75, RIGHT, 0);
    plane.state = 'stalled';
    const events = run(world, 4 * MOVE);
    expect(events.filter((event) => event.type === 'target-gun').length).toBe(4);
  });
});
