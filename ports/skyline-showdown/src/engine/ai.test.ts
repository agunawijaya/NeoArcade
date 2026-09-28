import { createRng } from '@shared/rng';
import { describe, expect, it } from 'vitest';
import { createCpuMemory, observeThrow, planThrow, thinkingSeconds, type CpuLevel } from './ai';
import { createMatch } from './match';
import { simulateShot } from './shot';
import type { WorldChoice } from './worlds';

const GIVE_UP = 30;

interface Duel {
  throws: number;
  hit: boolean;
}

/** The CPU (player 1) throws at a patient opponent until it hits or gives up. */
function duel(level: CpuLevel, seed: number, world: WorldChoice): Duel {
  const state = createMatch({ seed, world, points: 3, format: 'firstTo', powerUps: [] });
  const memory = createCpuMemory();
  const rng = createRng(seed * 31 + 7);
  const { round } = state;
  for (let throws = 1; throws <= GIVE_UP; throws++) {
    const aim = planThrow(state, memory, level, rng);
    const shot = simulateShot(
      {
        terrain: round.terrain,
        gorillas: round.gorillas,
        wind: round.wind,
        gravity: round.world.gravity,
        balloon: null,
        shields: [false, false],
      },
      { thrower: 0, angle: aim.angle, velocity: aim.velocity, powerUp: null },
    );
    round.terrain = shot.terrain;
    observeThrow(memory, aim, shot, state);
    if (shot.victim !== null) return { throws, hit: shot.victim === 1 };
  }
  return { throws: GIVE_UP, hit: false };
}

function statistics(level: CpuLevel) {
  const duels = Array.from({ length: 160 }, (_, index) =>
    duel(level, index + 1, index % 2 === 0 ? 'earth' : 'random'),
  );
  const throws = duels.map((result) => result.throws).sort((a, b) => a - b);
  return {
    mean: throws.reduce((sum, value) => sum + value, 0) / throws.length,
    median: throws[Math.floor(throws.length / 2)] ?? GIVE_UP,
    firstThrow: duels.filter((result) => result.hit && result.throws === 1).length / duels.length,
    hitRate: duels.filter((result) => result.hit).length / duels.length,
  };
}

describe('CPU opponent', () => {
  const levels = (['easy', 'normal', 'hard', 'brutal'] as const).map((level) => ({
    level,
    ...statistics(level),
  }));
  const [easy, normal, hard, brutal] = levels as [
    (typeof levels)[number],
    (typeof levels)[number],
    (typeof levels)[number],
    (typeof levels)[number],
  ];

  it('gets better with each difficulty', () => {
    expect(easy.mean).toBeGreaterThan(normal.mean + 1.5);
    expect(normal.mean).toBeGreaterThan(hard.mean);
    expect(hard.mean).toBeGreaterThan(brutal.mean);
  });

  it('finds the target in a handful of throws on Normal', () => {
    expect(normal.median).toBeLessThanOrEqual(5);
    expect(normal.mean).toBeLessThan(7);
    expect(normal.hitRate).toBeGreaterThan(0.95);
  });

  it('is slower on Easy but still gets there', () => {
    expect(easy.median).toBeGreaterThanOrEqual(5);
    expect(easy.hitRate).toBeGreaterThan(0.85);
  });

  it('is deadly on Brutal but never sure of a first-throw hit', () => {
    expect(brutal.median).toBeLessThanOrEqual(3);
    expect(brutal.firstThrow).toBeGreaterThan(0);
    expect(brutal.firstThrow).toBeLessThan(0.35);
    for (const { firstThrow } of levels) expect(firstThrow).toBeLessThan(1);
  });

  it('adds hand shake, so the same situation gives different throws', () => {
    const state = createMatch({
      seed: 4,
      world: 'earth',
      points: 3,
      format: 'firstTo',
      powerUps: [],
    });
    const rng = createRng(1);
    const aims = Array.from({ length: 10 }, () =>
      planThrow(state, createCpuMemory(), 'brutal', rng),
    );
    expect(
      new Set(aims.map((aim) => `${aim.angle.toFixed(2)}/${aim.velocity}`)).size,
    ).toBeGreaterThan(5);
  });

  it('forgets its corrections when a new round starts', () => {
    const state = createMatch({
      seed: 9,
      world: 'earth',
      points: 3,
      format: 'firstTo',
      powerUps: [],
    });
    const memory = createCpuMemory();
    const rng = createRng(2);
    planThrow(state, memory, 'normal', rng);
    memory.last = {
      aim: { angle: 45, velocity: 50, usePowerUp: false },
      wind: state.round.wind,
      reached: 10,
      needed: 300,
      blocked: false,
    };
    state.round.number = 2;
    planThrow(state, memory, 'normal', rng);
    expect(memory.round).toBe(2);
    expect(memory.last).toBeNull();
  });

  it('thinks for a moment, quicker on harder levels', () => {
    const rng = createRng(3);
    const easyPause = thinkingSeconds('easy', rng);
    const brutalPause = thinkingSeconds('brutal', rng);
    expect(easyPause).toBeGreaterThan(brutalPause);
    expect(brutalPause).toBeGreaterThan(0.4);
  });
});
