import { describe, expect, it } from 'vitest';
import {
  CLASSIC_SPEED,
  CLIMB_STEP,
  ORIGINAL,
  PIXEL,
  SIGHT_DISTANCE,
  STEP_SECONDS,
  WINNING_CLIMB,
} from './constants';
import { classicDuel, createDuel, stepDuel, type DuelEvent } from './duel';
import { reactionWindow, revealGap } from './sight';

/** The original's donkey speed in pixels a second: 6 pixels every tick of the PC timer. */
const PIXELS_PER_SECOND = 6 * (1_193_182 / 65_536);

describe('Classic Duel keeps the timings of DONKEY.BAS', () => {
  it('moves the donkey 6 CGA pixels a tick', () => {
    expect(CLASSIC_SPEED / PIXEL).toBeCloseTo(PIXELS_PER_SECOND, 6);
    expect(PIXEL * 77).toBeCloseTo(SIGHT_DISTANCE, 9);
    expect(CLIMB_STEP / PIXEL).toBeCloseTo(4, 9);
  });

  it('gives the same reaction windows: 73 pixels on the first donkey, 33 on the eleventh', () => {
    expect(reactionWindow(CLASSIC_SPEED, 1)).toBeCloseTo(73 / PIXELS_PER_SECOND, 6);
    expect(reactionWindow(CLASSIC_SPEED, 11)).toBeCloseTo(33 / PIXELS_PER_SECOND, 6);
    expect(reactionWindow(CLASSIC_SPEED, 1)).toBeCloseTo(0.668, 3);
    expect(reactionWindow(CLASSIC_SPEED, 11)).toBeCloseTo(0.302, 3);
  });

  it('wins the Driver a point on the twelfth climb, after eleven dodges', () => {
    expect(WINNING_CLIMB).toBe(12);
    expect(ORIGINAL.carStartY - ORIGINAL.climbPx * 11).toBeGreaterThanOrEqual(ORIGINAL.winAboveY);
    expect(ORIGINAL.carStartY - ORIGINAL.climbPx * 12).toBeLessThan(ORIGINAL.winAboveY);
    expect(revealGap(11)).toBeGreaterThan(0);
  });

  it('starts each donkey up to 32 pixels above the screen and ends the wave at y 124', () => {
    const duel = createDuel(classicDuel(5));
    const waveLengths: number[] = [];
    const revealDelays: number[] = [];
    let waveStarted = 0;
    let time = 0;
    const lanes = new Set<number>();
    for (let step = 0; step < 60 * 400 && waveLengths.length < 200; step++) {
      // Never crash: the car is waved through, so every wave runs its full length.
      duel.drive.car.graceUntil = Infinity;
      const events: DuelEvent[] = stepDuel(duel, { driver: false });
      time += STEP_SECONDS;
      for (const event of events) {
        if (event.type === 'reveal') revealDelays.push(time - waveStarted);
        if (event.type === 'wave') {
          if (event.wave.number > 1) waveLengths.push(time - waveStarted);
          waveStarted = time;
          lanes.add(event.wave.donkeys[0]?.lane ?? -1);
        }
      }
    }
    // (124 − Y0) pixels at 6 a tick, for Y0 from −32 to 0.
    for (const length of waveLengths) {
      expect(length).toBeGreaterThanOrEqual(124 / PIXELS_PER_SECOND - STEP_SECONDS);
      expect(length).toBeLessThanOrEqual(156 / PIXELS_PER_SECOND + 2 * STEP_SECONDS);
    }
    // Hidden above the screen for 3 to 35 pixels before it is drawn.
    for (const delay of revealDelays) {
      expect(delay).toBeLessThanOrEqual(35 / PIXELS_PER_SECOND + 2 * STEP_SECONDS);
    }
    expect(lanes).toEqual(new Set([0, 1]));
  });
});
