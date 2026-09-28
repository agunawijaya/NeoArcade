import { createRng } from '@shared/rng';
import { describe, expect, it } from 'vitest';
import {
  createCpuMemory,
  DEFAULT_STYLE,
  observeThrow,
  planThrow,
  type CpuLevel,
  type PlayStyle,
} from './ai';
import { createMatch, type MatchState } from './match';
import { simulateShot } from './shot';

/**
 * Rivals keep the CPU's levels but add a style. These tests check that a
 * style really shows in how a CPU plays, not just in its numbers.
 */
const LOBBER: PlayStyle = { ...DEFAULT_STYLE, angle: 66, angleSpread: 3 };
const FLAT: PlayStyle = { ...DEFAULT_STYLE, angle: 31, angleSpread: 3 };
const WILD: PlayStyle = { ...DEFAULT_STYLE, correction: 1.7 };
const NERVOUS: PlayStyle = { ...DEFAULT_STYLE, rattle: 1.2 };

function match(seed: number, twists: MatchState['options']['twists'] = []): MatchState {
  return createMatch({ seed, world: 'earth', points: 3, format: 'firstTo', powerUps: [], twists });
}

function firstAngles(style: PlayStyle): number[] {
  return Array.from({ length: 120 }, (_, index) => {
    const state = match(index + 1);
    return planThrow(state, createCpuMemory(), 'hard', createRng(index), style).angle;
  });
}

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const spread = (values: number[]) => {
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
};

/** The CPU throws at a patient opponent; returns how often its throws flip between short and long. */
function flipRate(level: CpuLevel, style: PlayStyle): number {
  let flips = 0;
  let comparisons = 0;
  for (let seed = 1; seed <= 80; seed++) {
    const state = match(seed);
    const memory = createCpuMemory();
    const rng = createRng(seed * 13);
    const { round } = state;
    let previousShort: boolean | null = null;
    for (let throws = 0; throws < 12; throws++) {
      const aim = planThrow(state, memory, level, rng, style);
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
      if (shot.victim !== null || !memory.last) break;
      const short = memory.last.reached < memory.last.needed;
      if (previousShort !== null) {
        comparisons++;
        if (short !== previousShort) flips++;
      }
      previousShort = short;
    }
  }
  return flips / Math.max(1, comparisons);
}

describe('rival play styles', () => {
  it('a lobber throws high and a flat thrower keeps it low', () => {
    const lobs = mean(firstAngles(LOBBER));
    const usual = mean(firstAngles(DEFAULT_STYLE));
    const flat = mean(firstAngles(FLAT));
    expect(lobs).toBeGreaterThan(usual + 5);
    expect(flat).toBeLessThan(usual - 6);
  });

  it('an overcorrector swings past the target far more often', () => {
    const steady = flipRate('normal', DEFAULT_STYLE);
    const wild = flipRate('normal', WILD);
    expect(wild).toBeGreaterThan(steady + 0.15);
  });

  it('a nervous rival shakes more with every point against it', () => {
    const angles = (hitsTaken: number) =>
      Array.from({ length: 200 }, (_, index) => {
        const state = match(5);
        state.turn = 1;
        state.scores = [hitsTaken, 0];
        return planThrow(state, createCpuMemory(), 'hard', createRng(index), NERVOUS).angle;
      });
    const calm = spread(angles(0));
    const rattled = spread(angles(2));
    expect(rattled).toBeGreaterThan(calm * 1.8);
  });

  it('reads much less of a hidden wind', () => {
    const planned = (twists: MatchState['options']['twists'], style = DEFAULT_STYLE) => {
      let total = 0;
      let count = 0;
      for (let seed = 1; seed <= 150; seed++) {
        const state = match(seed, twists);
        if (Math.abs(state.round.wind) < 8) continue;
        const aim = planThrow(state, createCpuMemory(), 'brutal', createRng(seed), style);
        total += aim.velocity;
        count++;
      }
      return total / count;
    };
    const calmVelocity = planned([], { ...DEFAULT_STYLE, windSense: 0 });
    const readVelocity = planned([]);
    const hiddenVelocity = planned(['hiddenWind']);
    expect(Math.abs(hiddenVelocity - calmVelocity)).toBeLessThan(
      Math.abs(readVelocity - calmVelocity),
    );
  });

  it('allows for a gust when correcting a throw made in another wind', () => {
    const state = match(8, ['gusts']);
    const plan = (windThen: number) => {
      const memory = createCpuMemory();
      planThrow(state, memory, 'hard', createRng(4));
      memory.last = {
        aim: { angle: 45, velocity: 60, usePowerUp: false },
        wind: windThen,
        reached: 300,
        needed: 360,
        blocked: false,
      };
      return planThrow(state, memory, 'hard', createRng(5)).velocity;
    };
    const wind = state.round.wind;
    // Player 1 throws to the right: a wind that has swung right since helps this throw along.
    expect(plan(wind - 7)).toBeLessThan(plan(wind));
    expect(plan(wind + 7)).toBeGreaterThan(plan(wind));
  });

  it('leaves the default CPU exactly as it was', () => {
    const state = match(12);
    const withDefault = planThrow(state, createCpuMemory(), 'normal', createRng(9), DEFAULT_STYLE);
    const withoutStyle = planThrow(state, createCpuMemory(), 'normal', createRng(9));
    expect(withDefault).toEqual(withoutStyle);
  });
});
