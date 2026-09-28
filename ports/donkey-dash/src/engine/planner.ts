import { createRng, type Rng } from '@shared/rng';
import {
  CAR_LENGTH,
  DONKEY_DEPTH,
  MUD_DELAY,
  PRESS_SECONDS,
  REACTION_SECONDS,
  SIGHT_DISTANCE,
} from './constants';
import type { Drive } from './drive';
import { makeCarrot, makeDonkey, type DonkeyRole, type WobbleHop } from './hazards';
import {
  pressesBetween,
  remapLane,
  TRANSITION_LENGTH,
  type LaneCount,
  type SignKind,
} from './road';

/**
 * Lays out the road for the runs (Endless, Road Trip, Daily Road), a few
 * seconds ahead of the car, from a seed alone. Nothing the player does
 * changes it, so everyone driving the same seed meets the same donkeys.
 *
 * The road is built in beats of the soundtrack. Speed only changes on a beat,
 * so the planner knows exactly where the car will be at every beat, and it
 * places each row of donkeys where it will come into view right on one.
 *
 * Every row is checked against the one before it: the car must have time to
 * clear the earlier donkeys, press as often as the lane change needs (more in
 * mud), and still see the new row coming. See `rowFits`.
 */
export type PhraseKind = 'single' | 'carrots' | 'pair' | 'mud' | 'wobbler' | 'three-lanes' | 'herd';

export interface SpeedCurve {
  /** m/s at the first beat. */
  start: number;
  /** The speed the curve approaches but never quite reaches. */
  max: number;
  /** After this many beats the speed is halfway from start to max. */
  rampBeats: number;
}

export interface PlanConfig {
  seed: number;
  bpm: number;
  speed: SpeedCurve;
  /** The beat from which each kind of phrase may appear; kinds left out never do. */
  introduce: Partial<Record<PhraseKind, number>>;
  /** Beats of rest between phrases, easing from `start` to `end` like the speed. */
  rest: { start: number; end: number };
  /** Seconds of room beyond what a quick player needs, in every pattern. */
  slack: number;
  /** A hesitant donkey settles into its lane this long before it would reach the car. */
  wobbleCommitSeconds: number;
  /** Runs with an end: the finish line comes into view at this beat. */
  lengthBeats: number | null;
  /** Ends the run with a long stubborn herd. */
  boss: boolean;
  /** Empty beats at the start, while the music comes in. */
  leadInBeats: number;
}

/** Rows sit on this grid of beats: on the beat, or halfway between two. */
const GRID = 0.5;
const LOOKAHEAD = 45;
const BOSS_BEATS = 36;
const MAX_TRIES = 64;
const FINISH_CLEARANCE = 24;
/** Metres of plain road kept clear around a widening or narrowing. */
const TRANSITION_CLEARANCE = TRANSITION_LENGTH + 3;

interface RowSpec {
  lanes: LaneCount;
  blocked: number[];
  role: DonkeyRole;
  mud?: boolean;
  wobble?: boolean;
  /** Carrots riding along in the gaps of this row. */
  carrots?: number[];
}

interface PlacedRow {
  beat: number;
  position: number;
  arrival: number;
  lanes: LaneCount;
  free: number[];
  /** Seconds the car needs after arrival before another lane is safe. */
  clear: number;
}

export class RoadPlanner {
  readonly beatSeconds: number;
  private readonly rng: Rng;
  /** Road position of the nose at the start of each beat. */
  private readonly beatStarts: number[] = [0];
  private last: PlacedRow | null = null;
  /** The next phrase starts no earlier than this beat. */
  private cursor: number;
  private readonly seen = new Set<PhraseKind>();
  private lanes: LaneCount = 2;
  private finished = false;
  /** Presses anywhere before this road position may still be slowed by mud. */
  private mudUntil = -Infinity;

  constructor(private readonly config: PlanConfig) {
    this.beatSeconds = 60 / config.bpm;
    this.rng = createRng(config.seed);
    this.cursor = config.leadInBeats;
  }

  speedAtBeat(beat: number): number {
    const { start, max, rampBeats } = this.config.speed;
    const whole = Math.max(0, Math.floor(beat));
    return start + ((max - start) * whole) / (whole + rampBeats);
  }

  /** Where the nose is at road time `beat × beatSeconds`. */
  positionAtBeat(beat: number): number {
    const whole = Math.floor(beat);
    this.extendTo(whole + 1);
    const start = this.beatStarts[whole] as number;
    return start + (beat - whole) * this.speedAtBeat(whole) * this.beatSeconds;
  }

  positionAtTime(seconds: number): number {
    return this.positionAtBeat(seconds / this.beatSeconds);
  }

  /** The road time at which the nose reaches `position`. */
  timeAtPosition(position: number): number {
    let whole = 0;
    while (this.positionAtBeat(whole + 1) <= position) whole++;
    const start = this.beatStarts[whole] as number;
    const fraction = (position - start) / (this.speedAtBeat(whole) * this.beatSeconds);
    return (whole + fraction) * this.beatSeconds;
  }

  finishPosition(): number | null {
    const { lengthBeats } = this.config;
    return lengthBeats === null ? null : this.positionAtBeat(lengthBeats) + SIGHT_DISTANCE;
  }

  /** Puts everything up to a little beyond the car's view onto the road. */
  fill(drive: Drive) {
    const horizon = drive.car.nose + SIGHT_DISTANCE + LOOKAHEAD;
    while (!this.finished && this.rowPosition(this.cursor) < horizon) this.nextPhrase(drive);
  }

  private extendTo(beat: number) {
    while (this.beatStarts.length <= beat) {
      const index = this.beatStarts.length - 1;
      const start = this.beatStarts[index] as number;
      this.beatStarts.push(start + this.speedAtBeat(index) * this.beatSeconds);
    }
  }

  private rowPosition(beat: number): number {
    return this.positionAtBeat(beat) + SIGHT_DISTANCE;
  }

  private nextPhrase(drive: Drive) {
    const { lengthBeats, boss } = this.config;
    if (lengthBeats !== null) {
      const bossStart = boss ? lengthBeats - BOSS_BEATS : lengthBeats;
      if (this.cursor >= bossStart - 2) {
        if (boss) this.bossHerd(drive, lengthBeats);
        this.finished = true;
        // A herd that runs long pushes the finish line back rather than past its last row.
        const lastRow = this.last;
        if (lastRow && drive.road.finish !== null) {
          drive.road.finish = Math.max(drive.road.finish, lastRow.position + FINISH_CLEARANCE);
        }
        return;
      }
    }
    const kind = this.chooseKind();
    if (!this.seen.has(kind)) {
      this.seen.add(kind);
      const sign = SIGN_FOR[kind];
      if (sign) {
        drive.road.signs.push({ at: this.rowPosition(this.cursor), kind: sign });
        this.cursor += 2;
      }
    }
    PHRASES[kind](this, drive);
    this.cursor += this.restBeats();
  }

  private chooseKind(): PhraseKind {
    const unlocked = (Object.keys(this.config.introduce) as PhraseKind[]).filter(
      (kind) => (this.config.introduce[kind] ?? Infinity) <= this.cursor,
    );
    // A kind that has just been unlocked appears straight away, so the sign means something.
    const fresh = unlocked.find((kind) => !this.seen.has(kind) && kind !== 'single');
    if (fresh) return fresh;
    const weighted = unlocked.flatMap((kind) => Array<PhraseKind>(WEIGHTS[kind]).fill(kind));
    return weighted.length > 0 ? this.rng.pick(weighted) : 'single';
  }

  private restBeats(): number {
    const { rest, speed } = this.config;
    const progress = this.cursor / (this.cursor + speed.rampBeats);
    const beats = rest.start + (rest.end - rest.start) * progress;
    return Math.round(beats / GRID) * GRID + this.rng.int(0, 2) * GRID;
  }

  /** Places a row at the first beat from `earliest` where it can be driven; returns it. */
  placeRow(drive: Drive, spec: RowSpec, earliest = this.cursor): PlacedRow {
    let beat = Math.ceil(Math.max(earliest, this.cursor) / GRID) * GRID;
    let row = this.measure(beat, spec);
    // Waiting always makes room; the mode tables are tested to keep the reaction check reachable.
    for (let tries = 0; tries < MAX_TRIES && !this.rowFits(row, spec); tries++) {
      beat += GRID;
      row = this.measure(beat, spec);
    }
    this.commit(drive, row, spec);
    return row;
  }

  private measure(beat: number, spec: RowSpec): PlacedRow {
    const position = this.rowPosition(beat);
    const arrival = this.timeAtPosition(position);
    const speed = this.speedAtBeat(arrival / this.beatSeconds);
    const free = [0, 1, 2].slice(0, spec.lanes).filter((lane) => !spec.blocked.includes(lane));
    return {
      beat,
      position,
      arrival,
      lanes: spec.lanes,
      free,
      clear: (CAR_LENGTH + DONKEY_DEPTH) / speed,
    };
  }

  /**
   * Whether a player can get from wherever the last row left them to a free
   * lane of this one: clear the last row, press enough times, and see it
   * coming early enough to react.
   */
  private rowFits(row: PlacedRow, spec: RowSpec): boolean {
    if (spec.blocked.length === 0) return true;
    const { slack, wobbleCommitSeconds } = this.config;
    const window = spec.wobble ? wobbleCommitSeconds : row.arrival - row.beat * this.beatSeconds;
    const last = this.last;
    if (!last) return window - PRESS_SECONDS >= REACTION_SECONDS;
    const from = last.free.map((lane) => remapLane(lane, last.lanes, row.lanes));
    const presses = Math.max(
      ...from.map((lane) =>
        Math.min(...row.free.map((target) => pressesBetween(lane, target, row.lanes))),
      ),
    );
    const muddy = spec.mud === true || last.position + CAR_LENGTH + DONKEY_DEPTH < this.mudUntil;
    const perPress = PRESS_SECONDS + (muddy ? MUD_DELAY : 0);
    const clearedAt = last.arrival + last.clear;
    if (presses > 0 && row.arrival - clearedAt < presses * perPress + slack) return false;
    // A hesitant donkey only decides once the one before it is gone.
    if (spec.wobble && row.arrival - wobbleCommitSeconds < clearedAt + slack) return false;
    return window - presses * perPress >= REACTION_SECONDS;
  }

  private commit(drive: Drive, row: PlacedRow, spec: RowSpec) {
    const speed = this.speedAtBeat(row.arrival / this.beatSeconds);
    for (const lane of spec.blocked) {
      const hops = spec.wobble ? this.wobble(lane, spec.lanes, speed) : [];
      const start = hops.length > 0 ? this.firstLane(hops, lane, spec.lanes) : lane;
      drive.hazards.push(
        makeDonkey(
          drive.nextHazardId++,
          row.position,
          start,
          spec.role,
          hops,
          spec.wobble ? speed * this.config.wobbleCommitSeconds : null,
        ),
      );
    }
    for (const lane of spec.carrots ?? []) {
      drive.hazards.push(makeCarrot(drive.nextHazardId++, row.position + 0.2, lane));
    }
    if (spec.blocked.length > 0) this.last = row;
    this.cursor = row.beat + GRID;
  }

  /** Hops for a hesitant donkey that ends up in `lane`, the last just before it commits. */
  private wobble(lane: number, lanes: LaneCount, speed: number): WobbleHop[] {
    const commitGap = speed * this.config.wobbleCommitSeconds;
    const count = this.rng.int(1, 3);
    const hops: WobbleHop[] = [];
    let current = lane;
    // Built backwards from where it settles, so the last hop always lands in `lane`.
    for (let index = 0; index < count; index++) {
      const gap = commitGap + ((SIGHT_DISTANCE - commitGap) * (index + 0.6)) / (count + 0.6);
      hops.push({ gap, lane: current });
      current = this.otherLane(current, lanes);
    }
    return hops;
  }

  /** Where a hesitant donkey stands before its first hop, which is the last one built. */
  private firstLane(hops: WobbleHop[], lane: number, lanes: LaneCount): number {
    return this.otherLane(hops.at(-1)?.lane ?? lane, lanes);
  }

  private otherLane(lane: number, lanes: LaneCount): number {
    const others = [0, 1, 2].slice(0, lanes).filter((candidate) => candidate !== lane);
    return this.rng.pick(others);
  }

  /** Whether a kind of phrase has been introduced by now. */
  allows(kind: PhraseKind): boolean {
    return (this.config.introduce[kind] ?? Infinity) <= this.cursor;
  }

  randomLane(lanes: LaneCount = this.lanes): number {
    return this.rng.int(0, lanes - 1);
  }

  chance(probability: number): boolean {
    return this.rng.chance(probability);
  }

  between(min: number, max: number): number {
    return this.rng.int(min, max);
  }

  get currentLanes(): LaneCount {
    return this.lanes;
  }

  get nextBeat(): number {
    return this.cursor;
  }

  /** Beats at which the nose will have moved `metres` beyond where it is at `beat`. */
  beatsToCover(beat: number, metres: number): number {
    const target = this.positionAtBeat(beat) + metres;
    let later = beat;
    while (this.positionAtBeat(later) < target) later += GRID;
    return later - beat;
  }

  /** Widens the road for a stretch of rows built by `rows`, then narrows it again. */
  threeLaneStretch(drive: Drive, rows: (planner: RoadPlanner) => void) {
    const startBeat = this.cursor;
    const from = this.rowPosition(startBeat) + TRANSITION_CLEARANCE;
    this.cursor = startBeat + this.beatsToCover(startBeat, 2 * TRANSITION_CLEARANCE);
    // The planner thinks in three lanes until the merge.
    this.lanes = 3;
    rows(this);
    this.lanes = 2;
    const lastRow = this.last;
    const clearBeat = lastRow
      ? lastRow.beat +
        this.beatsToCover(lastRow.beat, CAR_LENGTH + DONKEY_DEPTH + TRANSITION_CLEARANCE)
      : this.cursor;
    const endBeat = Math.max(this.cursor, clearBeat);
    const to = this.rowPosition(endBeat);
    drive.road.stretches.push({ from, to });
    if (lastRow) {
      lastRow.free = lastRow.free.map((lane) => remapLane(lane, 3, 2));
      lastRow.lanes = 2;
    }
    this.cursor = endBeat + this.beatsToCover(endBeat, TRANSITION_CLEARANCE);
  }

  /** Lays mud over some lanes for the rows built by `rows`. */
  muddy(drive: Drive, lanes: number[], rows: (planner: RoadPlanner) => void) {
    const startBeat = this.cursor;
    this.cursor += 1;
    rows(this);
    const to = this.rowPosition(this.cursor) + CAR_LENGTH;
    drive.road.mud.push({ from: this.rowPosition(startBeat), to, lanes });
    this.mudUntil = to;
  }

  private bossHerd(drive: Drive, lengthBeats: number) {
    const introduce = this.config.introduce;
    drive.road.signs.push({ at: this.rowPosition(this.cursor), kind: 'boss' });
    this.cursor += 3;
    const rowsFor = (lanes: LaneCount, count: number, mud: boolean) => {
      let gap = this.randomLane(lanes);
      for (let row = 0; row < count; row++) {
        if (this.chance(0.55)) gap = this.otherLane(gap, lanes);
        const blocked = [0, 1, 2].slice(0, lanes).filter((lane) => lane !== gap);
        this.placeRow(drive, {
          lanes,
          blocked,
          role: 'boss',
          mud,
          carrots: this.allows('carrots') && this.chance(0.25) ? [gap] : [],
        });
      }
    };
    const muddy = (introduce.mud ?? Infinity) <= lengthBeats;
    const wide = (introduce['three-lanes'] ?? Infinity) <= lengthBeats;
    if (muddy) this.muddy(drive, [0, 1], () => rowsFor(2, 6, true));
    else rowsFor(2, 6, false);
    this.cursor += 1;
    if (wide) this.threeLaneStretch(drive, () => rowsFor(3, 8, false));
    else rowsFor(2, 8, false);
  }
}

const SIGN_FOR: Partial<Record<PhraseKind, SignKind>> = {
  carrots: 'carrots',
  pair: 'pairs',
  mud: 'mud',
  wobbler: 'wobblers',
  'three-lanes': 'three-lanes',
  herd: 'herd',
};

const WEIGHTS: Record<PhraseKind, number> = {
  single: 5,
  carrots: 1,
  pair: 3,
  mud: 2,
  wobbler: 2,
  'three-lanes': 2,
  herd: 2,
};

type Phrase = (planner: RoadPlanner, drive: Drive) => void;

const PHRASES: Record<PhraseKind, Phrase> = {
  single(planner, drive) {
    const lane = planner.randomLane();
    const carrots = planner.allows('carrots') && planner.chance(0.25) ? [1 - lane] : [];
    planner.placeRow(drive, { lanes: 2, blocked: [lane], role: 'single', carrots });
  },

  pair(planner, drive) {
    const lane = planner.randomLane();
    planner.placeRow(drive, { lanes: 2, blocked: [lane], role: 'pair' });
    planner.placeRow(drive, { lanes: 2, blocked: [1 - lane], role: 'pair' });
  },

  carrots(planner, drive) {
    let lane = planner.randomLane();
    const count = planner.between(4, 6);
    for (let index = 0; index < count; index++) {
      if (index === Math.floor(count / 2) && planner.chance(0.5)) lane = 1 - lane;
      planner.placeRow(drive, { lanes: 2, blocked: [], role: 'single', carrots: [lane] });
    }
  },

  mud(planner, drive) {
    const lanes = planner.chance(0.5) ? [0, 1] : [planner.randomLane()];
    planner.muddy(drive, lanes, () => {
      const count = planner.between(2, 3);
      for (let row = 0; row < count; row++) {
        planner.placeRow(drive, {
          lanes: 2,
          blocked: [planner.randomLane()],
          role: 'single',
          mud: true,
        });
      }
    });
  },

  wobbler(planner, drive) {
    planner.placeRow(drive, {
      lanes: 2,
      blocked: [planner.randomLane()],
      role: 'wobbler',
      wobble: true,
    });
  },

  'three-lanes'(planner, drive) {
    planner.threeLaneStretch(drive, () => {
      const count = planner.between(3, 5);
      for (let row = 0; row < count; row++) {
        const double = planner.chance(0.45);
        const gap = planner.randomLane(3);
        const blocked = double
          ? [0, 1, 2].filter((lane) => lane !== gap)
          : [[0, 1, 2].filter((lane) => lane !== gap)[planner.between(0, 1)] as number];
        const carrots = !double && planner.allows('carrots') && planner.chance(0.3) ? [gap] : [];
        planner.placeRow(drive, { lanes: 3, blocked, role: 'herd', carrots });
      }
    });
  },

  herd(planner, drive) {
    let gap = planner.randomLane();
    const count = planner.between(4, 7);
    for (let row = 0; row < count; row++) {
      if (planner.chance(0.5)) gap = 1 - gap;
      planner.placeRow(drive, { lanes: 2, blocked: [1 - gap], role: 'herd' });
    }
  },
};
