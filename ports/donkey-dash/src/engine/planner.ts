import { createRng, type Rng } from '@shared/rng';
import {
  BARRIER_DEPTH,
  CAR_LENGTH,
  CLOSING_DISTANCE,
  DONKEY_DEPTH,
  SIGHT_DISTANCE,
} from './constants';
import type { Drive } from './drive';
import { makeBarrier, makeCarrot, makeDonkey, type DonkeyRole, type WobbleHop } from './hazards';
import {
  canGetPast,
  standingAfter,
  type Course,
  type Obstacle,
  type Standing,
  type Steering,
} from './reach';
import {
  endOf,
  inLayout,
  LANE_POSITIONS,
  lanesOf,
  MIDDLE_TWO,
  TAPER_LENGTH,
  type LaneChange,
  type Layout,
  type SignKind,
} from './road';

/**
 * Lays out the road for the runs (Endless, Road Trip, Daily Road) and for
 * Rival Driver, a few seconds ahead of the car, from a seed alone. Nothing
 * the player does changes it, so everyone driving the same seed meets the
 * same donkeys and the same bends.
 *
 * The road is built in beats of the soundtrack. Speed only changes on a beat,
 * so the planner knows exactly where the car will be at every beat, and it
 * places each row of donkeys, and each barrier where a lane ends, where it
 * will come into view right on one.
 *
 * Every obstacle is checked against the one before it with reach.ts: from
 * any lane the last one may have left the player in, there must be a way
 * past this one for a player with human reactions, given where the road's
 * lanes open and close in between. A row that does not fit waits half a
 * beat and tries again.
 */
export type PhraseKind =
  'single' | 'carrots' | 'pair' | 'mud' | 'wobbler' | 'three-lanes' | 'herd' | 'shift' | 'gate';

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
  /** How often each kind comes up once introduced; the defaults suit the one-button modes. */
  weights?: Partial<Record<PhraseKind, number>>;
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
  /** One button that cycles through the lanes, or Rival Driver's left and right. */
  steering?: Steering;
  /** The open lanes at the start; two in the middle unless said otherwise. */
  start?: Layout;
  /**
   * Rival Driver: a car may also ride this many metres ahead of the row the
   * road is laid for, meeting everything sooner with the same view. Every
   * obstacle must suit a car there too.
   */
  ahead?: number;
}

/** Rows sit on this grid of beats: on the beat, or halfway between two. */
const GRID = 0.5;
const LOOKAHEAD = 45;
const BOSS_BEATS = 36;
const MAX_TRIES = 64;
const FINISH_CLEARANCE = 24;

interface RowSpec {
  blocked: number[];
  role: DonkeyRole;
  wobble?: boolean;
  /** Carrots riding along in the gaps of this row. */
  carrots?: number[];
  /** This row is the barrier at the end of a closing lane. */
  barrier?: LaneChange;
}

interface PlacedRow extends Obstacle {
  beat: number;
}

export class RoadPlanner {
  readonly beatSeconds: number;
  private readonly rng: Rng;
  /** Road position of the nose at the start of each beat. */
  private readonly beatStarts: number[] = [0];
  /** Where the player may be after the last obstacle, and from when. */
  private standing: Standing;
  /** The same for a car riding `config.ahead` in front. */
  private aheadStanding: Standing;
  private lastObstacle: PlacedRow | null = null;
  /** The next phrase starts no earlier than this beat. */
  private cursor: number;
  private readonly seen = new Set<PhraseKind>();
  /** The open lanes as far as the road has been laid. */
  private layout: Layout;
  /** Where the last change of the road's shape is over; the next one waits for it. */
  private changesUntil = -Infinity;
  private finished = false;
  /** Rival Driver's photo finish: from here on, every phrase is a row with one gap. */
  private gatesOnly = false;

  constructor(private readonly config: PlanConfig) {
    this.beatSeconds = 60 / config.bpm;
    this.rng = createRng(config.seed);
    this.cursor = config.leadInBeats;
    this.layout = config.start ?? MIDDLE_TWO;
    // One car starts on the left; with two, any lane may be taken.
    const starts = config.steering === 'two-button' ? lanesOf(this.layout) : [this.layout.first];
    this.standing = { lanes: starts, clearedAt: 0 };
    this.aheadStanding = this.standing;
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
    while ((this.beatStarts.at(-1) as number) <= position) this.extendTo(this.beatStarts.length);
    // The last beat that starts at or before `position`.
    let low = 0;
    let high = this.beatStarts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if ((this.beatStarts[middle] as number) <= position) low = middle;
      else high = middle - 1;
    }
    const start = this.beatStarts[low] as number;
    const fraction = (position - start) / (this.speedAtBeat(low) * this.beatSeconds);
    return (low + fraction) * this.beatSeconds;
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

  /** Where a row must stand to come into view exactly at `beat`. */
  private rowPosition(beat: number): number {
    return this.positionAtBeat(beat) + SIGHT_DISTANCE;
  }

  /** The first beat on the grid whose row would stand at or beyond `position`. */
  private beatForRow(position: number): number {
    const beat = this.timeAtPosition(position - SIGHT_DISTANCE) / this.beatSeconds;
    return Math.ceil(beat / GRID - 1e-9) * GRID;
  }

  private nextPhrase(drive: Drive) {
    const { lengthBeats, boss } = this.config;
    if (lengthBeats !== null) {
      const bossStart = boss ? lengthBeats - BOSS_BEATS : lengthBeats;
      if (this.cursor >= bossStart - 2) {
        if (boss) this.bossHerd(drive);
        this.finished = true;
        // A herd that runs long pushes the finish line back rather than past its last row.
        const last = this.lastObstacle;
        if (last && drive.road.finish !== null) {
          drive.road.finish = Math.max(drive.road.finish, last.position + FINISH_CLEARANCE);
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

  /** From now on only rows with a single gap, so a tied race is settled quickly. */
  suddenDeath() {
    this.gatesOnly = true;
  }

  private chooseKind(): PhraseKind {
    if (this.gatesOnly) return 'gate';
    const unlocked = (Object.keys(this.config.introduce) as PhraseKind[]).filter(
      (kind) => (this.config.introduce[kind] ?? Infinity) <= this.cursor,
    );
    // A kind that has just been unlocked appears straight away, so the sign means something.
    const fresh = unlocked.find((kind) => !this.seen.has(kind) && kind !== 'single');
    if (fresh) return fresh;
    const weights = { ...WEIGHTS, ...this.config.weights };
    const weighted = unlocked.flatMap((kind) => Array<PhraseKind>(weights[kind]).fill(kind));
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
    for (let tries = 0; tries < MAX_TRIES && !this.rowFits(drive, row, spec); tries++) {
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
    const depth = spec.barrier ? BARRIER_DEPTH : DONKEY_DEPTH;
    return {
      beat,
      position,
      arrival,
      known: spec.wobble ? arrival - this.config.wobbleCommitSeconds : beat * this.beatSeconds,
      clear: (CAR_LENGTH + depth) / speed,
      blocked: spec.blocked,
    };
  }

  private rowFits(drive: Drive, row: PlacedRow, spec: RowSpec): boolean {
    if (spec.blocked.length === 0) return true;
    const { slack } = this.config;
    // A hesitant donkey only decides once the one before it is gone.
    if (spec.wobble && row.known < this.standing.clearedAt + slack) return false;
    if (!canGetPast(this.course(drive), this.standing, row)) return false;
    const { ahead } = this.config;
    return (
      !ahead || canGetPast(this.course(drive, ahead), this.aheadStanding, this.met(row, ahead))
    );
  }

  /** The road as reach.ts sees it, for checking a pattern, for a car `lead` metres ahead of the row. */
  private course(drive: Drive, lead = 0): Course {
    return {
      road: drive.road,
      steering: this.config.steering ?? 'one-button',
      slack: this.config.slack,
      timeAtPosition: (position) => this.timeAtPosition(position - lead),
      positionAtTime: (time) => this.positionAtTime(time) + lead,
    };
  }

  /** An obstacle as a car `lead` metres ahead meets it: sooner, though it comes into view no earlier. */
  private met(row: PlacedRow, lead: number): PlacedRow {
    return { ...row, arrival: this.timeAtPosition(row.position - lead) };
  }

  private commit(drive: Drive, row: PlacedRow, spec: RowSpec) {
    const speed = this.speedAtBeat(row.arrival / this.beatSeconds);
    if (spec.barrier) {
      spec.barrier.barrier = row.position;
      this.changesUntil = endOf(spec.barrier);
      for (const lane of spec.blocked) {
        drive.hazards.push(makeBarrier(drive.nextHazardId++, row.position, lane));
      }
    } else {
      for (const lane of spec.blocked) {
        const hops = spec.wobble ? this.wobble(lane, speed) : [];
        const start = hops.length > 0 ? this.otherLane(hops.at(-1)?.lane ?? lane) : lane;
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
    }
    for (const lane of spec.carrots ?? []) {
      drive.hazards.push(makeCarrot(drive.nextHazardId++, row.position + 0.2, lane));
    }
    if (spec.blocked.length > 0) {
      this.standing = standingAfter(drive.road, row);
      const { ahead } = this.config;
      if (ahead) this.aheadStanding = standingAfter(drive.road, this.met(row, ahead));
      this.lastObstacle = row;
    }
    this.cursor = row.beat + GRID;
  }

  /** Hops for a hesitant donkey that ends up in `lane`, the last just before it commits. */
  private wobble(lane: number, speed: number): WobbleHop[] {
    const commitGap = speed * this.config.wobbleCommitSeconds;
    const count = this.rng.int(1, 3);
    const hops: WobbleHop[] = [];
    let current = lane;
    // Built backwards from where it settles, so the last hop always lands in `lane`.
    for (let index = 0; index < count; index++) {
      const gap = commitGap + ((SIGHT_DISTANCE - commitGap) * (index + 0.6)) / (count + 0.6);
      hops.push({ gap, lane: current });
      current = this.otherLane(current);
    }
    return hops;
  }

  /** Another open lane than `lane`, at random. */
  otherLane(lane: number): number {
    return this.rng.pick(this.openLanes().filter((candidate) => candidate !== lane));
  }

  /**
   * Gives the road a new shape from the cursor on: `next` shares all but one
   * lane with the layout now. The new lane, if any, widens in just before;
   * `rows` are laid on the new road; and a closing lane gets its barrier at
   * least CLOSING_DISTANCE further on, wherever the rows leave room for it.
   */
  changeLayout(drive: Drive, next: Layout, rows?: (planner: RoadPlanner) => void) {
    const opens = lanesOf(next).find((lane) => !inLayout(this.layout, lane)) ?? null;
    const closes = lanesOf(this.layout).find((lane) => !inLayout(next, lane)) ?? null;
    const at = Math.max(this.rowPosition(this.cursor), this.changesUntil + 2 * TAPER_LENGTH);
    const change: LaneChange = { at, layout: next, opens, closes, barrier: null };
    drive.road.changes.push(change);
    this.layout = next;
    this.changesUntil = endOf(change);
    this.cursor = Math.max(this.cursor, this.beatForRow(at));
    rows?.(this);
    if (closes === null) return;
    this.placeRow(
      drive,
      { blocked: [closes], role: 'single', barrier: change },
      this.beatForRow(at + CLOSING_DISTANCE),
    );
  }

  /** The two-lane road slid one position left or right, or the three-lane one across. */
  shifted(): Layout {
    const { first, count } = this.layout;
    const options = [first - 1, first + 1].filter(
      (candidate) => candidate >= 0 && candidate + count <= LANE_POSITIONS,
    );
    return { first: this.rng.pick(options), count };
  }

  /** One more lane, on whichever side there is room. */
  widened(): Layout {
    const { first } = this.layout;
    const options = [first - 1, first].filter(
      (candidate) => candidate >= 0 && candidate + 3 <= LANE_POSITIONS,
    );
    return { first: this.rng.pick(options), count: 3 };
  }

  /** One lane fewer, closing either outer lane. */
  narrowed(): Layout {
    const { first } = this.layout;
    return { first: this.rng.pick([first, first + 1]), count: 2 };
  }

  get lanes(): number {
    return this.layout.count;
  }

  openLanes(): number[] {
    return lanesOf(this.layout);
  }

  /** Whether a kind of phrase has been introduced by now. */
  allows(kind: PhraseKind): boolean {
    return (this.config.introduce[kind] ?? Infinity) <= this.cursor;
  }

  randomLane(): number {
    return this.rng.pick(this.openLanes());
  }

  chance(probability: number): boolean {
    return this.rng.chance(probability);
  }

  between(min: number, max: number): number {
    return this.rng.int(min, max);
  }

  /** Widens the road for a stretch of rows built by `rows`, then closes one of its outer lanes. */
  threeLaneStretch(drive: Drive, rows: (planner: RoadPlanner) => void) {
    this.changeLayout(drive, this.widened(), (planner) => {
      // A breath on the wider road before the first row.
      planner.cursor += 1;
      rows(planner);
    });
    this.cursor += 1;
    this.changeLayout(drive, this.narrowed());
  }

  /** Lays mud over some lanes for the rows built by `rows`. */
  muddy(drive: Drive, lanes: number[], rows: (planner: RoadPlanner) => void) {
    const startBeat = this.cursor;
    // The patch is down before the rows, so the reach check knows a switch in it is slower.
    const patch = { from: this.rowPosition(startBeat), to: Infinity, lanes };
    drive.road.mud.push(patch);
    this.cursor += 1;
    rows(this);
    patch.to = this.rowPosition(this.cursor) + CAR_LENGTH;
  }

  private bossHerd(drive: Drive) {
    const { introduce, lengthBeats } = this.config;
    const end = lengthBeats ?? Infinity;
    drive.road.signs.push({ at: this.rowPosition(this.cursor), kind: 'boss' });
    this.cursor += 3;
    const rowsFor = (count: number) => {
      let gap = this.randomLane();
      for (let row = 0; row < count; row++) {
        if (this.chance(0.55)) gap = this.otherLane(gap);
        const blocked = this.openLanes().filter((lane) => lane !== gap);
        this.placeRow(drive, {
          blocked,
          role: 'boss',
          carrots: this.allows('carrots') && this.chance(0.25) ? [gap] : [],
        });
      }
    };
    const muddy = (introduce.mud ?? Infinity) <= end;
    const wide = (introduce['three-lanes'] ?? Infinity) <= end;
    if (muddy) this.muddy(drive, this.openLanes(), () => rowsFor(6));
    else rowsFor(6);
    this.cursor += 1;
    if (wide) this.threeLaneStretch(drive, () => rowsFor(8));
    else rowsFor(8);
  }
}

const SIGN_FOR: Partial<Record<PhraseKind, SignKind>> = {
  carrots: 'carrots',
  pair: 'pairs',
  mud: 'mud',
  wobbler: 'wobblers',
  'three-lanes': 'three-lanes',
  herd: 'herd',
  shift: 'shift',
};

const WEIGHTS: Record<PhraseKind, number> = {
  single: 5,
  carrots: 1,
  pair: 3,
  mud: 2,
  wobbler: 2,
  'three-lanes': 2,
  herd: 2,
  shift: 3,
  gate: 2,
};

type Phrase = (planner: RoadPlanner, drive: Drive) => void;

const PHRASES: Record<PhraseKind, Phrase> = {
  single(planner, drive) {
    const lane = planner.randomLane();
    const carrots =
      planner.allows('carrots') && planner.chance(0.25) ? [planner.otherLane(lane)] : [];
    planner.placeRow(drive, { blocked: [lane], role: 'single', carrots });
  },

  pair(planner, drive) {
    const lane = planner.randomLane();
    planner.placeRow(drive, { blocked: [lane], role: 'pair' });
    planner.placeRow(drive, { blocked: [planner.otherLane(lane)], role: 'pair' });
  },

  carrots(planner, drive) {
    let lane = planner.randomLane();
    const count = planner.between(4, 6);
    for (let index = 0; index < count; index++) {
      if (index === Math.floor(count / 2) && planner.chance(0.5)) lane = planner.otherLane(lane);
      planner.placeRow(drive, { blocked: [], role: 'single', carrots: [lane] });
    }
  },

  mud(planner, drive) {
    const lanes = planner.chance(0.5) ? planner.openLanes() : [planner.randomLane()];
    planner.muddy(drive, lanes, () => {
      const count = planner.between(2, 3);
      for (let row = 0; row < count; row++) {
        planner.placeRow(drive, { blocked: [planner.randomLane()], role: 'single' });
      }
    });
  },

  wobbler(planner, drive) {
    planner.placeRow(drive, { blocked: [planner.randomLane()], role: 'wobbler', wobble: true });
  },

  'three-lanes'(planner, drive) {
    planner.threeLaneStretch(drive, () => {
      const count = planner.between(3, 5);
      for (let row = 0; row < count; row++) gateOrSingle(planner, drive, 0.45);
    });
  },

  herd(planner, drive) {
    let gap = planner.randomLane();
    const count = planner.between(4, 7);
    for (let row = 0; row < count; row++) {
      if (planner.chance(0.5)) gap = planner.otherLane(gap);
      const blocked = planner.openLanes().filter((lane) => lane !== gap);
      planner.placeRow(drive, { blocked, role: 'herd' });
    }
  },

  gate(planner, drive) {
    gateOrSingle(planner, drive, 1);
  },

  shift(planner, drive) {
    planner.changeLayout(drive, planner.shifted(), () => {
      // Now and then a donkey stands where the merging car wants to go.
      if (planner.chance(0.5)) {
        planner.placeRow(drive, { blocked: [planner.randomLane()], role: 'single' });
      }
    });
  },
};

/** On three lanes: either a single donkey, or a row with one gap. */
function gateOrSingle(planner: RoadPlanner, drive: Drive, gateChance: number) {
  const gap = planner.randomLane();
  const others = planner.openLanes().filter((lane) => lane !== gap);
  const gate = planner.lanes > 2 && planner.chance(gateChance);
  const blocked = gate ? others : [others[planner.between(0, others.length - 1)] as number];
  const carrots = !gate && planner.allows('carrots') && planner.chance(0.3) ? [gap] : [];
  planner.placeRow(drive, { blocked, role: 'herd', carrots });
}
