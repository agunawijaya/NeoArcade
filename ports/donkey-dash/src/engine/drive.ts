import { CAR_LENGTH, MUD_DELAY, STEP_SECONDS } from './constants';
import type { Hazard } from './hazards';
import {
  inLayout,
  isMuddy,
  layoutAt,
  mergeTarget,
  pressTarget,
  type LaneCount,
  type Road,
} from './road';
import { nearMissTier, offBeat, RHYTHM_WINDOW, type NearMissTierInfo } from './scoring';
import { revealGap } from './sight';

/**
 * The part every one-button mode shares: a car driving up a road at some
 * speed, one button that moves it to the next open lane (see `pressTarget`),
 * and whatever is standing on the road ahead.
 *
 * The duel and run rules sit on top (duel.ts, run.ts). They decide the
 * speed, put hazards on the road, and turn the events below into points.
 * Rival Driver drives two cars over the same road (rival.ts) and shares the
 * road's clock and the hazards' own movements with this file.
 */
export interface Car {
  /** A lane position across the band, 0 to 3 (W X Y Z). */
  lane: number;
  /** How many lanes are open where the car is. */
  lanes: LaneCount;
  /** Road position of the front bumper. */
  nose: number;
  previousLane: number;
  /** Road time of the last lane switch, for the views' slide. */
  switchedAt: number;
  /** Road times at which presses held back by mud go through. */
  heldPresses: number[];
  /** Hazards leave the car alone until this road time, after a crash. */
  graceUntil: number;
}

export interface Drive {
  road: Road;
  car: Car;
  hazards: Hazard[];
  speed: number;
  /** Duel modes only: how far the car has crept up the road this point. */
  climb: number;
  /** Seconds spent driving; frozen while a crash plays out. Counted in whole steps. */
  roadTime: number;
  steps: number;
  /**
   * Where the nose is at a given road time, when a mode knows it exactly (the
   * runs' planner does). Otherwise the car simply moves at `speed`.
   */
  route: ((roadTime: number) => number) | null;
  /** Set in the runs, where donkeys come into view on the beat of the music. */
  beatSeconds: number | null;
  nextHazardId: number;
}

export type DriveEvent =
  | {
      type: 'switch';
      from: number;
      to: number;
      /** Left a lane with a donkey or a barrier coming. */
      dodging: boolean;
      /** Left a closing lane. */
      merging: boolean;
      /** Within RHYTHM_WINDOW of a beat. Only judged in the runs. */
      onBeat: boolean;
      /** Went through late because of mud. */
      held: boolean;
      /** Not the driver's doing: waved out of a closing lane while shielded after a crash. */
      forced: boolean;
    }
  | { type: 'stuck'; lane: number }
  | { type: 'reveal'; hazard: Hazard }
  | { type: 'hop'; hazard: Hazard; from: number }
  | { type: 'commit'; hazard: Hazard }
  | { type: 'crash'; hazard: Hazard }
  | {
      /** A donkey or a barrier is fully behind the car, and the car is fine. */
      type: 'pass';
      hazard: Hazard;
      /** It was in the car's lane at some point after it came into view. */
      threatened: boolean;
      /** How close the escape was, or null for a comfortable one. */
      nearMiss: NearMissTierInfo | null;
      /** It neither builds nor breaks a combo: the donkey moved away by itself, or the lane ended calmly. */
      neutral: boolean;
    }
  | { type: 'carrot'; hazard: Hazard }
  | { type: 'beat'; index: number }
  | { type: 'lanes'; lanes: LaneCount };

export function createDrive(road: Road, speed: number, beatSeconds: number | null = null): Drive {
  const start = layoutAt(road, 0);
  return {
    road,
    car: {
      lane: start.first,
      lanes: start.count,
      nose: 0,
      previousLane: start.first,
      switchedAt: -1,
      heldPresses: [],
      graceUntil: 0,
    },
    hazards: [],
    speed,
    climb: 0,
    roadTime: 0,
    steps: 0,
    route: null,
    beatSeconds,
    nextHazardId: 1,
  };
}

/** How far a hazard's near edge is ahead of the car's nose; negative once beside or behind it. */
export function gapOf(drive: Drive, hazard: Hazard): number {
  return hazard.position - drive.car.nose;
}

/** Advances the drive by one step. `pressed` is the driver's button this step. */
export function stepDrive(drive: Drive, pressed: boolean): DriveEvent[] {
  const events: DriveEvent[] = [];
  const { car } = drive;

  if (pressed) press(drive, events);
  while (car.heldPresses.length > 0 && (car.heldPresses[0] as number) <= drive.roadTime) {
    car.heldPresses.shift();
    switchLane(drive, events, pressTarget(drive.road, car.nose, car.lane), true, false);
  }

  advanceRoad(drive, events);
  const lanes = layoutAt(drive.road, car.nose).count;
  if (lanes !== car.lanes) {
    car.lanes = lanes;
    events.push({ type: 'lanes', lanes });
  }

  for (const hazard of drive.hazards) {
    if (hazard.passed) continue;
    const hopFrom = moveHazard(drive, hazard, events);
    if (hopFrom !== null && hazard.revealed && car.lane === hopFrom && hopFrom !== hazard.lane) {
      const gap = gapOf(drive, hazard);
      hazard.escape = { gap, seconds: gap / drive.speed, byCar: false };
    }
    meetCar(drive, hazard, events);
  }
  return events;
}

/**
 * The road's own clock, shared by every mode: one step of time, the nose
 * moved on, and a beat event when one goes by.
 */
export function advanceRoad(drive: Drive, events: DriveEvent[]) {
  const { car } = drive;
  const beatBefore = beatIndex(drive);
  drive.steps += 1;
  drive.roadTime = drive.steps * STEP_SECONDS;
  car.nose = drive.route ? drive.route(drive.roadTime) : car.nose + drive.speed * STEP_SECONDS;
  const beatAfter = beatIndex(drive);
  if (beatAfter !== null && beatAfter !== beatBefore)
    events.push({ type: 'beat', index: beatAfter });
}

/**
 * What a hazard does by itself as the road comes on: it comes into view at
 * the sight line, a hesitant donkey hops and then commits. Returns the lane
 * a donkey hopped out of this step, if it hopped.
 */
export function moveHazard(drive: Drive, hazard: Hazard, events: DriveEvent[]): number | null {
  const gap = gapOf(drive, hazard);
  if (!hazard.revealed && gap <= revealGap(drive.climb)) {
    hazard.revealed = true;
    events.push({ type: 'reveal', hazard });
  }

  let hopFrom: number | null = null;
  const hop = hazard.hops.at(-1);
  if (hop && gap <= hop.gap) {
    hazard.hops.pop();
    hopFrom = hazard.lane;
    hazard.lane = hop.lane;
    events.push({ type: 'hop', hazard, from: hopFrom });
  }

  if (!hazard.committed && hazard.commitGap !== null && gap <= hazard.commitGap) {
    hazard.committed = true;
    events.push({ type: 'commit', hazard });
  }
  return hopFrom;
}

function press(drive: Drive, events: DriveEvent[]) {
  const { car } = drive;
  if (isMuddy(drive.road, car.nose, car.lane)) {
    const last = car.heldPresses.at(-1) ?? drive.roadTime;
    car.heldPresses.push(Math.max(last, drive.roadTime) + MUD_DELAY);
    events.push({ type: 'stuck', lane: car.lane });
    return;
  }
  switchLane(drive, events, pressTarget(drive.road, car.nose, car.lane), false, false);
}

function switchLane(
  drive: Drive,
  events: DriveEvent[],
  to: number,
  held: boolean,
  forced: boolean,
) {
  const { car } = drive;
  const from = car.lane;
  if (to === from) return;
  const dodging = markEscapes(drive, from, car.nose);
  car.previousLane = from;
  car.lane = to;
  car.switchedAt = drive.roadTime;
  const merging = !forced && !inLayout(layoutAt(drive.road, car.nose), from);
  const onBeat =
    dodging &&
    !forced &&
    drive.beatSeconds !== null &&
    offBeat(drive.roadTime, drive.beatSeconds) <= RHYTHM_WINDOW;
  events.push({ type: 'switch', from, to, dodging, merging, onBeat, held, forced });
}

/**
 * Notes, on every donkey and barrier still ahead in `lane`, that a car just
 * left that lane and how close it was. Returns whether there was one.
 */
export function markEscapes(drive: Drive, lane: number, nose: number): boolean {
  let dodging = false;
  for (const hazard of drive.hazards) {
    if (!isLiveObstacle(hazard) || hazard.lane !== lane) continue;
    const gap = hazard.position - nose;
    if (gap > 0) {
      hazard.escape = { gap, seconds: gap / drive.speed, byCar: true };
      dodging = true;
    }
  }
  return dodging;
}

/** Whether a hazard and a car in `lane` are side by side at this moment. */
export function isAlongside(hazard: Hazard, nose: number): boolean {
  const gap = hazard.position - nose;
  return gap <= 0 && gap > -(CAR_LENGTH + hazard.depth);
}

function meetCar(drive: Drive, hazard: Hazard, events: DriveEvent[]) {
  const { car } = drive;
  const gap = gapOf(drive, hazard);
  const sameLane = hazard.lane === car.lane;
  const alongside = isAlongside(hazard, car.nose);
  const shielded = drive.roadTime < car.graceUntil;

  if (hazard.kind === 'carrot') {
    if (alongside && sameLane && !hazard.collected) {
      hazard.collected = true;
      events.push({ type: 'carrot', hazard });
    }
  } else {
    if (hazard.revealed && sameLane && gap > 0) hazard.threatened = true;
    if (alongside && sameLane && !hazard.hit) {
      if (!shielded) {
        hazard.hit = true;
        events.push({ type: 'crash', hazard });
        return;
      }
      // A shielded car cannot drive through the end of its lane: it is waved across instead.
      if (hazard.kind === 'barrier') {
        switchLane(drive, events, mergeTarget(drive.road, car.nose, car.lane), false, true);
      }
    }
  }

  if (gap <= -(CAR_LENGTH + hazard.depth)) {
    hazard.passed = true;
    if (hazard.kind !== 'carrot' && !hazard.hit && !shielded) events.push(passOf(hazard));
  }
}

/** A crashed car set back on its way: out of a lane that has ended, into the one beside it. */
export function leaveClosedLane(drive: Drive): DriveEvent[] {
  const events: DriveEvent[] = [];
  const { car } = drive;
  const to = mergeTarget(drive.road, car.nose, car.lane);
  if (to !== car.lane) switchLane(drive, events, to, false, true);
  return events;
}

export function passOf(hazard: Hazard): Extract<DriveEvent, { type: 'pass' }> {
  const escape = hazard.escape;
  const threatened = hazard.threatened;
  const nearMiss = threatened && escape?.byCar ? nearMissTier(escape.seconds) : null;
  if (nearMiss) return { type: 'pass', hazard, threatened, nearMiss, neutral: false };
  // A barrier only ever pays: a calm merge is fine, but it is not a dodge.
  const neutral = threatened && (hazard.kind === 'barrier' || !escape?.byCar);
  return { type: 'pass', hazard, threatened, nearMiss: null, neutral };
}

export function isLiveObstacle(hazard: Hazard): boolean {
  return hazard.kind !== 'carrot' && hazard.revealed && !hazard.passed && !hazard.hit;
}

function beatIndex(drive: Drive): number | null {
  if (drive.beatSeconds === null) return null;
  return Math.floor(drive.roadTime / drive.beatSeconds);
}

/** The donkeys, barriers and carrots a view should draw. */
export function visibleHazards(drive: Drive): Hazard[] {
  return drive.hazards.filter((hazard) => hazard.revealed && !hazard.collected);
}

/** Forgets hazards far behind the car. */
export function pruneHazards(drive: Drive, behind = 40) {
  drive.hazards = drive.hazards.filter((hazard) => gapOf(drive, hazard) > -behind);
}
