import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAutopilot } from './autopilot';
import {
  BARRIER_DEPTH,
  CAR_LENGTH,
  CLOSING_DISTANCE,
  DONKEY_DEPTH,
  MUD_DELAY,
  PRESS_SECONDS,
  REACTION_SECONDS,
  SIGHT_DISTANCE,
  STEP_SECONDS,
} from './constants';
import { createDrive, type Drive } from './drive';
import type { Hazard } from './hazards';
import { dailyRun, endlessRun, everyPlan } from './modes';
import { RoadPlanner, type PlanConfig } from './planner';
import { canGetPast, standingAfter, type Course, type Obstacle, type Standing } from './reach';
import { createRoad, endOf, inLayout, lanesOf, layoutAt, TAPER_LENGTH } from './road';
import { legRun, legSeed } from './routes';
import { createRun, stepRun, type RunConfig, type RunEvent } from './run';

/** Everything the planner lays down for the first `metres` of road, and the planner itself. */
function planned(plan: PlanConfig, metres: number) {
  const planner = new RoadPlanner(plan);
  const drive = createDrive(createRoad(null, plan.start), 10);
  while (drive.car.nose < metres) {
    drive.car.nose += 50;
    planner.fill(drive);
  }
  return { planner, drive, road: drive.road, hazards: drive.hazards };
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

/**
 * The proof again, from the finished road alone: every row of donkeys and
 * every barrier, in order, can be got past from wherever the one before may
 * have left the player. It reads the road as the player meets it, not the
 * planner's notes, so it catches a planner that checked one road and built
 * another.
 */
function proveRoad(plan: PlanConfig, planner: RoadPlanner, road: Drive['road'], hazards: Hazard[]) {
  const course: Course = {
    road,
    steering: plan.steering ?? 'one-button',
    slack: plan.slack,
    timeAtPosition: (position) => planner.timeAtPosition(position),
    positionAtTime: (time) => planner.positionAtTime(time),
  };
  const rows = new Map<number, Hazard[]>();
  for (const hazard of hazards) {
    if (hazard.kind === 'carrot') continue;
    rows.set(hazard.position, [...(rows.get(hazard.position) ?? []), hazard]);
  }
  let standing: Standing = { lanes: [(plan.start ?? road.start).first], clearedAt: 0 };
  let checked = 0;
  for (const [position, row] of [...rows].sort(([a], [b]) => a - b)) {
    const arrival = planner.timeAtPosition(position);
    const speed = planner.speedAtBeat(arrival / planner.beatSeconds);
    const wobbler = row.some((hazard) => hazard.commitGap !== null);
    const obstacle: Obstacle = {
      position,
      arrival,
      known: wobbler
        ? arrival - plan.wobbleCommitSeconds
        : planner.timeAtPosition(position - SIGHT_DISTANCE),
      clear: (CAR_LENGTH + (row[0]?.kind === 'barrier' ? BARRIER_DEPTH : DONKEY_DEPTH)) / speed,
      // Where a hesitant donkey settles: its last hop, which is the first one listed.
      blocked: row.map((hazard) => hazard.hops[0]?.lane ?? hazard.lane),
    };
    expect(canGetPast(course, standing, obstacle), `the row at ${position.toFixed(1)} m`).toBe(
      true,
    );
    standing = standingAfter(road, obstacle);
    checked++;
  }
  return checked;
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

  it('brings every donkey and barrier into view on the beat or halfway between two', () => {
    const run = createRun(dailyRun(5));
    const half = run.planner.beatSeconds / 2;
    let checked = 0;
    for (let step = 0; step < 60 * 90; step++) {
      // Waved through, so the run never stops for a crash.
      run.drive.car.graceUntil = Infinity;
      for (const event of stepRun(run, { driver: false })) {
        if (event.type !== 'reveal' || event.hazard.kind === 'carrot') continue;
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

  it('only sends single donkeys when hazards are off, and still shifts the road', () => {
    const { road, hazards } = planned(endlessRun(3, 'normal', false, true).plan, 5000);
    expect(new Set(hazards.map((hazard) => `${hazard.kind}:${hazard.role}`))).toEqual(
      new Set(['donkey:single', 'barrier:null']),
    );
    expect(road.changes.length).toBeGreaterThan(3);
    expect(road.changes.every((change) => change.layout.count === 2)).toBe(true);
    expect(road.mud).toEqual([]);
  });

  it('puts up a sign before each new kind of hazard, once', () => {
    const { road } = planned(endlessRun(4, 'normal', true, true).plan, 6000);
    expect(road.signs.map((sign) => sign.kind)).toEqual([
      'carrots',
      'shift',
      'pairs',
      'mud',
      'wobblers',
      'three-lanes',
      'herd',
    ]);
  });
});

describe('the shifting road', () => {
  const plans = [
    endlessRun(9, 'frantic', true, true).plan,
    dailyRun(77).plan,
    legRun('snow', 2, legSeed('snow', 2), true).plan,
  ];

  it.each(plans.map((plan, index) => [index, plan] as const))(
    'changes one lane at a time, and gives every closing lane a barrier a full sight away (plan %i)',
    (_, plan) => {
      const { road, hazards } = planned(plan, 6000);
      expect(road.changes.length).toBeGreaterThan(4);
      let layout = road.start;
      let previousEnd = -Infinity;
      for (const change of road.changes) {
        const before = new Set(lanesOf(layout));
        const after = new Set(lanesOf(change.layout));
        // All but one lane in common: one opens, one closes, or one of each.
        expect([...after].filter((lane) => !before.has(lane)).length).toBeLessThanOrEqual(1);
        expect([...before].filter((lane) => !after.has(lane)).length).toBeLessThanOrEqual(1);
        expect(change.at - TAPER_LENGTH).toBeGreaterThanOrEqual(previousEnd);
        if (change.closes !== null) {
          expect(change.barrier).not.toBeNull();
          expect((change.barrier as number) - change.at).toBeGreaterThanOrEqual(CLOSING_DISTANCE);
          const barrier = hazards.find(
            (hazard) => hazard.kind === 'barrier' && hazard.position === change.barrier,
          );
          expect(barrier?.lane).toBe(change.closes);
        }
        previousEnd = endOf(change);
        layout = change.layout;
      }
    },
  );

  it('keeps every donkey and carrot on a lane that is open where it stands', () => {
    for (const plan of everyPlan()) {
      const { road, hazards } = planned(plan, 4000);
      for (const hazard of hazards) {
        if (hazard.kind === 'barrier') continue;
        const lanes = [hazard.lane, ...hazard.hops.map((hop) => hop.lane)];
        for (const lane of lanes) {
          expect(
            inLayout(layoutAt(road, hazard.position), lane),
            `${hazard.kind} at ${hazard.position}`,
          ).toBe(true);
        }
      }
    }
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

  const SEEDS = Array.from({ length: 40 }, (_, index) => index * 7919 + 13);

  it.each(SEEDS)('proved from the finished road, for seed %i, in every mode', (seed) => {
    const plans = [
      endlessRun(seed, 'frantic', true, true).plan,
      endlessRun(seed, 'relaxed', false, true).plan,
      dailyRun(seed).plan,
      legRun('desert', 2, seed, true).plan,
      legRun('night', 2, seed, true).plan,
    ];
    for (const plan of plans) {
      const { planner, road, hazards } = planned(plan, 3500);
      expect(proveRoad(plan, planner, road, hazards)).toBeGreaterThan(40);
    }
  });

  it.each(SEEDS.slice(0, 12))('and driven without a crash, for seed %i', (seed) => {
    for (const plan of [endlessRun(seed, 'frantic', true, true).plan, dailyRun(seed).plan]) {
      const config: RunConfig = { plan, lives: 3, rhythm: true, nearMissTarget: null };
      const { run } = drive(config, 300);
      expect(run.stats.crashes, `seed ${seed}`).toBe(0);
    }
  });

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
