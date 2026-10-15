import { describe, expect, it } from 'vitest';
import {
  CAR_LENGTH,
  DONKEY_DEPTH,
  GRACE_SECONDS,
  MUD_DELAY,
  SIGHT_DISTANCE,
  STEP_SECONDS,
} from './constants';
import {
  createDrive,
  gapOf,
  leaveClosedLane,
  stepDrive,
  type Drive,
  type DriveEvent,
} from './drive';
import { makeBarrier, makeCarrot, makeDonkey, type Hazard } from './hazards';
import {
  createRoad,
  edgesAt,
  laneLateral,
  pavedLanes,
  pressTarget,
  stepTarget,
  type LaneChange,
  type Road,
} from './road';

const SPEED = 20;
/** Every road starts on X and Y, and the car in X. */
const LEFT = 1;
const RIGHT = 2;

function driveWith(road: Road = createRoad()): Drive {
  return createDrive(road, SPEED);
}

function place(drive: Drive, hazard: Hazard): Hazard {
  drive.hazards.push(hazard);
  return hazard;
}

/** Steps until `until` says stop; returns every event on the way. */
function run(drive: Drive, until: (drive: Drive) => boolean, press?: (drive: Drive) => boolean) {
  const events: DriveEvent[] = [];
  for (let step = 0; step < 10_000 && !until(drive); step++) {
    events.push(...stepDrive(drive, press?.(drive) ?? false));
  }
  return events;
}

const of = <T extends DriveEvent['type']>(events: DriveEvent[], type: T) =>
  events.filter((event): event is Extract<DriveEvent, { type: T }> => event.type === type);

/** A road that slides from X and Y over to Y and Z at `at`, with X's barrier at `barrier`. */
function shiftingRoad(at: number, barrier: number): { road: Road; change: LaneChange } {
  const road = createRoad();
  const change: LaneChange = {
    at,
    layout: { first: 2, count: 2 },
    opens: 3,
    closes: 1,
    barrier,
  };
  road.changes.push(change);
  return { road, change };
}

describe('lane switching', () => {
  it('flips between the two lanes with every press', () => {
    const drive = driveWith();
    expect(drive.car.lane).toBe(LEFT);
    stepDrive(drive, true);
    expect(drive.car.lane).toBe(RIGHT);
    stepDrive(drive, true);
    expect(drive.car.lane).toBe(LEFT);
  });

  it('cycles left to right and back round on three lanes', () => {
    const drive = driveWith(createRoad(null, { first: 0, count: 3 }));
    const lanes = [0, 1, 2, 3].map(() => {
      stepDrive(drive, true);
      return drive.car.lane;
    });
    expect(lanes).toEqual([1, 2, 0, 1]);
  });

  it('keeps every lane where it is when the road widens, and reports the third lane', () => {
    const road = createRoad();
    road.changes.push({
      at: 5,
      layout: { first: 1, count: 3 },
      opens: 3,
      closes: null,
      barrier: null,
    });
    const drive = driveWith(road);
    stepDrive(drive, true);
    const events = run(drive, (d) => d.car.nose > 6);
    expect(of(events, 'lanes')[0]?.lanes).toBe(3);
    expect(drive.car.lane).toBe(RIGHT);
    stepDrive(drive, true);
    expect(drive.car.lane).toBe(3);
  });

  it('holds a switch back in mud', () => {
    const road = createRoad();
    road.mud.push({ from: -5, to: 100, lanes: [LEFT] });
    const drive = driveWith(road);
    const events = stepDrive(drive, true);
    expect(of(events, 'stuck')).toHaveLength(1);
    expect(drive.car.lane).toBe(LEFT);
    const later = run(drive, (d) => d.car.lane === RIGHT);
    expect(drive.roadTime).toBeCloseTo(MUD_DELAY + STEP_SECONDS, 5);
    expect(of(later, 'switch')[0]?.held).toBe(true);
  });
});

describe('the shifting road', () => {
  it('opens the new lane before it closes the old one, and only ever changes one lane at a time', () => {
    const { road } = shiftingRoad(30, 50);
    expect(pavedLanes(road, 29)).toEqual([1, 2]);
    expect(pavedLanes(road, 30)).toEqual([1, 2, 3]);
    expect(pavedLanes(road, 49.9)).toEqual([1, 2, 3]);
    expect(pavedLanes(road, 50)).toEqual([2, 3]);
  });

  it('lets a press reach a new lane only once it is open', () => {
    const { road } = shiftingRoad(30, 50);
    expect(pressTarget(road, 29, RIGHT)).toBe(LEFT);
    expect(pressTarget(road, 31, RIGHT)).toBe(3);
    expect(pressTarget(road, 31, 3)).toBe(RIGHT);
  });

  it('merges a car out of a closing lane into the lane beside it, with one press', () => {
    const { road } = shiftingRoad(30, 50);
    expect(pressTarget(road, 35, LEFT)).toBe(RIGHT);
    // Two buttons: only the way back onto the road works.
    expect(stepTarget(road, 35, LEFT, 1)).toBe(RIGHT);
    expect(stepTarget(road, 35, LEFT, -1)).toBeNull();
    expect(stepTarget(road, 35, RIGHT, -1)).toBeNull();
  });

  it('ends a closing lane at its barrier: stay in it and you crash', () => {
    const { road } = shiftingRoad(10, 30);
    const drive = driveWith(road);
    const barrier = place(drive, makeBarrier(1, 30, LEFT));
    const events = run(drive, (d) => d.car.nose > 40);
    expect(of(events, 'crash')).toEqual([{ type: 'crash', hazard: barrier }]);
  });

  it('counts a late merge out of a closing lane as a near miss, and a calm one as nothing', () => {
    for (const [secondsBefore, tier] of [
      [0.15, 2],
      [0.6, null],
    ] as const) {
      const { road } = shiftingRoad(10, 40);
      const drive = driveWith(road);
      place(drive, makeBarrier(1, 40, LEFT));
      const leaveAt = 40 - secondsBefore * SPEED;
      const events = run(
        drive,
        (d) => d.car.nose > 55,
        (d) => d.car.nose >= leaveAt && d.car.lane === LEFT,
      );
      const merge = of(events, 'switch')[0];
      expect(merge).toMatchObject({ from: LEFT, to: RIGHT, merging: true, forced: false });
      const pass = of(events, 'pass')[0];
      expect(pass?.nearMiss?.tier ?? null).toBe(tier);
      expect(pass?.neutral).toBe(tier === null);
    }
  });

  it('waves a shielded car out of its lane at the barrier instead of through it', () => {
    const { road } = shiftingRoad(5, 20);
    const drive = driveWith(road);
    drive.car.graceUntil = GRACE_SECONDS;
    place(drive, makeBarrier(1, 20, LEFT));
    const events = run(drive, (d) => d.car.nose > 26);
    expect(of(events, 'crash')).toHaveLength(0);
    expect(of(events, 'switch')[0]).toMatchObject({ from: LEFT, to: RIGHT, forced: true });
    expect(drive.car.lane).toBe(RIGHT);
  });

  it('sets a crashed car back beside the barrier, not in the lane that ended', () => {
    const { road } = shiftingRoad(5, 20);
    const drive = driveWith(road);
    drive.car.nose = 20;
    expect(of(leaveClosedLane(drive), 'switch')[0]).toMatchObject({ to: RIGHT, forced: true });
  });

  it('swings the road edges over smoothly through the tapers', () => {
    const { road } = shiftingRoad(30, 50);
    const half = 0.5;
    expect(edgesAt(road, 0)).toEqual({ left: laneLateral(1) - half, right: laneLateral(2) + half });
    const widening = edgesAt(road, 25).right;
    expect(widening).toBeGreaterThan(laneLateral(2) + half);
    expect(widening).toBeLessThan(laneLateral(3) + half);
    expect(edgesAt(road, 40)).toEqual({
      left: laneLateral(1) - half,
      right: laneLateral(3) + half,
    });
    const narrowing = edgesAt(road, 55).left;
    expect(narrowing).toBeLessThan(laneLateral(2) - half);
    expect(narrowing).toBeGreaterThan(laneLateral(1) - half);
    expect(edgesAt(road, 70).left).toBe(laneLateral(2) - half);
  });
});

describe('donkeys', () => {
  it('come into view exactly SIGHT_DISTANCE ahead of the nose', () => {
    const drive = driveWith();
    const donkey = place(drive, makeDonkey(1, 40, RIGHT, 'single'));
    const events = run(drive, (d) => d.hazards[0]?.revealed === true);
    expect(of(events, 'reveal')).toHaveLength(1);
    expect(gapOf(drive, donkey)).toBeLessThanOrEqual(SIGHT_DISTANCE);
    expect(gapOf(drive, donkey)).toBeGreaterThan(SIGHT_DISTANCE - SPEED * STEP_SECONDS);
  });

  it('crash into a car that stays in their lane', () => {
    const drive = driveWith();
    const donkey = place(drive, makeDonkey(1, 30, LEFT, 'single'));
    const events = run(drive, (d) => d.car.nose > 40);
    expect(of(events, 'crash')).toEqual([{ type: 'crash', hazard: donkey }]);
    expect(gapOf(drive, donkey)).toBeLessThan(0);
  });

  it('miss a car in the other lane, and count as passed', () => {
    const drive = driveWith();
    place(drive, makeDonkey(1, 30, RIGHT, 'single'));
    const events = run(drive, (d) => d.car.nose > 45);
    expect(of(events, 'crash')).toHaveLength(0);
    expect(of(events, 'pass')[0]).toMatchObject({ threatened: false });
  });

  it('cannot hit a car that swerves into their lane once they are behind it', () => {
    const drive = driveWith();
    place(drive, makeDonkey(1, 30, RIGHT, 'single'));
    const behind = 30 + CAR_LENGTH + DONKEY_DEPTH + 0.2;
    const events = run(
      drive,
      (d) => d.car.nose > 45,
      (d) => d.car.nose > behind && d.car.lane === LEFT,
    );
    expect(drive.car.lane).toBe(RIGHT);
    expect(of(events, 'crash')).toHaveLength(0);
  });

  it('still hit a car that swerves into them while they are alongside', () => {
    const drive = driveWith();
    place(drive, makeDonkey(1, 30, RIGHT, 'single'));
    const events = run(
      drive,
      (d) => d.car.nose > 45,
      (d) => d.car.nose > 31 && d.car.lane === LEFT,
    );
    expect(of(events, 'crash')).toHaveLength(1);
  });

  it.each([
    [0.07, 3],
    [0.15, 2],
    [0.28, 1],
    [0.6, null],
  ])('grade a dodge made %s s before the hit as tier %s', (secondsBefore, tier) => {
    const drive = driveWith();
    place(drive, makeDonkey(1, 60, LEFT, 'single'));
    const leaveAt = 60 - secondsBefore * SPEED;
    const events = run(
      drive,
      (d) => d.car.nose > 75,
      (d) => d.car.nose >= leaveAt && d.car.lane === LEFT,
    );
    const pass = of(events, 'pass')[0];
    expect(pass?.threatened).toBe(true);
    expect(pass?.nearMiss?.tier ?? null).toBe(tier);
  });

  it('let a car through untouched during its grace', () => {
    const drive = driveWith();
    drive.car.graceUntil = GRACE_SECONDS;
    place(drive, makeDonkey(1, 20, LEFT, 'single'));
    const events = run(drive, (d) => d.car.nose > 30);
    expect(of(events, 'crash')).toHaveLength(0);
    expect(of(events, 'pass')).toHaveLength(0);
  });
});

describe('hesitant donkeys', () => {
  it('hop between lanes, then commit and stay put', () => {
    const drive = driveWith();
    const commitGap = 8;
    const donkey = place(
      drive,
      makeDonkey(
        1,
        60,
        LEFT,
        'wobbler',
        [
          { gap: 14, lane: RIGHT },
          { gap: 11, lane: LEFT },
        ],
        commitGap,
      ),
    );
    const events = run(drive, (d) => d.car.nose > 70);
    expect(of(events, 'hop')).toHaveLength(2);
    expect(of(events, 'commit')).toHaveLength(1);
    expect(donkey.lane).toBe(LEFT);
    expect(of(events, 'crash')).toHaveLength(1);
  });

  it('that hop out of the car’s lane by themselves give a neutral pass', () => {
    const drive = driveWith();
    place(drive, makeDonkey(1, 60, LEFT, 'wobbler', [{ gap: 10, lane: RIGHT }], 8));
    const events = run(drive, (d) => d.car.nose > 70);
    expect(of(events, 'pass')[0]).toMatchObject({
      threatened: true,
      neutral: true,
      nearMiss: null,
    });
  });
});

describe('carrots', () => {
  it('are collected in their lane and ignored in the other', () => {
    const drive = driveWith();
    place(drive, makeCarrot(1, 20, LEFT));
    place(drive, makeCarrot(2, 25, RIGHT));
    const events = run(drive, (d) => d.car.nose > 35);
    expect(of(events, 'carrot').map((event) => event.hazard.id)).toEqual([1]);
    expect(of(events, 'crash')).toHaveLength(0);
  });
});
