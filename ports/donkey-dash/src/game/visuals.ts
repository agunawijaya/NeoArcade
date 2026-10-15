import { CAR_LENGTH } from '../engine/constants';
import type { Drive, DriveEvent } from '../engine/drive';
import type { Hazard } from '../engine/hazards';
import { laneLateral, roadCentreAt } from '../engine/road';
import type { RivalEvent } from '../engine/rival';
import type { HatStyle, Look } from '../garage';
import { Effects } from '../render/effects';
import type { Palette } from '../render/palette';
import { LANE_METRES } from '../render/lanes';
import type { CarFrame, CrashFrame, Frame, HazardFrame } from '../render/view';

/**
 * Everything that moves only for the eyes: cars sliding between lanes,
 * hopping across the road and shuddering when a move is refused, donkeys
 * hopping and startling, the climb gliding, the beat flash and the
 * particles. It reads the engine, never writes to it.
 */
export interface SceneCar {
  /** Which car this is, so its motion carries on from frame to frame. */
  id: number;
  lane: number;
  ghost: boolean;
  stuck: boolean;
  look: Look;
  driver: 0 | 1 | null;
}

export interface SceneCrash {
  hazard: Hazard;
  age: number;
  /** The id of the car that crashed. */
  car: number;
  look: Look;
}

export interface SceneState {
  drive: Drive;
  /** The cars on the road; one that has crashed out is left out. */
  cars: SceneCar[];
  crashes: SceneCrash[];
  /** The road stands still while a crash plays out (every mode but Rival Driver). */
  freeze: boolean;
  /** Rival Driver: two cars share the road. */
  twoCars: boolean;
  summit: number | null;
  commitGap: number | null;
  dropLane: number | null;
  palette: Palette;
  /** What the second player's donkey wears in Donkey vs Driver. */
  rivalHat: HatStyle | null;
}

/** The scene's one car, in every mode but Rival Driver. */
export function soloCar(drive: Drive, look: Look): SceneCar {
  const { car } = drive;
  return {
    id: 0,
    lane: car.lane,
    ghost: drive.roadTime < car.graceUntil,
    stuck: car.heldPresses.length > 0,
    look,
    driver: null,
  };
}

interface CarMotion {
  lateral: number | null;
  hopStart: number;
  bumpStart: number;
  bumpDirection: number;
}

interface HazardMotion {
  lateral: number;
  hopFrom: number;
  hopStart: number;
  revealedAt: number;
  startledAt: number;
}

const SLIDE_RATE = 32;
const HOP_SECONDS = 0.22;
const CAR_HOP_SECONDS = 0.24;
const BUMP_SECONDS = 0.3;
const STARTLE_SECONDS = 0.6;

export class Visuals {
  readonly effects = new Effects();
  private time = 0;
  private climb = 0;
  private lastBeatAt = -Infinity;
  private previousNose = 0;
  private currentNose = 0;
  private readonly cars = new Map<number, CarMotion>();
  private readonly motions = new Map<number, HazardMotion>();
  private dazedId: number | null = null;
  /** After a crash in a duel, the next donkey trots in still seeing stars. */
  private dizzyNext = false;
  private dizzyId: number | null = null;

  constructor(private readonly reducedMotion: () => boolean) {}

  /** Call before each engine step, so rendering can interpolate between steps. */
  beforeStep(drive: Drive) {
    this.previousNose = drive.car.nose;
  }

  afterStep(drive: Drive) {
    this.currentNose = drive.car.nose;
    if (Math.abs(this.currentNose - this.previousNose) > 20) this.previousNose = this.currentNose;
  }

  /** Reacts to what the engine just did. */
  onEvent(event: DriveEvent | RivalEvent | { type: string }, drive: Drive) {
    switch (event.type) {
      case 'switch': {
        const change = event as Extract<DriveEvent, { type: 'switch' }>;
        // Pressing on the rightmost lane jumps the car right across to the leftmost.
        if (Math.abs(change.to - change.from) >= 2) this.carMotion(0).hopStart = this.time;
        break;
      }
      case 'bump': {
        const bump = event as Extract<RivalEvent, { type: 'bump' }>;
        const motion = this.carMotion(bump.car);
        const lateral = motion.lateral ?? laneLateral(bump.lane);
        motion.bumpStart = this.time;
        motion.bumpDirection = Math.sign(laneLateral(bump.lane) - lateral) || 1;
        if (bump.reason !== 'edge') {
          this.effects.puff(
            drive.car.nose - 0.4,
            (lateral + motion.bumpDirection * 0.35) * LANE_METRES,
          );
        }
        break;
      }
      case 'respawn': {
        // Back on the road somewhere else: it appears there rather than sliding across.
        const { car } = event as Extract<RivalEvent, { type: 'respawn' }>;
        this.carMotion(car).lateral = null;
        break;
      }
      case 'hop': {
        const { hazard, from } = event as Extract<DriveEvent, { type: 'hop' }>;
        const motion = this.motionOf(hazard);
        motion.hopFrom = laneLateral(from);
        motion.hopStart = this.time;
        break;
      }
      case 'pass': {
        const { hazard, nearMiss } = event as Extract<DriveEvent, { type: 'pass' }>;
        if (nearMiss) this.motionOf(hazard).startledAt = this.time;
        break;
      }
      case 'crash': {
        const { hazard } = event as Extract<DriveEvent, { type: 'crash' }>;
        if (hazard.kind === 'donkey') this.dazedId = hazard.id;
        const lateral = laneLateral(hazard.lane) * LANE_METRES;
        if (hazard.kind === 'barrier') this.effects.cones(hazard.position, lateral);
        else this.effects.crash(hazard.position, lateral);
        break;
      }
      case 'stuck':
        this.effects.splash(
          drive.car.nose - CAR_LENGTH * 0.8,
          (this.carMotion(0).lateral ?? 0) * LANE_METRES,
        );
        break;
      case 'carrot':
        this.effects.petals(drive.car.nose, (this.carMotion(0).lateral ?? 0) * LANE_METRES);
        break;
    }
  }

  onBeat() {
    this.lastBeatAt = this.time;
  }

  /** A fresh point in a duel, or a new road: forget the old road's animations. */
  reset() {
    this.dizzyNext = this.dazedId !== null;
    this.dizzyId = null;
    this.cars.clear();
    this.climb = 0;
    this.motions.clear();
    this.dazedId = null;
    this.effects.clear();
  }

  finish(nose: number) {
    this.effects.confetti(nose + 4, 6);
  }

  frame(scene: SceneState, alpha: number, frameSeconds: number): Frame {
    const reduced = this.reducedMotion();
    const frozen = scene.freeze && scene.crashes.length > 0;
    this.time += frameSeconds;
    this.effects.update(frameSeconds * (frozen ? 0.35 : 1));
    const { drive } = scene;
    const nose = this.previousNose + (this.currentNose - this.previousNose) * alpha;

    const cars = scene.cars.map((car) => this.carFrame(car, scene, frameSeconds, frozen, reduced));
    const climbRate = drive.climb < this.climb ? 40 : 9;
    this.climb += (drive.climb - this.climb) * (1 - Math.exp(-frameSeconds * climbRate));
    if (reduced) this.climb = drive.climb;

    const hazards: HazardFrame[] = [];
    // A barrier that has just been hit is drawn by its crash, rocking on its legs.
    const struck = new Set(scene.crashes.map((crash) => crash.hazard.id));
    for (const hazard of drive.hazards) {
      if (!hazard.revealed || hazard.collected) continue;
      if (hazard.kind === 'barrier' && struck.has(hazard.id)) continue;
      hazards.push(this.hazardFrame(hazard, scene, nose, reduced));
    }
    this.forgetGone(drive);

    const beatAge = this.time - this.lastBeatAt;
    return {
      time: this.time,
      nose,
      speed: drive.speed,
      climb: this.climb,
      road: drive.road,
      cars,
      twoCars: scene.twoCars,
      focus:
        cars.length > 0
          ? cars.reduce((sum, car) => sum + car.lateral, 0) / cars.length
          : roadCentreAt(drive.road, drive.car.nose),
      hazards,
      commitGap: scene.commitGap,
      dropLane: scene.dropLane,
      beatPulse: reduced ? 0 : Math.max(0, 1 - beatAge / 0.14),
      crashes: scene.crashes.map((crash) => this.crashFrame(crash, scene)),
      summit: scene.summit,
      palette: scene.palette,
      particles: this.effects.particles,
      reducedMotion: reduced,
    };
  }

  private carFrame(
    car: SceneCar,
    scene: SceneState,
    frameSeconds: number,
    frozen: boolean,
    reduced: boolean,
  ): CarFrame {
    const { drive } = scene;
    const motion = this.carMotion(car.id);
    const target = laneLateral(car.lane);
    if (motion.lateral === null || reduced) motion.lateral = target;
    const before = motion.lateral;
    motion.lateral += (target - motion.lateral) * (1 - Math.exp(-frameSeconds * SLIDE_RATE));
    const lean = reduced ? 0 : Math.max(-1, Math.min(1, (target - before) * 3));

    const hopAge = (this.time - motion.hopStart) / CAR_HOP_SECONDS;
    const hop = !reduced && hopAge >= 0 && hopAge < 1 ? Math.sin(hopAge * Math.PI) * 1.3 : 0;
    const bumpAge = (this.time - motion.bumpStart) / BUMP_SECONDS;
    const bump =
      !reduced && bumpAge >= 0 && bumpAge < 1
        ? motion.bumpDirection * Math.sin(bumpAge * Math.PI) * (1 - bumpAge)
        : 0;
    const bounce = reduced || frozen ? 0 : Math.abs(Math.sin(this.time * 11 + car.id * 1.7)) * 0.03;

    if (!frozen && !reduced && drive.speed > 0) {
      const across = motion.lateral * LANE_METRES;
      this.effects.wheels(drive.car.nose, across, CAR_LENGTH, drive.speed, frameSeconds, car.stuck);
      this.effects.trail(car.look.trail, drive.car.nose, across, CAR_LENGTH);
    }
    return {
      lateral: motion.lateral + bump * 0.12,
      lean: Math.max(-1, Math.min(1, lean + bump * 0.6)),
      hop,
      bounce,
      ghost: car.ghost,
      stuck: car.stuck,
      look: car.look,
      driver: car.driver,
      bump,
    };
  }

  private hazardFrame(
    hazard: Hazard,
    scene: SceneState,
    nose: number,
    reduced: boolean,
  ): HazardFrame {
    const motion = this.motionOf(hazard);
    const target = laneLateral(hazard.lane);
    const hopAge = (this.time - motion.hopStart) / HOP_SECONDS;
    const hopping = !reduced && hopAge >= 0 && hopAge < 1;
    motion.lateral = hopping ? motion.hopFrom + (target - motion.hopFrom) * ease(hopAge) : target;
    const startleAge = (this.time - motion.startledAt) / STARTLE_SECONDS;
    return {
      id: hazard.id,
      kind: hazard.kind,
      role: hazard.role,
      gap: hazard.position - nose,
      lateral: motion.lateral,
      hop: hopping ? hopAge : 0,
      committed: hazard.committed,
      age: this.time - motion.revealedAt,
      startled: startleAge >= 0 && startleAge < 1 ? 1 - startleAge : 0,
      dazed: hazard.id === this.dazedId && !(scene.freeze && scene.crashes.length > 0),
      dizzy: hazard.id === this.dizzyId && this.time - motion.revealedAt < 2.5,
      facing: hazard.id % 2 === 0 ? 1 : -1,
      seed: hazard.id * 7919 + hazard.lane,
      hat: hazard.role === 'rival' ? scene.rivalHat : null,
    };
  }

  private crashFrame(crash: SceneCrash, scene: SceneState): CrashFrame {
    const { hazard } = crash;
    return {
      age: crash.age,
      carLateral: this.carMotion(crash.car).lateral ?? laneLateral(hazard.lane),
      look: crash.look,
      obstacle: hazard.kind === 'barrier' ? 'barrier' : 'donkey',
      donkeyLateral: this.motions.get(hazard.id)?.lateral ?? laneLateral(hazard.lane),
      donkeySeed: hazard.id * 7919 + hazard.lane,
      donkeyFacing: hazard.id % 2 === 0 ? 1 : -1,
      donkeyHat: hazard.role === 'rival' ? scene.rivalHat : null,
    };
  }

  private carMotion(id: number): CarMotion {
    let motion = this.cars.get(id);
    if (!motion) {
      motion = { lateral: null, hopStart: -Infinity, bumpStart: -Infinity, bumpDirection: 0 };
      this.cars.set(id, motion);
    }
    return motion;
  }

  private motionOf(hazard: Hazard): HazardMotion {
    let motion = this.motions.get(hazard.id);
    if (!motion) {
      motion = {
        lateral: laneLateral(hazard.lane),
        hopFrom: 0,
        hopStart: -Infinity,
        revealedAt: this.time,
        startledAt: -Infinity,
      };
      this.motions.set(hazard.id, motion);
      if (this.dizzyNext && hazard.kind === 'donkey') {
        this.dizzyNext = false;
        this.dizzyId = hazard.id;
      }
    }
    return motion;
  }

  private forgetGone(drive: Drive) {
    if (this.motions.size < 64) return;
    const live = new Set(drive.hazards.map((hazard) => hazard.id));
    for (const id of this.motions.keys()) if (!live.has(id)) this.motions.delete(id);
  }
}

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}
