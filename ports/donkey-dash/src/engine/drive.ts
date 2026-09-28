import { CAR_LENGTH, MUD_DELAY, STEP_SECONDS } from './constants';
import type { Hazard } from './hazards';
import { isMuddy, lanesAt, nextLane, remapLane, type LaneCount, type Road } from './road';
import { nearMissTier, offBeat, RHYTHM_WINDOW, type NearMissTierInfo } from './scoring';
import { revealGap } from './sight';

/**
 * The part every mode shares: a car driving up a road at some speed, one
 * button that moves it a lane to the right (and from the rightmost lane back
 * to the leftmost), and whatever is standing on the road ahead.
 *
 * The duel and run rules sit on top (duel.ts, run.ts). They decide the
 * speed, put hazards on the road, and turn the events below into points.
 */
export interface Car {
  lane: number;
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
      /** Left a lane with a donkey coming. */
      dodging: boolean;
      /** Within RHYTHM_WINDOW of a beat. Only judged in the runs. */
      onBeat: boolean;
      /** Went through late because of mud. */
      held: boolean;
    }
  | { type: 'stuck'; lane: number }
  | { type: 'reveal'; hazard: Hazard }
  | { type: 'hop'; hazard: Hazard; from: number }
  | { type: 'commit'; hazard: Hazard }
  | { type: 'crash'; hazard: Hazard }
  | {
      /** A donkey is fully behind the car, and the car is fine. */
      type: 'pass';
      hazard: Hazard;
      /** It was in the car's lane at some point after it came into view. */
      threatened: boolean;
      /** How close the escape was, or null for a comfortable one. */
      nearMiss: NearMissTierInfo | null;
      /** The donkey moved away by itself: this neither builds nor breaks a combo. */
      neutral: boolean;
    }
  | { type: 'carrot'; hazard: Hazard }
  | { type: 'beat'; index: number }
  | { type: 'lanes'; lanes: LaneCount };

export function createDrive(road: Road, speed: number, beatSeconds: number | null = null): Drive {
  return {
    road,
    car: {
      lane: 0,
      lanes: lanesAt(road, 0),
      nose: 0,
      previousLane: 0,
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
    switchLane(drive, events, true);
  }

  const beatBefore = beatIndex(drive);
  drive.steps += 1;
  drive.roadTime = drive.steps * STEP_SECONDS;
  car.nose = drive.route ? drive.route(drive.roadTime) : car.nose + drive.speed * STEP_SECONDS;
  const beatAfter = beatIndex(drive);
  if (beatAfter !== null && beatAfter !== beatBefore)
    events.push({ type: 'beat', index: beatAfter });

  const lanes = lanesAt(drive.road, car.nose);
  if (lanes !== car.lanes) {
    car.lane = remapLane(car.lane, car.lanes, lanes);
    car.previousLane = remapLane(car.previousLane, car.lanes, lanes);
    car.lanes = lanes;
    events.push({ type: 'lanes', lanes });
  }

  for (const hazard of drive.hazards) {
    if (!hazard.passed) updateHazard(drive, hazard, events);
  }
  return events;
}

function press(drive: Drive, events: DriveEvent[]) {
  const { car } = drive;
  if (isMuddy(drive.road, car.nose, car.lane)) {
    const last = car.heldPresses.at(-1) ?? drive.roadTime;
    car.heldPresses.push(Math.max(last, drive.roadTime) + MUD_DELAY);
    events.push({ type: 'stuck', lane: car.lane });
    return;
  }
  switchLane(drive, events, false);
}

function switchLane(drive: Drive, events: DriveEvent[], held: boolean) {
  const { car } = drive;
  const from = car.lane;
  const to = nextLane(from, car.lanes);
  let dodging = false;
  for (const hazard of drive.hazards) {
    if (!isLiveDonkey(hazard) || hazard.lane !== from) continue;
    const gap = gapOf(drive, hazard);
    if (gap > 0) {
      hazard.escape = { gap, seconds: gap / drive.speed, byCar: true };
      dodging = true;
    }
  }
  car.previousLane = from;
  car.lane = to;
  car.switchedAt = drive.roadTime;
  const onBeat =
    dodging &&
    drive.beatSeconds !== null &&
    offBeat(drive.roadTime, drive.beatSeconds) <= RHYTHM_WINDOW;
  events.push({ type: 'switch', from, to, dodging, onBeat, held });
}

function updateHazard(drive: Drive, hazard: Hazard, events: DriveEvent[]) {
  const { car } = drive;
  const gap = gapOf(drive, hazard);

  if (!hazard.revealed && gap <= revealGap(drive.climb)) {
    hazard.revealed = true;
    events.push({ type: 'reveal', hazard });
  }

  const hop = hazard.hops.at(-1);
  if (hop && gap <= hop.gap) {
    hazard.hops.pop();
    const from = hazard.lane;
    hazard.lane = hop.lane;
    if (hazard.revealed && car.lane === from && from !== hop.lane) {
      hazard.escape = { gap, seconds: gap / drive.speed, byCar: false };
    }
    events.push({ type: 'hop', hazard, from });
  }

  if (!hazard.committed && hazard.commitGap !== null && gap <= hazard.commitGap) {
    hazard.committed = true;
    events.push({ type: 'commit', hazard });
  }

  const alongside = gap <= 0 && gap > -(CAR_LENGTH + hazard.depth);
  const sameLane = hazard.lane === car.lane;
  const shielded = drive.roadTime < car.graceUntil;

  if (hazard.kind === 'carrot') {
    if (alongside && sameLane && !hazard.collected) {
      hazard.collected = true;
      events.push({ type: 'carrot', hazard });
    }
  } else {
    if (hazard.revealed && sameLane && gap > 0) hazard.threatened = true;
    if (alongside && sameLane && !shielded && !hazard.hit) {
      hazard.hit = true;
      events.push({ type: 'crash', hazard });
      return;
    }
  }

  if (gap <= -(CAR_LENGTH + hazard.depth)) {
    hazard.passed = true;
    if (hazard.kind === 'donkey' && !hazard.hit && !shielded) events.push(passOf(hazard));
  }
}

function passOf(hazard: Hazard): DriveEvent {
  const escape = hazard.escape;
  const threatened = hazard.threatened;
  if (!threatened || !escape || !escape.byCar) {
    return { type: 'pass', hazard, threatened, nearMiss: null, neutral: threatened };
  }
  return {
    type: 'pass',
    hazard,
    threatened,
    nearMiss: nearMissTier(escape.seconds),
    neutral: false,
  };
}

function isLiveDonkey(hazard: Hazard): boolean {
  return hazard.kind === 'donkey' && hazard.revealed && !hazard.passed && !hazard.hit;
}

function beatIndex(drive: Drive): number | null {
  if (drive.beatSeconds === null) return null;
  return Math.floor(drive.roadTime / drive.beatSeconds);
}

/** The donkeys and carrots a view should draw. */
export function visibleHazards(drive: Drive): Hazard[] {
  return drive.hazards.filter((hazard) => hazard.revealed && !hazard.collected);
}

/** Forgets hazards far behind the car. */
export function pruneHazards(drive: Drive, behind = 40) {
  drive.hazards = drive.hazards.filter((hazard) => gapOf(drive, hazard) > -behind);
}
