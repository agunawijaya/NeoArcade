import { describe, expect, it } from 'vitest';
import {
  CAR_LENGTH,
  DONKEY_DEPTH,
  GRACE_SECONDS,
  MUD_DELAY,
  SIGHT_DISTANCE,
  STEP_SECONDS,
} from './constants';
import { createDrive, gapOf, stepDrive, type Drive, type DriveEvent } from './drive';
import { makeCarrot, makeDonkey, type Hazard } from './hazards';
import { createRoad, laneCentre, lateralAt, remapLane, type Road } from './road';

const SPEED = 20;

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

describe('lane switching', () => {
  it('flips between the two lanes with every press', () => {
    const drive = driveWith();
    stepDrive(drive, true);
    expect(drive.car.lane).toBe(1);
    stepDrive(drive, true);
    expect(drive.car.lane).toBe(0);
  });

  it('cycles left to right and back round on three lanes', () => {
    const road = createRoad();
    road.stretches.push({ from: -10, to: 1000 });
    const drive = driveWith(road);
    drive.car.lanes = 3;
    const lanes = [0, 1, 2, 3].map(() => {
      stepDrive(drive, true);
      return drive.car.lane;
    });
    expect(lanes).toEqual([1, 2, 0, 1]);
  });

  it('keeps outer lanes outer when the road changes width, and merges the middle lane right', () => {
    expect(remapLane(1, 2, 3)).toBe(2);
    expect(remapLane(0, 2, 3)).toBe(0);
    expect(remapLane(1, 3, 2)).toBe(1);
    expect(remapLane(2, 3, 2)).toBe(1);
    const road = createRoad();
    road.stretches.push({ from: 5, to: 30 });
    const drive = driveWith(road);
    stepDrive(drive, true);
    const events = run(drive, (d) => d.car.nose > 6);
    expect(of(events, 'lanes')[0]?.lanes).toBe(3);
    expect(drive.car.lane).toBe(2);
    run(drive, (d) => d.car.nose > 31);
    expect(drive.car.lane).toBe(1);
  });

  it('eases lanes sideways through a widening so the views can draw it smoothly', () => {
    const road = createRoad();
    road.stretches.push({ from: 20, to: 60 });
    expect(lateralAt(road, 0, 1)).toBe(laneCentre(1, 2));
    expect(lateralAt(road, 20, 2)).toBe(laneCentre(2, 3));
    const halfway = lateralAt(road, 16.5, 1);
    expect(halfway).toBeGreaterThan(0.5);
    expect(halfway).toBeLessThan(1);
  });

  it('holds a switch back in mud', () => {
    const road = createRoad();
    road.mud.push({ from: -5, to: 100, lanes: [0] });
    const drive = driveWith(road);
    const events = stepDrive(drive, true);
    expect(of(events, 'stuck')).toHaveLength(1);
    expect(drive.car.lane).toBe(0);
    const later = run(drive, (d) => d.car.lane === 1);
    expect(drive.roadTime).toBeCloseTo(MUD_DELAY + STEP_SECONDS, 5);
    expect(of(later, 'switch')[0]?.held).toBe(true);
  });
});

describe('donkeys', () => {
  it('come into view exactly SIGHT_DISTANCE ahead of the nose', () => {
    const drive = driveWith();
    const donkey = place(drive, makeDonkey(1, 40, 1, 'single'));
    const events = run(drive, (d) => d.hazards[0]?.revealed === true);
    expect(of(events, 'reveal')).toHaveLength(1);
    expect(gapOf(drive, donkey)).toBeLessThanOrEqual(SIGHT_DISTANCE);
    expect(gapOf(drive, donkey)).toBeGreaterThan(SIGHT_DISTANCE - SPEED * STEP_SECONDS);
  });

  it('crash into a car that stays in their lane', () => {
    const drive = driveWith();
    const donkey = place(drive, makeDonkey(1, 30, 0, 'single'));
    const events = run(drive, (d) => d.car.nose > 40);
    expect(of(events, 'crash')).toEqual([{ type: 'crash', hazard: donkey }]);
    expect(gapOf(drive, donkey)).toBeLessThan(0);
  });

  it('miss a car in the other lane, and count as passed', () => {
    const drive = driveWith();
    place(drive, makeDonkey(1, 30, 1, 'single'));
    const events = run(drive, (d) => d.car.nose > 45);
    expect(of(events, 'crash')).toHaveLength(0);
    expect(of(events, 'pass')[0]).toMatchObject({ threatened: false });
  });

  it('cannot hit a car that swerves into their lane once they are behind it', () => {
    const drive = driveWith();
    place(drive, makeDonkey(1, 30, 1, 'single'));
    const behind = 30 + CAR_LENGTH + DONKEY_DEPTH + 0.2;
    const events = run(
      drive,
      (d) => d.car.nose > 45,
      (d) => d.car.nose > behind && d.car.lane === 0,
    );
    expect(drive.car.lane).toBe(1);
    expect(of(events, 'crash')).toHaveLength(0);
  });

  it('still hit a car that swerves into them while they are alongside', () => {
    const drive = driveWith();
    place(drive, makeDonkey(1, 30, 1, 'single'));
    const events = run(
      drive,
      (d) => d.car.nose > 45,
      (d) => d.car.nose > 31 && d.car.lane === 0,
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
    place(drive, makeDonkey(1, 60, 0, 'single'));
    const leaveAt = 60 - secondsBefore * SPEED;
    const events = run(
      drive,
      (d) => d.car.nose > 75,
      (d) => d.car.nose >= leaveAt && d.car.lane === 0,
    );
    const pass = of(events, 'pass')[0];
    expect(pass?.threatened).toBe(true);
    expect(pass?.nearMiss?.tier ?? null).toBe(tier);
  });

  it('let a car through untouched during its grace', () => {
    const drive = driveWith();
    drive.car.graceUntil = GRACE_SECONDS;
    place(drive, makeDonkey(1, 20, 0, 'single'));
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
        0,
        'wobbler',
        [
          { gap: 14, lane: 1 },
          { gap: 11, lane: 0 },
        ],
        commitGap,
      ),
    );
    const events = run(drive, (d) => d.car.nose > 70);
    expect(of(events, 'hop')).toHaveLength(2);
    expect(of(events, 'commit')).toHaveLength(1);
    expect(donkey.lane).toBe(0);
    expect(of(events, 'crash')).toHaveLength(1);
  });

  it('that hop out of the car’s lane by themselves give a neutral pass', () => {
    const drive = driveWith();
    place(drive, makeDonkey(1, 60, 0, 'wobbler', [{ gap: 10, lane: 1 }], 8));
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
    place(drive, makeCarrot(1, 20, 0));
    place(drive, makeCarrot(2, 25, 1));
    const events = run(drive, (d) => d.car.nose > 35);
    expect(of(events, 'carrot').map((event) => event.hazard.id)).toEqual([1]);
    expect(of(events, 'crash')).toHaveLength(0);
  });
});
