import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAutopilot } from './autopilot';
import {
  CAR_LENGTH,
  DONKEY_DEPTH,
  MUD_DELAY,
  PRESS_SECONDS,
  REACTION_SECONDS,
  SIGHT_DISTANCE,
  STEP_SECONDS,
} from './constants';
import { createDrive } from './drive';
import { dailyRun, endlessRun, everyPlan } from './modes';
import { RoadPlanner, type PlanConfig } from './planner';
import { createRoad, TRANSITION_LENGTH } from './road';
import { legRun, legSeed } from './routes';
import { createRun, stepRun, type RunConfig, type RunEvent } from './run';

/** Everything the planner lays down for the first `metres` of road. */
function planned(plan: PlanConfig, metres: number) {
  const planner = new RoadPlanner(plan);
  const drive = createDrive(createRoad(), 10);
  while (drive.car.nose < metres) {
    drive.car.nose += 50;
    planner.fill(drive);
  }
  return drive;
}

function drive(config: RunConfig, beats: number, reactionSeconds = 0.3) {
  const run = createRun(config);
  const pilot = createAutopilot({ reactionSeconds, pressGap: PRESS_SECONDS });
  const events: RunEvent[] = [];
  const steps = Math.round((beats * run.planner.beatSeconds) / STEP_SECONDS);
  for (let step = 0; step < steps && run.phase.kind !== 'over'; step++) {
    events.push(...stepRun(run, { driver: run.phase.kind === 'drive' && pilot.decide(run.drive) }));
  }
  return { run, events };
}

describe('RoadPlanner', () => {
  it('builds the same road from the same seed, and another from another seed', () => {
    const plan = dailyRun(42).plan;
    const layout = (seed: number) =>
      planned({ ...plan, seed }, 2000).hazards.map((hazard) => [
        hazard.kind,
        hazard.lane,
        hazard.position,
      ]);
    expect(layout(42)).toEqual(layout(42));
    expect(layout(43)).not.toEqual(layout(42));
  });

  it('eases the speed from start towards max, changing only on a beat', () => {
    const planner = new RoadPlanner(endlessRun(1, 'normal', true, true).plan);
    expect(planner.speedAtBeat(0)).toBe(13);
    expect(planner.speedAtBeat(10.9)).toBe(planner.speedAtBeat(10));
    expect(planner.speedAtBeat(360)).toBeCloseTo((13 + 24.5) / 2, 9);
    expect(planner.speedAtBeat(100_000)).toBeLessThan(24.5);
    const time = planner.timeAtPosition(planner.positionAtBeat(37.25));
    expect(time / planner.beatSeconds).toBeCloseTo(37.25, 9);
  });

  it('brings every donkey into view on the beat or halfway between two', () => {
    const run = createRun(dailyRun(5));
    const half = run.planner.beatSeconds / 2;
    let checked = 0;
    for (let step = 0; step < 60 * 90; step++) {
      // Waved through, so the run never stops for a crash.
      run.drive.car.graceUntil = Infinity;
      for (const event of stepRun(run, { driver: false })) {
        if (event.type !== 'reveal' || event.hazard.kind !== 'donkey') continue;
        const offGrid = run.drive.roadTime % half;
        expect(Math.min(offGrid, half - offGrid)).toBeLessThanOrEqual(STEP_SECONDS + 1e-9);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it.each(everyPlan().map((plan, index) => [index, plan] as const))(
    'plan %i leaves time to react and press even at top speed',
    (_, plan) => {
      const window = SIGHT_DISTANCE / plan.speed.max;
      expect(window - 2 * PRESS_SECONDS).toBeGreaterThanOrEqual(REACTION_SECONDS);
      expect(window - (PRESS_SECONDS + MUD_DELAY)).toBeGreaterThanOrEqual(REACTION_SECONDS);
      expect(plan.wobbleCommitSeconds - PRESS_SECONDS).toBeGreaterThanOrEqual(REACTION_SECONDS);
    },
  );

  it('keeps donkeys off the stretches where the road changes width', () => {
    const { road, hazards } = planned(endlessRun(9, 'frantic', true, true).plan, 9000);
    expect(road.stretches.length).toBeGreaterThan(2);
    const donkeys = hazards.filter((hazard) => hazard.kind === 'donkey');
    for (const { from, to } of road.stretches) {
      for (const edge of [from, to]) {
        for (const donkey of donkeys) {
          const nearEdge =
            donkey.position > edge - TRANSITION_LENGTH - (CAR_LENGTH + DONKEY_DEPTH) &&
            donkey.position < edge + 1;
          expect(nearEdge, `donkey at ${donkey.position} m, edge at ${edge} m`).toBe(false);
        }
      }
    }
  });

  it('only sends single donkeys when hazards are off', () => {
    const { road, hazards } = planned(endlessRun(3, 'normal', false, true).plan, 5000);
    expect(new Set(hazards.map((hazard) => `${hazard.kind}:${hazard.role}`))).toEqual(
      new Set(['donkey:single']),
    );
    expect(road.stretches).toEqual([]);
    expect(road.mud).toEqual([]);
  });

  it('puts up a sign before each new kind of hazard, once', () => {
    const { road } = planned(endlessRun(4, 'normal', true, true).plan, 6000);
    expect(road.signs.map((sign) => sign.kind)).toEqual([
      'carrots',
      'pairs',
      'mud',
      'wobblers',
      'three-lanes',
      'herd',
    ]);
  });
});

describe('every planned road can be driven', () => {
  it.each(everyPlan().map((plan, index) => [index, plan] as const))(
    'by a player reacting in 0.3 s (plan %i)',
    (_, plan) => {
      const config: RunConfig = { plan, lives: 3, rhythm: true, nearMissTarget: null };
      const { run } = drive(config, (plan.lengthBeats ?? 480) + 40);
      expect(run.stats.crashes).toBe(0);
      if (plan.lengthBeats !== null) expect(run.phase).toEqual({ kind: 'over', reason: 'finish' });
    },
  );

  it('ends a boss leg with a stubborn herd before the finish line', () => {
    const { run, events } = drive(legRun('farm', 2, legSeed('farm', 2), true), 200);
    const bossRows = events.filter(
      (event) => event.type === 'reveal' && event.hazard.role === 'boss',
    );
    expect(bossRows.length).toBeGreaterThanOrEqual(10);
    expect(run.signsSeen).toContain('boss');
    expect(run.phase).toEqual({ kind: 'over', reason: 'finish' });
  });
});

describe('the engine stays deterministic across browsers', () => {
  // Math.sin, cos, exp, pow and friends may differ in the last bit between
  // JavaScript engines, which would give players different Daily Roads.
  it('uses only arithmetic that every JavaScript engine rounds the same way', () => {
    const folder = import.meta.dirname;
    const sources = readdirSync(folder).filter(
      (name) => name.endsWith('.ts') && !name.endsWith('.test.ts'),
    );
    for (const name of sources) {
      const text = readFileSync(join(folder, name), 'utf8');
      expect(text, name).not.toMatch(
        /Math\.(sin|cos|tan|atan2?|exp|expm1|log\w*|pow|sqrt|cbrt|hypot|random)\b/,
      );
      expect(text, name).not.toMatch(/[\w)\]] ?\*\* ?[\w(]/);
    }
  });
});
