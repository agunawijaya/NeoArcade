import { describe, expect, it } from 'vitest';
import { TICKS_PER_MOVE } from './constants';
import { LEVEL_STYLES } from './cpu';
import { generateMap } from './map';
import { CLASSIC_RULES, MODERN_RULES } from './rules';
import { createWorld, step } from './sim';
import { LEFT, RIGHT } from './trig';
import { airborne, cpuSeat, flatMap, HUMAN, testWorld } from './test-worlds';
import type { Plane, World } from './world';

const MOVE = TICKS_PER_MOVE;

function runCpu(world: World, ticks: number) {
  const events: World['events'] = [];
  for (let tick = 0; tick < ticks; tick++) {
    step(world, []);
    events.push(...world.events);
  }
  return events;
}

describe('computer pilots', () => {
  it('stay on the ground while nobody comes into their stretch of the world', () => {
    const world = testWorld(flatMap(), {}, [
      HUMAN,
      {
        ...cpuSeat(),
        pilot: { kind: 'cpu', level: 'normal', territory: { left: 1000, right: 1500 } },
      },
    ]);
    const [plane, cpu] = world.planes as [Plane, Plane];
    airborne(world, plane, 600, 150, RIGHT, 6);
    plane.pilot = { ...plane.pilot, kind: 'cpu', territory: { left: 0, right: 0 } };
    runCpu(world, 40);
    expect(cpu.state).toBe('parked');
  });

  it('take off and climb away safely when an enemy appears', () => {
    const world = testWorld(flatMap(), {}, [HUMAN, cpuSeat()]);
    const [plane, cpu] = world.planes as [Plane, Plane];
    airborne(world, plane, 900, 170, RIGHT, 6);
    plane.pilot = { ...plane.pilot, kind: 'cpu', territory: { left: 0, right: 0 } };
    runCpu(world, 200);
    expect(cpu.state).toBe('flying');
    expect(cpu.y - world.terrain.heightAt(cpu.x)).toBeGreaterThan(14);
  });

  it('open fire when a bullet would land', () => {
    const world = testWorld(flatMap(), {}, [HUMAN, cpuSeat()]);
    const [plane, cpu] = world.planes as [Plane, Plane];
    airborne(world, plane, 760, 150, RIGHT, 5);
    airborne(world, cpu, 700, 150, RIGHT, 6);
    plane.pilot = { ...plane.pilot, kind: 'cpu', territory: { left: 0, right: 0 } };
    const events = runCpu(world, 3 * MOVE);
    expect(events.some((event) => event.type === 'gun' && event.plane === cpu.id)).toBe(true);
  });

  it('think every other move at Easy, every move at Normal and Hard, and faster at Brutal', () => {
    expect(LEVEL_STYLES.easy.thinkTicks).toBe(2 * MOVE);
    expect(LEVEL_STYLES.normal.thinkTicks).toBe(MOVE);
    expect(LEVEL_STYLES.brutal.thinkTicks).toBeLessThan(MOVE);
    expect(LEVEL_STYLES.hard.lookAhead).toBe(2);
    // The 1984 pixel nudge survives only as the Brutal pilot's trait.
    expect(
      Object.entries(LEVEL_STYLES)
        .filter(([, style]) => style.nudges)
        .map(([level]) => level),
    ).toEqual(['brutal']);
  });

  it.each([
    ['classic', CLASSIC_RULES],
    ['smooth', MODERN_RULES],
  ] as const)(
    'rarely fly themselves into the ground over a long fight (%s flight)',
    (_name, rules) => {
      let crashes = 0;
      let sorties = 0;
      for (const level of ['easy', 'normal', 'hard', 'brutal'] as const) {
        const map = generateMap({ seed: 11 });
        const world = createWorld({
          map,
          rules,
          seed: 5,
          seats: [
            {
              side: 0,
              pilot: { kind: 'cpu', level: 'normal', territory: null },
              base: 0,
              maxCrashes: Number.POSITIVE_INFINITY,
            },
            {
              side: 1,
              pilot: { kind: 'cpu', level, territory: null },
              base: 1,
              maxCrashes: Number.POSITIVE_INFINITY,
            },
          ],
        });
        const events = runCpu(world, 6000);
        crashes += events.filter(
          (event) => event.type === 'crash' && !wasShotDown(events, event.plane),
        ).length;
        sorties += events.filter((event) => event.type === 'takeoff').length;
      }
      expect(sorties).toBeGreaterThan(0);
      expect(crashes).toBeLessThanOrEqual(sorties);
    },
  );

  it('fly round a flock at Brutal, where Hard flies through it', () => {
    const birdStrikes = (level: 'hard' | 'brutal') => {
      const world = testWorld(flatMap(), MODERN_RULES, [HUMAN, cpuSeat(level)]);
      const [plane, cpu] = world.planes as [Plane, Plane];
      airborne(world, plane, 1150, 120, RIGHT, 0);
      plane.state = 'stalled';
      plane.pilot = { ...plane.pilot, kind: 'cpu', territory: { left: 0, right: 0 } };
      airborne(world, cpu, 700, 120, RIGHT, 7);
      world.flocks.push({ id: 900, x: 765, y: 135, vx: 0 });
      return runCpu(world, 60).filter(
        (event) =>
          (event.type === 'plane-wounded' || event.type === 'plane-down') && event.plane === cpu.id,
      ).length;
    };
    expect(birdStrikes('hard')).toBeGreaterThan(0);
    expect(birdStrikes('brutal')).toBe(0);
  });

  it('chase the enemy rather than wander off', () => {
    const world = testWorld(flatMap({ width: 2400 }), {}, [HUMAN, cpuSeat('hard')]);
    const [plane, cpu] = world.planes as [Plane, Plane];
    airborne(world, plane, 1500, 160, LEFT, 0);
    plane.state = 'stalled';
    airborne(world, cpu, 900, 120, RIGHT, 6);
    plane.pilot = { ...plane.pilot, kind: 'cpu', territory: { left: 0, right: 0 } };
    const start = Math.abs(cpu.x - plane.x);
    runCpu(world, 40);
    expect(Math.abs(cpu.x - plane.x)).toBeLessThan(start);
  });
});

function wasShotDown(events: World['events'], plane: number): boolean {
  return events.some((event) => event.type === 'plane-down' && event.plane === plane);
}
