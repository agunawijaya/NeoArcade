import { createRng } from '@shared/rng';
import { describe, expect, it } from 'vitest';
import {
  CAR_LENGTH,
  DONKEY_DEPTH,
  PRESS_SECONDS,
  REACTION_SECONDS,
  SIGHT_DISTANCE,
  STEP_SECONDS,
} from './constants';
import { createDrive, gapOf } from './drive';
import { makeBarrier, makeDonkey, type Hazard } from './hazards';
import { RoadPlanner } from './planner';
import { canGetPast, lanesPast, standingAfter, type Course, type Standing } from './reach';
import { createRoad, inLayout, layoutAt, TAPER_LENGTH, type Layout } from './road';
import {
  AHEAD_DISTANCE,
  AHEAD_DODGE,
  aheadOf,
  cellsOf,
  createRival,
  CRASH_OUT_SECONDS,
  NO_INPUT,
  rivalMatch,
  rivalPlan,
  SHIFT_SECONDS,
  stepRival,
  type RivalEvent,
  type RivalInput,
  type RivalState,
} from './rival';
import { CPU_LEVELS, CPU_STYLES, createRivalDriver, type CpuLevel } from './rival-cpu';

const IDLE: RivalInput = NO_INPUT;
const LEFT: RivalInput = { ...NO_INPUT, left: true };
const RIGHT: RivalInput = { ...NO_INPUT, right: true };
const SURGE: RivalInput = { ...NO_INPUT, surge: true };
const DROP: RivalInput = { ...NO_INPUT, drop: true };

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
    expect(of(events, 'bump')).toEqual([
      { type: 'bump', car: 0, move: 'lane', reason: 'car', lane: 1 },
    ]);
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

  it('never lets two cars swap lanes', () => {
    const state = quietMatch([0, 1]);
    stepRival(state, [RIGHT, LEFT]);
    expect(state.cars.map((car) => car.lane)).toEqual([0, 1]);
  });

  it('refuses a move into a lane its car is leaving, whichever driver is which', () => {
    for (const [follower, leader] of [
      [0, 1],
      [1, 0],
    ] as const) {
      const lanes: [number, number] = [0, 0];
      lanes[follower] = 0;
      lanes[leader] = 1;
      const state = quietMatch(lanes);
      const inputs: [RivalInput, RivalInput] = [RIGHT, RIGHT];
      const events = stepRival(state, inputs);
      expect(of(events, 'bump')).toEqual([
        { type: 'bump', car: follower, move: 'lane', reason: 'car', lane: 1 },
      ]);
      expect(state.cars[follower].lane).toBe(0);
      expect(state.cars[leader].lane).toBe(2);
    }
  });

  it('never puts two CPU cars in one cell, crashes, comebacks and surges included', () => {
    let comebacks = 0;
    for (const [index, level] of CPU_LEVELS.entries()) {
      for (let seed = 1; seed <= 4; seed++) {
        const match = createRival(rivalMatch(seed * 17 + index));
        const drivers = [
          createRivalDriver(CPU_STYLES[level], 0, seed),
          createRivalDriver(CPU_STYLES.easy, 1, seed + 50),
        ];
        for (let step = 0; step < 60 * 120 && match.phase.kind !== 'over'; step++) {
          const events = stepRival(match, [drivers[0]!.decide(match), drivers[1]!.decide(match)]);
          comebacks += of(events, 'respawn').length;
          const [a, b] = match.cars.map((car) => cellsOf(car)) as [string[], string[]];
          expect(
            a.filter((taken) => b.includes(taken)),
            `${level}, seed ${seed}, step ${step}`,
          ).toEqual([]);
        }
      }
    }
    expect(comebacks).toBeGreaterThan(20);
  });

  it('keeps cars on open lanes: a move off the road is a bump too', () => {
    const state = quietMatch([0, 2]);
    expect(of(stepRival(state, [LEFT, RIGHT]), 'bump').map((bump) => bump.reason)).toEqual([
      'edge',
      'edge',
    ]);
  });

  it('takes a lane widening in beside the road straight away, once it is half there', () => {
    // X Y Z open, the car in X; W widens in on its left and opens a few metres on.
    const state = shiftingLeft(TAPER_LENGTH / 2 - 1);
    const events = stepRival(state, [LEFT, IDLE]);
    expect(of(events, 'bump')).toEqual([]);
    expect(of(events, 'move')).toEqual([
      { type: 'move', car: 0, from: 1, to: 0, merging: false, cut: false },
    ]);
  });

  it('refuses a lane that has only begun to widen in, and never moves the car later on its own', () => {
    const state = shiftingLeft(TAPER_LENGTH - 1);
    expect(of(stepRival(state, [LEFT, IDLE]), 'bump')).toEqual([
      { type: 'bump', car: 0, move: 'lane', reason: 'edge', lane: 0 },
    ]);
    const later = steps(state, 120, () => [IDLE, IDLE]);
    expect(of(later, 'move')).toEqual([]);
    expect(state.cars[0].lane).toBe(1);
  });

  it('moves a car only in a step in which its driver steered, and only one lane', () => {
    let moves = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const match = createRival(rivalMatch(seed * 13));
      const random = createRng(seed);
      const cpu = createRivalDriver(CPU_STYLES.normal, 1, seed);
      for (let step = 0; step < 60 * 90 && match.phase.kind !== 'over'; step++) {
        // A restless player who steers at random, now and then.
        const steer = random.chance(0.05);
        const mine: RivalInput = steer && random.chance(0.5) ? LEFT : steer ? RIGHT : IDLE;
        const lane = match.cars[0].lane;
        for (const move of of(stepRival(match, [mine, cpu.decide(match)]), 'move')) {
          if (move.car !== 0) continue;
          moves += 1;
          expect(steer, `seed ${seed}, step ${step}`).toBe(true);
          expect(move.from).toBe(lane);
          expect(Math.abs(move.to - move.from)).toBe(1);
        }
      }
    }
    expect(moves).toBeGreaterThan(100);
  });

  it('crashes a car that moves in beside a donkey, but never into one that has gone by', () => {
    const beside = quietMatch([0, 2]);
    beside.drive.hazards = [makeDonkey(1, beside.drive.car.nose - 3, 1, 'single')];
    expect(of(stepRival(beside, [RIGHT, IDLE]), 'crash')).toHaveLength(1);

    const gone = quietMatch([0, 2]);
    const behind = gone.drive.car.nose - (CAR_LENGTH + DONKEY_DEPTH) - 0.01;
    gone.drive.hazards = [makeDonkey(1, behind, 1, 'single')];
    const events = steps(gone, 30, () => [RIGHT, IDLE]);
    expect(gone.cars[0].lane).toBe(1);
    expect(of(events, 'crash')).toEqual([]);
  });
});

/** X Y Z open, cars in X and Z, and W opening `ahead` metres in front of the cars (Z closing far beyond). */
function shiftingLeft(ahead: number): RivalState {
  const state = quietMatch([1, 3]);
  const start: Layout = { first: 1, count: 3 };
  state.drive.road = createRoad(null, start);
  const at = state.drive.car.nose + ahead;
  state.drive.road.changes.push({
    at,
    layout: { first: 0, count: 3 },
    opens: 0,
    closes: 3,
    barrier: at + 200,
  });
  return state;
}

/** Steps the match through a whole surge or drop back, and a step more. */
const shiftSteps = Math.ceil(SHIFT_SECONDS / STEP_SECONDS) + 1;

/** Puts a car Ahead straight away, as if it had surged long ago. */
function ahead(state: RivalState, side: 0 | 1): RivalState {
  state.cars[side].row = 'ahead';
  return state;
}

describe('surging Ahead and dropping back', () => {
  it('takes SHIFT_SECONDS, fills both rows of the lane meanwhile, then rides AHEAD_DISTANCE in front', () => {
    const state = quietMatch([0, 2]);
    expect(of(stepRival(state, [SURGE, IDLE]), 'shift')).toEqual([
      { type: 'shift', car: 0, to: 'ahead' },
    ]);
    expect(cellsOf(state.cars[0])).toEqual(['0:level', '0:ahead']);
    const halfway = aheadOf(state.cars[0], state.drive.roadTime);
    expect(halfway).toBeGreaterThan(0);
    expect(halfway).toBeLessThan(AHEAD_DISTANCE);
    steps(state, shiftSteps, () => [IDLE, IDLE]);
    expect(cellsOf(state.cars[0])).toEqual(['0:ahead']);
    expect(aheadOf(state.cars[0], state.drive.roadTime)).toBe(AHEAD_DISTANCE);
    stepRival(state, [DROP, IDLE]);
    steps(state, shiftSteps, () => [IDLE, IDLE]);
    expect(cellsOf(state.cars[0])).toEqual(['0:level']);
    expect(aheadOf(state.cars[0], state.drive.roadTime)).toBe(0);
  });

  it('keeps its lane while surging or dropping back: a lane change then is a bump', () => {
    const state = quietMatch([0, 2]);
    stepRival(state, [SURGE, IDLE]);
    expect(of(stepRival(state, [RIGHT, IDLE]), 'bump')).toEqual([
      { type: 'bump', car: 0, move: 'lane', reason: 'busy', lane: 1 },
    ]);
    expect(state.cars[0].lane).toBe(0);
  });

  it('plays out the owner’s example: blocked, surge, cut across, drop back', () => {
    // The CPU in the middle, me on the right, and I want the left lane.
    const state = quietMatch([2, 1]);
    expect(of(stepRival(state, [LEFT, IDLE]), 'bump')[0]).toMatchObject({ reason: 'car' });
    stepRival(state, [SURGE, IDLE]);
    steps(state, shiftSteps, () => [IDLE, IDLE]);
    // Ahead, my tail clears the CPU's nose: across in front of it.
    const across = stepRival(state, [LEFT, IDLE]);
    expect(of(across, 'move')).toEqual([
      { type: 'move', car: 0, from: 2, to: 1, merging: false, cut: true },
    ]);
    steps(state, 12, () => [IDLE, IDLE]);
    stepRival(state, [LEFT, IDLE]);
    expect(state.cars[0].lane).toBe(0);
    steps(state, 12, () => [IDLE, IDLE]);
    expect(of(stepRival(state, [DROP, IDLE]), 'shift')).toHaveLength(1);
    steps(state, shiftSteps, () => [IDLE, IDLE]);
    expect(cellsOf(state.cars[0])).toEqual(['0:level']);
  });

  it('refuses a drop back into a Level slot the other car has taken: change lane first', () => {
    // I am Ahead on the left; the CPU moves into my lane behind me.
    const state = ahead(quietMatch([0, 1]), 0);
    stepRival(state, [IDLE, LEFT]);
    expect(state.cars[1].lane).toBe(0);
    const refused = stepRival(state, [DROP, IDLE]);
    expect(of(refused, 'bump')).toEqual([
      { type: 'bump', car: 0, move: 'drop', reason: 'car', lane: 0 },
    ]);
    expect(cellsOf(state.cars[0])).toEqual(['0:ahead']);
    steps(state, 12, () => [IDLE, IDLE]);
    stepRival(state, [RIGHT, IDLE]);
    expect(of(stepRival(state, [DROP, IDLE]), 'shift')).toHaveLength(1);
  });

  it('refuses a surge into an Ahead slot the other car rides in', () => {
    const state = ahead(quietMatch([1, 1]), 1);
    expect(of(stepRival(state, [SURGE, IDLE]), 'bump')).toEqual([
      { type: 'bump', car: 0, move: 'surge', reason: 'car', lane: 1 },
    ]);
  });

  it('refuses both when a drop back and a lane change go for the same cell, whichever car is which', () => {
    for (const [dropper, mover] of [
      [0, 1],
      [1, 0],
    ] as const) {
      const lanes: [number, number] = [0, 0];
      lanes[dropper] = 0;
      lanes[mover] = 1;
      const state = ahead(quietMatch(lanes), dropper);
      const inputs: [RivalInput, RivalInput] = [IDLE, IDLE];
      inputs[dropper] = DROP;
      inputs[mover] = LEFT;
      const bumps = of(stepRival(state, inputs), 'bump');
      expect(bumps.map((bump) => bump.reason)).toEqual(['tie', 'tie']);
      expect(cellsOf(state.cars[dropper])).toEqual(['0:ahead']);
      expect(cellsOf(state.cars[mover])).toEqual(['1:level']);
    }
  });

  it('lets both cars ride Ahead, level with each other further up the road', () => {
    const state = quietMatch([0, 2]);
    stepRival(state, [SURGE, SURGE]);
    steps(state, shiftSteps, () => [IDLE, IDLE]);
    expect(cellsOf(state.cars[0])).toEqual(['0:ahead']);
    expect(cellsOf(state.cars[1])).toEqual(['2:ahead']);
    expect(of(stepRival(state, [RIGHT, LEFT]), 'bump').map((bump) => bump.reason)).toEqual([
      'tie',
      'tie',
    ]);
  });

  it('never puts two cars in one cell or swaps them, whatever the drivers press', () => {
    let shifts = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const match = createRival(rivalMatch(seed * 31));
      const random = [createRng(seed), createRng(seed + 99)];
      const press = (side: 0 | 1): RivalInput => {
        const roll = random[side]!.float(0, 1);
        if (roll < 0.03) return LEFT;
        if (roll < 0.06) return RIGHT;
        if (roll < 0.075) return SURGE;
        if (roll < 0.09) return DROP;
        return IDLE;
      };
      for (let step = 0; step < 60 * 90 && match.phase.kind !== 'over'; step++) {
        const before = match.cars.map((car) => cellsOf(car));
        const events = stepRival(match, [press(0), press(1)]);
        shifts += of(events, 'shift').length;
        const [a, b] = match.cars.map((car) => cellsOf(car)) as [string[], string[]];
        expect(
          a.filter((taken) => b.includes(taken)),
          `seed ${seed}, step ${step}`,
        ).toEqual([]);
        // No swap: the cars never trade cells in one step.
        const tookFromB = a.some(
          (taken) => before[1]!.includes(taken) && !before[0]!.includes(taken),
        );
        const tookFromA = b.some(
          (taken) => before[0]!.includes(taken) && !before[1]!.includes(taken),
        );
        expect(tookFromA && tookFromB, `seed ${seed}, step ${step}`).toBe(false);
      }
    }
    expect(shifts).toBeGreaterThan(100);
  });

  it('fills the meter a little more for a row passed Ahead', () => {
    const state = ahead(quietMatch([0, 2], [makeDonkey(1, 30, 1, 'single')]), 0);
    const events = steps(state, 240, () => [IDLE, IDLE]);
    expect(
      of(events, 'dodge').map(({ car, ahead: wasAhead, meter }) => ({ car, wasAhead, meter })),
    ).toEqual([
      { car: 0, wasAhead: true, meter: AHEAD_DODGE },
      { car: 1, wasAhead: false, meter: 1 },
    ]);
    expect(state.cars[0].stats.aheadDodges).toBe(1);
  });

  it('crashes a car Ahead, or half way through a surge, like any other, and brings it back Level', () => {
    const state = quietMatch([0, 2], [makeDonkey(1, 14, 0, 'single')]);
    stepRival(state, [SURGE, IDLE]);
    const events = steps(state, 300, () => [IDLE, IDLE]);
    expect(of(events, 'crash')[0]).toMatchObject({ car: 0 });
    expect(of(events, 'respawn')[0]?.car).toBe(0);
    expect(cellsOf(state.cars[0])).toEqual([`${state.cars[0].lane}:level`]);
  });

  it('meets donkeys a car length sooner when Ahead, and still has time to react to them', () => {
    const { speed } = rivalPlan(1, { first: 0, count: 3 });
    const fastest = Math.max(speed.start, speed.max);
    // Donkeys come into view at the same line for both rows.
    expect((SIGHT_DISTANCE - AHEAD_DISTANCE) / fastest).toBeGreaterThanOrEqual(
      REACTION_SECONDS + PRESS_SECONDS + 0.1,
    );
    const state = ahead(quietMatch([0, 2], [makeDonkey(1, 40, 0, 'single')]), 0);
    let revealedAt = -1;
    for (let step = 0; step < 120 && revealedAt < 0; step++) {
      if (of(stepRival(state, [IDLE, IDLE]), 'reveal').length > 0) {
        revealedAt = 40 - (state.drive.car.nose + AHEAD_DISTANCE);
      }
    }
    expect(revealedAt).toBeGreaterThan(SIGHT_DISTANCE - AHEAD_DISTANCE - 0.5);
    expect(revealedAt).toBeLessThanOrEqual(SIGHT_DISTANCE - AHEAD_DISTANCE);
  });

  it('counts a crash right after a refused drop back as a trap sprung', () => {
    // Ahead on the left with a donkey coming; the CPU slips in behind and shuts the door.
    const state = ahead(quietMatch([0, 1], [makeDonkey(1, 20, 0, 'single')]), 0);
    stepRival(state, [IDLE, LEFT]);
    const events = steps(state, 120, () => [DROP, IDLE]);
    expect(of(events, 'bump')[0]).toMatchObject({ car: 0, move: 'drop', reason: 'car' });
    // It crashed still Ahead, its door shut.
    expect(of(events, 'crash')[0]).toMatchObject({
      car: 0,
      trapped: true,
      doorShut: true,
      ahead: AHEAD_DISTANCE,
    });
    expect(state.cars[1].stats.trapsSprung).toBe(1);
  });
});

describe('a crash', () => {
  it('empties the meter, takes the car off the road, and brings it back solid in a lane of its own', () => {
    const donkey = makeDonkey(1, 20, 0, 'single');
    const state = quietMatch([0, 2], [donkey]);
    state.cars[0].meter = 7;
    const events = steps(state, 120, () => [IDLE, IDLE]);
    expect(of(events, 'crash')[0]).toMatchObject({ car: 0, trapped: false });
    expect(state.cars[0].meter).toBe(0);
    expect(state.cars[0].state).toBe('crashed');
    // Off the road, it takes up no lane: the other car may drive where it was.
    stepRival(state, [IDLE, LEFT]);
    expect(state.cars[1].lane).toBe(1);
    const back = steps(state, Math.ceil(CRASH_OUT_SECONDS / STEP_SECONDS), () => [IDLE, IDLE]);
    const respawn = of(back, 'respawn')[0];
    expect(respawn?.car).toBe(0);
    expect(respawn?.lane).not.toBe(1);
    expect(state.cars[0].state).toBe('racing');
    // Back on the road it blocks like any car.
    const lane = state.cars[0].lane;
    stepRival(state, [IDLE, lane > 1 ? RIGHT : LEFT]);
    expect(state.cars[1].lane).toBe(1);
  });

  it('waits to come back until a lane is safe and leaves the other car its way out', () => {
    // A row with one gap, in the middle, with the other car sitting in it.
    const row = [makeDonkey(1, 12, 0, 'herd'), makeDonkey(2, 12, 2, 'herd')];
    const state = quietMatch([0, 1], row);
    state.cars[0].state = 'crashed';
    state.cars[0].until = 0;
    let respawn: Extract<RivalEvent, { type: 'respawn' }> | undefined;
    for (let step = 0; step < 150 && !respawn; step++) {
      respawn = of(stepRival(state, [IDLE, IDLE]), 'respawn')[0];
    }
    expect(respawn).toBeDefined();
    // Either outer lane would have meant a donkey, and the gap was taken: it waited for the row to go by.
    expect(gapOf(state.drive, row[0] as Hazard)).toBeLessThanOrEqual(-(CAR_LENGTH + DONKEY_DEPTH));
    expect(respawn?.lane).not.toBe(1);
    expect(state.cars[1].stats.crashes).toBe(0);
  });

  it('comes back only where every row in view can be passed without moving', () => {
    let checked = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const match = createRival(rivalMatch(seed * 101));
      const drivers = [
        createRivalDriver(CPU_STYLES.normal, 0, seed),
        createRivalDriver(CPU_STYLES.hard, 1, seed + 7),
      ];
      for (let step = 0; step < 60 * 120 && match.phase.kind !== 'over'; step++) {
        const crashedAt = match.cars.map((car) => (car.state === 'crashed' ? car.until : null));
        const events = stepRival(match, [drivers[0]!.decide(match), drivers[1]!.decide(match)]);
        for (const { car, lane } of of(events, 'respawn')) {
          checked += 1;
          // Never long after its time off the road is up.
          expect(match.drive.roadTime - (crashedAt[car] ?? 0)).toBeLessThan(4);
          const ahead = match.drive.hazards.filter(
            (hazard) =>
              hazard.kind !== 'carrot' && hazard.revealed && gapOf(match.drive, hazard) > 0,
          );
          for (const position of new Set(ahead.map((hazard) => hazard.position))) {
            const blocked = ahead
              .filter((hazard) => hazard.position === position)
              .map((hazard) => hazard.lane);
            expect(lanesPast(match.drive.road, { position, blocked })).toContain(lane);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(10);
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

  it('is a crash all the same at a barrier, and the car comes back on the open road', () => {
    const state = quietMatch([0, 2], [makeBarrier(1, 30, 0)]);
    state.drive.road.changes.push({
      at: 10,
      layout: { first: 1, count: 3 },
      opens: 3,
      closes: 0,
      barrier: 30,
    });
    const events = steps(state, 400, () => [IDLE, IDLE]);
    expect(of(events, 'crash')[0]).toMatchObject({ car: 0 });
    expect(of(events, 'crash')[0]?.hazard.kind).toBe('barrier');
    const respawn = of(events, 'respawn')[0];
    expect(respawn?.lane).toBeGreaterThanOrEqual(1);
    expect(respawn?.lane).not.toBe(state.cars[1].lane);
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
    'never fills every open lane, and each car alone, Level or Ahead, always has a way through (seed %i)',
    (seed) => {
      for (const first of [0, 1]) {
        const plan = rivalPlan(seed, { first, count: 3 });
        const planner = new RoadPlanner(plan);
        const drive = createDrive(createRoad(null, plan.start), 10);
        while (drive.car.nose < 2500) {
          drive.car.nose += 50;
          planner.fill(drive);
        }
        const rows = new Map<number, Hazard[]>();
        for (const hazard of drive.hazards) {
          rows.set(hazard.position, [...(rows.get(hazard.position) ?? []), hazard]);
        }
        // From every lane, riding Level or Ahead: an Ahead car meets each row sooner, with the same view.
        for (const lead of [0, AHEAD_DISTANCE]) {
          const course: Course = {
            road: drive.road,
            steering: 'two-button',
            slack: plan.slack,
            timeAtPosition: (position) => planner.timeAtPosition(position - lead),
            positionAtTime: (time) => planner.positionAtTime(time) + lead,
          };
          let standing: Standing = { lanes: [first, first + 1, first + 2], clearedAt: 0 };
          for (const [position, row] of [...rows].sort(([a], [b]) => a - b)) {
            const open = layoutAt(drive.road, position);
            if (row[0]?.kind === 'donkey') expect(row.length).toBeLessThan(open.count);
            for (const hazard of row) {
              if (hazard.kind === 'donkey') expect(inLayout(open, hazard.lane)).toBe(true);
            }
            const obstacle = {
              position,
              arrival: planner.timeAtPosition(position - lead),
              known: planner.timeAtPosition(position - SIGHT_DISTANCE),
              clear: 0.3,
              blocked: row.map((hazard) => hazard.lane),
            };
            expect(canGetPast(course, standing, obstacle), `${position} m, ${lead} m ahead`).toBe(
              true,
            );
            standing = standingAfter(drive.road, obstacle);
          }
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
  surgesPerMinute: number;
  /** The share of its clean rows it passed riding Ahead. */
  aheadShare: number;
  /** Presses the rules turned down for its own sake: a lane change mid-surge, or off the road. */
  clumsyBumps: number;
  /** The rival's crashes straight after a drop back refused because this car held the Level slot. */
  doorTraps: number;
  wins: number;
}

/** A player who likes riding Ahead, to see who shuts the door on the way back. */
const RIDER = { ...CPU_STYLES.easy, ridesAhead: 0.6 };

/** A level against `opponent` (Easy unless said), on both sides of the road, over 32 seeded matches. */
function report(level: CpuLevel, opponent = CPU_STYLES.easy, matches = 32): LevelReport {
  let minutes = 0;
  let traps = 0;
  let crashes = 0;
  let surges = 0;
  let rows = 0;
  let rowsAhead = 0;
  let clumsyBumps = 0;
  let doorTraps = 0;
  let wins = 0;
  for (let match = 0; match < matches; match++) {
    const side = (match % 2) as 0 | 1;
    const other = side === 0 ? 1 : 0;
    const state = createRival(rivalMatch(500 + match * 97, 3));
    const cpu = createRivalDriver(CPU_STYLES[level], side, match * 17 + 3);
    const them = createRivalDriver(opponent, other, match * 23 + 5);
    let refusedDropAt = -Infinity;
    let step = 0;
    for (; step < 60 * 60 * 6 && state.phase.kind !== 'over'; step++) {
      const ours = cpu.decide(state);
      const theirs = them.decide(state);
      for (const event of stepRival(state, side === 0 ? [ours, theirs] : [theirs, ours])) {
        if (
          event.type === 'bump' &&
          event.car === side &&
          ['busy', 'edge'].includes(event.reason)
        ) {
          clumsyBumps++;
        }
        if (event.type === 'bump' && event.car === other && event.move === 'drop') {
          refusedDropAt = state.drive.roadTime;
        }
        if (event.type === 'crash' && event.car === other && event.trapped) {
          if (state.drive.roadTime - refusedDropAt < 1.6) doorTraps++;
        }
      }
    }
    minutes += (step * STEP_SECONDS) / 60;
    traps += cpu.trapAttempts;
    surges += cpu.surges;
    crashes += state.cars[side].stats.crashes;
    rows += state.cars[side].stats.dodges;
    rowsAhead += state.cars[side].stats.aheadDodges;
    if (state.winner === side) wins++;
  }
  return {
    trapsPerMinute: traps / minutes,
    crashesPerMinute: crashes / minutes,
    surgesPerMinute: surges / minutes,
    aheadShare: rowsAhead / rows,
    clumsyBumps,
    doorTraps,
    wins,
  };
}

describe('the CPU rival', () => {
  const reports = Object.fromEntries(CPU_LEVELS.map((level) => [level, report(level)])) as Record<
    CpuLevel,
    LevelReport
  >;
  const againstRider = Object.fromEntries(
    (['easy', 'hard', 'brutal'] as const).map((level) => [level, report(level, RIDER)]),
  ) as Record<'easy' | 'hard' | 'brutal', LevelReport>;

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
    expect(reports.normal.wins).toBeGreaterThan(16);
    expect(reports.hard.wins).toBeGreaterThanOrEqual(reports.normal.wins);
    expect(reports.brutal.wins).toBeGreaterThanOrEqual(reports.hard.wins);
  });

  it('never surges on Easy, now and then on Normal, often on Hard and Brutal', () => {
    expect(reports.easy.surgesPerMinute).toBe(0);
    expect(reports.normal.surgesPerMinute).toBeGreaterThan(0.3);
    expect(reports.hard.surgesPerMinute).toBeGreaterThan(reports.normal.surgesPerMinute * 1.5);
    expect(reports.brutal.surgesPerMinute).toBeGreaterThan(reports.normal.surgesPerMinute * 1.5);
  });

  it('rides Ahead some of the way on Hard and Brutal, never all of it', () => {
    for (const level of ['hard', 'brutal'] as const) {
      expect(reports[level].aheadShare).toBeGreaterThan(0.05);
      expect(reports[level].aheadShare).toBeLessThan(0.5);
    }
  });

  it('never presses what the rules must turn down: no lane change mid-surge, none off the road', () => {
    for (const level of CPU_LEVELS) expect(reports[level].clumsyBumps, level).toBe(0);
    for (const level of ['easy', 'hard', 'brutal'] as const) {
      expect(againstRider[level].clumsyBumps, level).toBe(0);
    }
  });

  it('on Hard and Brutal, shuts the door on a rider coming back Level far more than Easy does by chance', () => {
    expect(againstRider.hard.doorTraps).toBeGreaterThan(againstRider.easy.doorTraps * 1.5);
    expect(againstRider.brutal.doorTraps).toBeGreaterThan(againstRider.easy.doorTraps * 1.5);
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
