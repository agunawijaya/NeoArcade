import { describe, expect, it } from 'vitest';
import { CEILING, MAX_BOMBS, MAX_FUEL, REFUEL_PER_MOVE, TICKS_PER_MOVE } from './constants';
import { MAX_TURN_RATE } from './flight';
import { CLASSIC_STEP, DOWN, LEFT, RIGHT, UP, sine } from './trig';
import { airborne, flatMap, run, testWorld } from './test-worlds';
import type { Plane } from './world';

const MOVE = TICKS_PER_MOVE;

function player(world: ReturnType<typeof testWorld>): Plane {
  return world.planes[0] as Plane;
}

/** Ticks until the next move boundary has been processed. */
function toNextMove(world: ReturnType<typeof testWorld>): number {
  return MOVE - (world.tick % MOVE);
}

describe('taking off', () => {
  it('waits on the runway until the pilot touches something, then leaps to flying speed', () => {
    const world = testWorld();
    const plane = player(world);
    run(world, 30);
    expect(plane.state).toBe('parked');
    const events = run(world, 1, { throttle: 1 });
    expect(plane.state).toBe('flying');
    expect(plane.speed).toBe(world.tuning.minSpeed);
    expect(plane.heading).toBe(RIGHT);
    expect(events.some((event) => event.type === 'takeoff')).toBe(true);
  });

  it('rolls along the runway without crashing until it pulls up', () => {
    const world = testWorld();
    const plane = player(world);
    run(world, 40, { throttle: 1 });
    expect(plane.state).toBe('flying');
    expect(plane.x).toBeGreaterThan(410);
    run(world, 20, { throttle: 1, pitch: 1 });
    expect(plane.y).toBeGreaterThan(world.terrain.heightAt(plane.x) + 6);
  });
});

describe('classic steering', () => {
  it('turns one sixteenth of a circle per move, the other way when rolled over', () => {
    const world = testWorld();
    const plane = player(world);
    airborne(world, plane, 600, 120, RIGHT, 6);
    run(world, toNextMove(world), { pitch: 1 });
    expect(plane.heading).toBe(CLASSIC_STEP);
    run(world, MOVE, { pitch: 1 });
    expect(plane.heading).toBe(2 * CLASSIC_STEP);
    plane.inverted = true;
    run(world, MOVE, { pitch: 1 });
    expect(plane.heading).toBe(CLASSIC_STEP);
  });

  it('remembers a tap between moves until the next move', () => {
    const world = testWorld();
    const plane = player(world);
    airborne(world, plane, 600, 120, RIGHT, 6);
    run(world, toNextMove(world));
    run(world, 1, { flip: true });
    expect(plane.inverted).toBe(false);
    run(world, MOVE - 1);
    expect(plane.inverted).toBe(true);
  });

  it('answers a wounded pilot only every other move', () => {
    const world = testWorld();
    const plane = player(world);
    airborne(world, plane, 600, 120, RIGHT, 6);
    plane.wounded = true;
    run(world, toNextMove(world));
    run(world, 4 * MOVE, { pitch: 1 });
    expect(plane.heading).toBe(2 * CLASSIC_STEP);
  });
});

describe('smooth steering', () => {
  it('eases into a turn and never turns faster than classic', () => {
    const world = testWorld(flatMap(), { flight: 'smooth' });
    const plane = player(world);
    airborne(world, plane, 600, 120, RIGHT, 6);
    run(world, 1, { pitch: 1 });
    expect(plane.turnRate).toBeCloseTo(MAX_TURN_RATE / 5);
    run(world, 30, { pitch: 1 });
    expect(plane.turnRate).toBeCloseTo(MAX_TURN_RATE);
    expect(MAX_TURN_RATE * MOVE).toBe(CLASSIC_STEP);
  });

  it('halves the authority of a wounded pilot', () => {
    const world = testWorld(flatMap(), { flight: 'smooth' });
    const plane = player(world);
    airborne(world, plane, 600, 120, RIGHT, 6);
    plane.wounded = true;
    run(world, 30, { pitch: 1 });
    expect(plane.turnRate).toBeCloseTo(MAX_TURN_RATE / 2);
  });

  it('rolls an upside-down plane upright once the pilot lets go', () => {
    const world = testWorld(flatMap(), { flight: 'smooth', autoRoll: true });
    const plane = player(world);
    airborne(world, plane, 600, 120, RIGHT, 6);
    plane.inverted = true;
    run(world, 30, { throttle: 1 });
    expect(plane.inverted).toBe(false);
  });
});

describe('speed and gravity', () => {
  it('creeps one unit every four moves towards slowest speed plus throttle plus the dive', () => {
    const world = testWorld();
    const plane = player(world);
    airborne(world, plane, 600, 190, DOWN, world.tuning.minSpeed);
    plane.throttle = 0;
    // Straight down, idle throttle: the 1984 gravity table adds four.
    run(world, 4 * 4 * MOVE + 2 * MOVE);
    expect(plane.speed).toBe(world.tuning.minSpeed + 4);
  });

  it('loses speed climbing and gains it diving, a quarter of the gravity per sixteenth of steepness', () => {
    const world = testWorld();
    const plane = player(world);
    airborne(world, plane, 600, 60, 2 * CLASSIC_STEP, world.tuning.minSpeed + 4);
    plane.throttle = 4;
    run(world, 12 * MOVE);
    expect(plane.speed).toBe(world.tuning.minSpeed + 4 - 2);
  });

  it('stalls an expert plane that falls below flying speed: it only ever gets slower', () => {
    const world = testWorld();
    const plane = player(world);
    airborne(world, plane, 600, 90, 3 * CLASSIC_STEP, world.tuning.minSpeed);
    plane.throttle = 0;
    const events = run(world, 24 * MOVE);
    expect(plane.y).toBeLessThan(CEILING);
    expect(events.some((event) => event.type === 'stall')).toBe(true);
  });

  it('stalls at the ceiling, and a stalled plane drops straight down', () => {
    const world = testWorld();
    const plane = player(world);
    airborne(world, plane, 600, CEILING - 1, UP, 8);
    plane.throttle = 4;
    const events = run(world, 3);
    expect(events.some((event) => event.type === 'stall')).toBe(true);
    expect(plane.state).toBe('stalled');
    run(world, 8 * MOVE);
    expect(plane.vx).toBe(0);
    expect(plane.vy).toBeLessThan(0);
  });

  it('tumbles from side to side every six moves until the nose points down and speed returns', () => {
    const world = testWorld();
    const plane = player(world);
    airborne(world, plane, 600, CEILING, RIGHT, 6);
    run(world, 1);
    expect(plane.state).toBe('stalled');
    const first = plane.heading;
    run(world, 6 * MOVE);
    expect(plane.heading).not.toBe(first);
    expect(sine(plane.heading)).toBeLessThan(0);
    // Push the nose straight down and let the speed build.
    plane.heading = DOWN;
    const events = run(world, 30 * MOVE, { throttle: 1 });
    expect(events.some((event) => event.type === 'recovered')).toBe(true);
    expect(plane.state).toBe('flying');
  });

  it('never stalls a novice: the ceiling turns the nose down instead', () => {
    const world = testWorld(flatMap(), { expert: false });
    const plane = player(world);
    airborne(world, plane, 600, CEILING, UP, 6);
    run(world, 1);
    expect(plane.state).toBe('flying');
    expect(plane.heading).toBe(DOWN);
  });
});

describe('fuel', () => {
  it('burns fuel by speed and falls out of the sky when the tank is dry', () => {
    const world = testWorld();
    const plane = player(world);
    airborne(world, plane, 600, 150, RIGHT, 6);
    const before = plane.fuel;
    run(world, 10 * MOVE);
    expect(before - plane.fuel).toBeGreaterThan(50);
    plane.fuel = 1;
    const events = run(world, MOVE);
    expect(events.some((event) => event.type === 'plane-down' && event.cause === 'fuel')).toBe(
      true,
    );
    expect(plane.state).toBe('falling');
  });

  it('tops up a parked plane a little each move, bombs every twenty moves', () => {
    const world = testWorld();
    const plane = player(world);
    plane.fuel = 0;
    plane.bombs = 0;
    run(world, 10 * MOVE);
    expect(plane.fuel).toBe(10 * REFUEL_PER_MOVE);
    run(world, 200 * MOVE);
    expect(plane.fuel).toBe(MAX_FUEL);
    expect(plane.bombs).toBe(MAX_BOMBS);
  });
});

describe('landing', () => {
  it('settles onto its own runway when level, slow and throttled back, then parks', () => {
    const world = testWorld();
    const plane = player(world);
    const runway = world.terrain.heightAt(400);
    // A gentle three-degree glide.
    airborne(world, plane, 390, runway + 5, RIGHT - 36, world.tuning.minSpeed);
    plane.throttle = 0;
    const events = run(world, 120);
    expect(events.some((event) => event.type === 'landed')).toBe(true);
    expect(plane.state).toBe('parked');
  });

  it('crashes instead when it comes down nose first', () => {
    const world = testWorld();
    const plane = player(world);
    const runway = world.terrain.heightAt(400);
    airborne(world, plane, 420, runway + 10, DOWN, 6);
    const events = run(world, 30);
    expect(events.some((event) => event.type === 'crash')).toBe(true);
  });
});

describe('crashing', () => {
  it('leaves a crater and a wreck, then wheels out the next plane at home', () => {
    const world = testWorld();
    const plane = player(world);
    airborne(world, plane, 800, 60, DOWN + CLASSIC_STEP, 8);
    const before = world.terrain.heightAt(800);
    const events = run(world, 40);
    const crash = events.find((event) => event.type === 'crash');
    expect(crash).toBeDefined();
    expect(world.terrain.revision).toBeGreaterThan(0);
    expect(
      Math.min(...[790, 795, 800, 805, 810].map((x) => world.terrain.heightAt(x))),
    ).toBeLessThan(before);
    run(world, 12 * MOVE);
    expect(plane.state).toBe('parked');
    expect(plane.crashes).toBe(1);
  });

  it('sits longer when it crashed at home, and runs out of planes after five crashes', () => {
    const world = testWorld();
    const plane = player(world);
    for (let crash = 0; crash < 5; crash++) {
      airborne(world, plane, 410, world.terrain.heightAt(410) + 12, LEFT + CLASSIC_STEP, 8);
      run(world, 30);
      expect(plane.state).toBe('crashed');
      expect(plane.stateTimer).toBeGreaterThan(10 * MOVE);
      run(world, 21 * MOVE);
    }
    expect(plane.state).toBe('out');
  });
});

describe('falling', () => {
  it('steepens a unit every five moves, longer when the pilot pulls up', () => {
    const glide = (pitch: number) => {
      const world = testWorld();
      const plane = player(world);
      airborne(world, plane, 600, 190, RIGHT, 6);
      plane.state = 'falling';
      plane.stateTimer = 10;
      plane.vx = 1.2;
      plane.vy = -0.2;
      run(world, 40 * MOVE, { pitch });
      return plane.x;
    };
    expect(glide(1)).toBeGreaterThan(glide(0));
    expect(glide(0)).toBeGreaterThan(glide(-1));
  });
});
