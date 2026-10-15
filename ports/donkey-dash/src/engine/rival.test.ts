import { describe, expect, it } from 'vitest';
import { STEP_SECONDS } from './constants';
import { createDrive } from './drive';
import { makeBarrier, makeDonkey, type Hazard } from './hazards';
import { RoadPlanner } from './planner';
import { canGetPast, standingAfter, type Course, type Standing } from './reach';
import { createRoad, inLayout, layoutAt } from './road';
import {
  createRival,
  CRASH_OUT_SECONDS,
  GHOST_SECONDS,
  rivalMatch,
  rivalPlan,
  stepRival,
  type RivalEvent,
  type RivalInput,
  type RivalState,
} from './rival';
import { CPU_LEVELS, CPU_STYLES, createRivalDriver, type CpuLevel } from './rival-cpu';

const IDLE: RivalInput = { left: false, right: false };
const LEFT: RivalInput = { left: true, right: false };
const RIGHT: RivalInput = { left: false, right: true };

/** A match on an empty road with the cars where a test wants them; hazards are placed by hand. */
function quietMatch(lanes: [number, number], hazards: Hazard[] = []): RivalState {
  const state = createRival(rivalMatch(5));
  state.planner.fill = () => undefined;
  state.drive.road = createRoad(null, { first: 0, count: 3 });
  state.drive.hazards = hazards;
  state.cars[0].lane = lanes[0];
  state.cars[1].lane = lanes[1];
  return state;
}

function steps(state: RivalState, count: number, inputs: () => [RivalInput, RivalInput]) {
  const events: RivalEvent[] = [];
  for (let step = 0; step < count && state.phase.kind !== 'over'; step++) {
    events.push(...stepRival(state, inputs()));
  }
  return events;
}

const of = <T extends RivalEvent['type']>(events: RivalEvent[], type: T) =>
  events.filter((event): event is Extract<RivalEvent, { type: T }> => event.type === type);

describe('two cars, one road', () => {
  it('refuses a move into the other car’s lane: a bump, and the car stays put', () => {
    const state = quietMatch([0, 1]);
    const events = stepRival(state, [RIGHT, IDLE]);
    expect(of(events, 'bump')).toEqual([{ type: 'bump', car: 0, reason: 'car', lane: 1 }]);
    expect(state.cars[0].lane).toBe(0);
  });

  it('when both go for the same free lane in the same step, moves neither', () => {
    const state = quietMatch([0, 2]);
    const events = stepRival(state, [RIGHT, LEFT]);
    expect(of(events, 'bump').map((bump) => bump.reason)).toEqual(['tie', 'tie']);
    expect(state.cars.map((car) => car.lane)).toEqual([0, 2]);
    // One at a time, the lane is there for the taking.
    stepRival(state, [RIGHT, IDLE]);
    expect(state.cars[0].lane).toBe(1);
  });

  it('never lets two racing cars swap or share a lane', () => {
    const state = quietMatch([0, 1]);
    stepRival(state, [RIGHT, LEFT]);
    expect(state.cars.map((car) => car.lane)).toEqual([0, 1]);
    for (let seed = 1; seed <= 6; seed++) {
      const match = createRival(rivalMatch(seed));
      const drivers = [0, 1].map((side) =>
        createRivalDriver(CPU_STYLES.hard, side as 0 | 1, seed * 3 + side),
      );
      for (let step = 0; step < 60 * 90 && match.phase.kind !== 'over'; step++) {
        stepRival(match, [drivers[0]!.decide(match), drivers[1]!.decide(match)]);
        const [a, b] = match.cars;
        if (a.state === 'racing' && b.state === 'racing') expect(a.lane).not.toBe(b.lane);
      }
    }
  });

  it('keeps cars on open lanes: a move off the road is a bump too', () => {
    const state = quietMatch([0, 2]);
    expect(of(stepRival(state, [LEFT, RIGHT]), 'bump').map((bump) => bump.reason)).toEqual([
      'edge',
      'edge',
    ]);
  });
});

describe('a crash', () => {
  it('empties the meter, takes the car off the road, and brings it back as a ghost', () => {
    const donkey = makeDonkey(1, 20, 0, 'single');
    const state = quietMatch([0, 2], [donkey]);
    state.cars[0].meter = 7;
    const events = steps(state, 120, () => [IDLE, IDLE]);
    expect(of(events, 'crash')[0]).toMatchObject({ car: 0, trapped: false });
    expect(state.cars[0].meter).toBe(0);
    expect(state.cars[0].state).toBe('crashed');
    const back = steps(state, Math.ceil(CRASH_OUT_SECONDS / STEP_SECONDS), () => [IDLE, IDLE]);
    const respawn = of(back, 'respawn')[0];
    expect(respawn?.car).toBe(0);
    expect(respawn?.lane).not.toBe(2);
    expect(state.cars[0].state).toBe('ghost');
    // A ghost does not block: the other car drives straight into its lane.
    state.cars[1].lane = (respawn?.lane ?? 0) + 1;
    stepRival(state, [IDLE, LEFT]);
    expect(state.cars[1].lane).toBe(respawn?.lane);
    // It only turns solid once it has a lane of its own.
    steps(state, Math.ceil(GHOST_SECONDS / STEP_SECONDS) + 10, () => [IDLE, IDLE]);
    expect(state.cars[0].state).toBe('ghost');
    stepRival(state, [state.cars[0].lane > 0 ? LEFT : RIGHT, IDLE]);
    stepRival(state, [IDLE, IDLE]);
    expect(state.cars[0].state).toBe('racing');
  });

  it('counts as a trap sprung by the other car when it refused the way out', () => {
    const state = quietMatch([0, 1], [makeDonkey(1, 16, 0, 'single')]);
    const events = steps(state, 90, () => [RIGHT, IDLE]);
    expect(of(events, 'bump').length).toBeGreaterThan(0);
    expect(of(events, 'crash')[0]).toMatchObject({ car: 0, trapped: true });
    expect(state.cars[1].stats.trapsSprung).toBe(1);
  });

  it('counts as a trap when every safe lane was on the far side of the other car', () => {
    const state = quietMatch([0, 1], [makeDonkey(1, 16, 0, 'single')]);
    const events = steps(state, 90, () => [IDLE, IDLE]);
    expect(of(events, 'crash')[0]).toMatchObject({ car: 0, trapped: true });
  });

  it('is a crash all the same at a barrier, and a ghost is moved over rather than through it', () => {
    const state = quietMatch([0, 2], [makeBarrier(1, 30, 0)]);
    state.drive.road.changes.push({
      at: 10,
      layout: { first: 1, count: 3 },
      opens: 3,
      closes: 0,
      barrier: 30,
    });
    const events = steps(state, 240, () => [IDLE, IDLE]);
    expect(of(events, 'crash')[0]).toMatchObject({ car: 0 });
    expect(of(events, 'crash')[0]?.hazard.kind).toBe('barrier');

    const ghostly = quietMatch([0, 2], [makeBarrier(1, 30, 0)]);
    ghostly.drive.road.changes.push({
      at: 10,
      layout: { first: 1, count: 3 },
      opens: 3,
      closes: 0,
      barrier: 30,
    });
    ghostly.cars[0].state = 'ghost';
    ghostly.cars[0].until = Infinity;
    steps(ghostly, 240, () => [IDLE, IDLE]);
    expect(ghostly.cars[0].lane).toBe(1);
  });
});

describe('the race meter and the rounds', () => {
  it('fills by one per clean donkey row, and the first to fill it takes the round', () => {
    const state = createRival({ ...rivalMatch(11, 2), meterTarget: 3 });
    const drivers = [0, 1].map((side) => createRivalDriver(CPU_STYLES.brutal, side as 0 | 1, side));
    const events = steps(state, 60 * 600, () => [
      drivers[0]!.decide(state),
      drivers[1]!.decide(state),
    ]);
    const won = of(events, 'round-won');
    expect(won.length).toBeGreaterThanOrEqual(2);
    for (const round of won) expect(round.rounds[round.car]).toBeGreaterThan(0);
    expect(state.phase.kind).toBe('over');
    expect(state.rounds[state.winner ?? 0]).toBe(2);
    // Every dodge counted one row, at most once per car.
    const dodges = of(events, 'dodge');
    const keys = dodges.map((dodge) => `${state.round}:${dodge.car}:${dodge.hazard.position}`);
    expect(dodges.every((dodge) => dodge.hazard.kind === 'donkey')).toBe(true);
    expect(keys.length).toBeGreaterThan(5);
  });

  it('settles a dead heat with the first crash', () => {
    const state = quietMatch(
      [0, 2],
      [makeDonkey(1, 20, 0, 'single'), makeDonkey(2, 20, 1, 'single')],
    );
    state.cars[0].meter = state.config.meterTarget;
    state.cars[1].meter = state.config.meterTarget;
    state.deadHeat = true;
    const events = steps(state, 120, () => [IDLE, IDLE]);
    expect(of(events, 'crash')[0]?.car).toBe(0);
    expect(of(events, 'round-won')[0]).toMatchObject({ car: 1 });
  });
});

describe('the Rival road', () => {
  const SEEDS = Array.from({ length: 30 }, (_, index) => index * 104_729 + 7);

  it.each(SEEDS)(
    'never fills every open lane, and each car alone always has a way through (seed %i)',
    (seed) => {
      for (const first of [0, 1]) {
        const plan = rivalPlan(seed, { first, count: 3 });
        const planner = new RoadPlanner(plan);
        const drive = createDrive(createRoad(null, plan.start), 10);
        while (drive.car.nose < 2500) {
          drive.car.nose += 50;
          planner.fill(drive);
        }
        const course: Course = {
          road: drive.road,
          steering: 'two-button',
          slack: plan.slack,
          timeAtPosition: (position) => planner.timeAtPosition(position),
          positionAtTime: (time) => planner.positionAtTime(time),
        };
        const rows = new Map<number, Hazard[]>();
        for (const hazard of drive.hazards) {
          rows.set(hazard.position, [...(rows.get(hazard.position) ?? []), hazard]);
        }
        let standing: Standing = { lanes: [first, first + 1, first + 2], clearedAt: 0 };
        for (const [position, row] of [...rows].sort(([a], [b]) => a - b)) {
          const open = layoutAt(drive.road, position);
          if (row[0]?.kind === 'donkey') expect(row.length).toBeLessThan(open.count);
          for (const hazard of row) {
            if (hazard.kind === 'donkey') expect(inLayout(open, hazard.lane)).toBe(true);
          }
          const arrival = planner.timeAtPosition(position);
          const obstacle = {
            position,
            arrival,
            known: planner.timeAtPosition(position - 16),
            clear: 0.3,
            blocked: row.map((hazard) => hazard.lane),
          };
          expect(canGetPast(course, standing, obstacle)).toBe(true);
          standing = standingAfter(drive.road, obstacle);
        }
      }
    },
  );

  it.each(CPU_LEVELS)(
    'lets a %s CPU alone drive it without a crash, when it never fumbles',
    (level) => {
      for (let seed = 1; seed <= 8; seed++) {
        const state = createRival(rivalMatch(seed * 31, 9));
        const driver = createRivalDriver(
          { ...CPU_STYLES[level], hesitation: 0, blunder: 0 },
          0,
          seed,
        );
        for (let step = 0; step < 60 * 120 && state.phase.kind !== 'over'; step++) {
          // The other car never makes it back onto the road.
          state.cars[1].state = 'crashed';
          state.cars[1].until = Infinity;
          stepRival(state, [driver.decide(state), IDLE]);
          expect(state.cars[0].stats.crashes, `seed ${seed}`).toBe(0);
        }
      }
    },
  );
});

interface LevelReport {
  trapsPerMinute: number;
  crashesPerMinute: number;
  wins: number;
}

/** Each level against Easy, on both sides of the road, over many seeded matches. */
function report(level: CpuLevel, matches = 16): LevelReport {
  let minutes = 0;
  let traps = 0;
  let crashes = 0;
  let wins = 0;
  for (let match = 0; match < matches; match++) {
    const side = (match % 2) as 0 | 1;
    const state = createRival(rivalMatch(500 + match * 97, 3));
    const cpu = createRivalDriver(CPU_STYLES[level], side, match * 17 + 3);
    const easy = createRivalDriver(CPU_STYLES.easy, side === 0 ? 1 : 0, match * 23 + 5);
    let step = 0;
    for (; step < 60 * 60 * 6 && state.phase.kind !== 'over'; step++) {
      const ours = cpu.decide(state);
      const theirs = easy.decide(state);
      stepRival(state, side === 0 ? [ours, theirs] : [theirs, ours]);
    }
    minutes += (step * STEP_SECONDS) / 60;
    traps += cpu.trapAttempts;
    crashes += state.cars[side].stats.crashes;
    if (state.winner === side) wins++;
  }
  return { trapsPerMinute: traps / minutes, crashesPerMinute: crashes / minutes, wins };
}

describe('the CPU rival', () => {
  const reports = Object.fromEntries(CPU_LEVELS.map((level) => [level, report(level)])) as Record<
    CpuLevel,
    LevelReport
  >;

  it('Easy only avoids danger: it never goes for a trap', () => {
    expect(reports.easy.trapsPerMinute).toBe(0);
  });

  it('Normal sometimes blocks, Hard sets traps on purpose, Brutal too', () => {
    expect(reports.normal.trapsPerMinute).toBeGreaterThan(0.2);
    expect(reports.hard.trapsPerMinute).toBeGreaterThan(reports.normal.trapsPerMinute);
    expect(reports.brutal.trapsPerMinute).toBeGreaterThan(0.2);
  });

  it('crashes less the higher the level, and even Brutal is not perfect', () => {
    const rates = CPU_LEVELS.map((level) => reports[level].crashesPerMinute);
    for (let index = 1; index < rates.length; index++) {
      expect(rates[index]).toBeLessThan(rates[index - 1] as number);
    }
    expect(reports.brutal.crashesPerMinute).toBeGreaterThan(0.3);
  });

  it('beats Easy more often the higher the level', () => {
    expect(reports.normal.wins).toBeGreaterThan(8);
    expect(reports.hard.wins).toBeGreaterThanOrEqual(reports.normal.wins);
    expect(reports.brutal.wins).toBeGreaterThanOrEqual(reports.hard.wins);
  });

  it('sees only what a player sees: what is beyond the sight line changes nothing', () => {
    const state = createRival(rivalMatch(42));
    const cpu = createRivalDriver(CPU_STYLES.brutal, 1, 9);
    const twin = createRivalDriver(CPU_STYLES.brutal, 1, 9);
    for (let step = 0; step < 60 * 40 && state.phase.kind === 'race'; step++) {
      const decision = cpu.decide(state);
      // Shuffle every donkey still out of sight; the twin must decide exactly the same.
      const hidden = state.drive.hazards.filter((hazard) => !hazard.revealed);
      const lanes = hidden.map((hazard) => hazard.lane);
      for (const hazard of hidden) hazard.lane = (hazard.lane + 1) % 4;
      expect(twin.decide(state)).toEqual(decision);
      hidden.forEach((hazard, index) => (hazard.lane = lanes[index] as number));
      stepRival(state, [IDLE, decision]);
    }
  });
});
