import { describe, expect, it } from 'vitest';
import { GRACE_SECONDS, STARTING_LIVES, STEP_SECONDS } from './constants';
import { makeDonkey } from './hazards';
import { dailyRun, endlessRun } from './modes';
import { legRun, legSeed } from './routes';
import {
  createRun,
  CRASH_BEATS,
  legStars,
  metresDriven,
  runScore,
  SEGMENTS,
  stepRun,
  type RunEvent,
  type RunState,
} from './run';
import { comboMultiplier, nearMissTier, NEAR_MISS_TIERS } from './scoring';

function steps(run: RunState, count: number, press: (run: RunState) => boolean = () => false) {
  const events: RunEvent[] = [];
  for (let step = 0; step < count && run.phase.kind !== 'over'; step++) {
    events.push(...stepRun(run, { driver: press(run) }));
  }
  return events;
}

/** A run whose planned road is emptied, with one donkey placed by hand. */
function runWithDonkeyAhead(lane = 0) {
  const run = createRun(endlessRun(1, 'normal', false, true));
  run.drive.hazards = [makeDonkey(999, 30, lane, 'single')];
  run.planner.fill = () => undefined;
  return run;
}

describe('crashes in a run', () => {
  it('cost a life and hold the road still for whole beats', () => {
    const run = runWithDonkeyAhead();
    const events: RunEvent[] = [];
    while (run.phase.kind === 'drive') events.push(...stepRun(run, { driver: false }));
    expect(events.some((event) => event.type === 'crash')).toBe(true);
    expect(run.lives).toBe(STARTING_LIVES - 1);
    expect(run.phase.kind).toBe('crash');
    const frozenAt = run.drive.roadTime;
    const freeze = Math.round((CRASH_BEATS * run.planner.beatSeconds) / STEP_SECONDS);
    steps(run, freeze - 1);
    expect(run.drive.roadTime).toBe(frozenAt);
    expect(steps(run, 1)).toContainEqual({ type: 'resume' });
    expect(run.drive.car.graceUntil).toBeCloseTo(frozenAt + GRACE_SECONDS, 9);
  });

  it('end the run on the last life', () => {
    const run = createRun(dailyRun(8));
    run.lives = 1;
    const events = steps(run, 60 * 120);
    expect(run.phase).toEqual({ kind: 'over', reason: 'crashes' });
    expect(events.at(-1)).toEqual({ type: 'run-over', reason: 'crashes' });
  });
});

describe('points', () => {
  it('grade near misses by how late the escape was', () => {
    expect(nearMissTier(0.05)?.name).toBe('Hee-haw-some!');
    expect(nearMissTier(0.18)?.name).toBe('Whisker!');
    expect(nearMissTier(0.3)?.name).toBe('Close shave!');
    expect(nearMissTier(0.5)).toBeNull();
    expect(NEAR_MISS_TIERS.map((tier) => tier.points)).toEqual([200, 100, 50]);
  });

  it('multiply near misses in a row, up to ×5', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 20].map(comboMultiplier)).toEqual([1, 2, 2, 3, 3, 4, 4, 5, 5]);
  });

  it('pay for a late dodge and add up with the distance', () => {
    const run = runWithDonkeyAhead();
    const leaveAt = 30 - run.drive.speed * 0.15;
    const events = steps(run, 200, (r) => r.drive.car.nose >= leaveAt && r.drive.car.lane === 0);
    expect(events.find((event) => event.type === 'near-miss')).toMatchObject({
      points: 100,
      combo: 1,
      multiplier: 1,
    });
    expect(runScore(run)).toBe(metresDriven(run) + 100);
  });

  it('break the combo with a comfortable dodge of a donkey in your lane', () => {
    const run = runWithDonkeyAhead();
    run.combo = 3;
    const events = steps(run, 200, (r) => r.drive.car.nose >= 16 && r.drive.car.lane === 0);
    expect(events).toContainEqual({ type: 'combo-broken', combo: 3 });
    expect(run.combo).toBe(0);
  });
});

describe('Road Trip stars', () => {
  it('need the finish for every star', () => {
    const run = createRun(legRun('farm', 0, legSeed('farm', 0), true));
    expect(legStars(run)).toEqual({ finished: false, clean: false, target: false, count: 0 });
    run.phase = { kind: 'over', reason: 'finish' };
    expect(legStars(run).count).toBe(2);
    run.stats.nearMissPoints = 10_000;
    expect(legStars(run).count).toBe(3);
    run.stats.crashes = 1;
    expect(legStars(run)).toEqual({ finished: true, clean: false, target: true, count: 2 });
  });
});

describe('Daily Road', () => {
  it('has a finish line and splits the road into stretches for the share line', () => {
    const run = createRun(dailyRun(12));
    expect(run.drive.road.finish).toBeGreaterThan(2000);
    expect(run.segments).toHaveLength(SEGMENTS);
  });
});
