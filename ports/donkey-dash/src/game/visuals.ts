import { CAR_LENGTH } from '../engine/constants';
import type { Drive, DriveEvent } from '../engine/drive';
import type { Hazard } from '../engine/hazards';
import { isMuddy, lateralAt } from '../engine/road';
import type { HatStyle, Look } from '../garage';
import { Effects } from '../render/effects';
import type { Palette } from '../render/palette';
import { LANE_METRES } from '../render/classic-view';
import type { CrashFrame, Frame, HazardFrame } from '../render/view';

/**
 * Everything that moves only for the eyes: the car sliding between lanes and
 * hopping across the road, donkeys hopping and startling, the climb gliding,
 * the beat flash and the particles. It reads the engine, never writes to it.
 */
export interface SceneState {
  drive: Drive;
  crash: { hazard: Hazard; age: number } | null;
  summit: number | null;
  commitGap: number | null;
  dropLane: number | null;
  palette: Palette;
  look: Look;
  /** What the second player's donkey wears in Donkey vs Driver. */
  rivalHat: HatStyle | null;
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
const STARTLE_SECONDS = 0.6;

export class Visuals {
  readonly effects = new Effects();
  private time = 0;
  private carLateral: number | null = null;
  private carHopStart = -Infinity;
  private climb = 0;
  private lastBeatAt = -Infinity;
  private previousNose = 0;
  private currentNose = 0;
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
  onEvent(event: DriveEvent | { type: string }, drive: Drive) {
    switch (event.type) {
      case 'switch': {
        const change = event as Extract<DriveEvent, { type: 'switch' }>;
        // Pressing on the rightmost lane jumps the car right across to the leftmost.
        if (change.to < change.from && drive.car.lanes === 3) this.carHopStart = this.time;
        break;
      }
      case 'hop': {
        const { hazard, from } = event as Extract<DriveEvent, { type: 'hop' }>;
        const motion = this.motionOf(hazard, drive);
        motion.hopFrom = lateralAt(drive.road, hazard.position, from);
        motion.hopStart = this.time;
        break;
      }
      case 'pass': {
        const { hazard, nearMiss } = event as Extract<DriveEvent, { type: 'pass' }>;
        if (nearMiss) this.motionOf(hazard, drive).startledAt = this.time;
        break;
      }
      case 'crash': {
        const { hazard } = event as Extract<DriveEvent, { type: 'crash' }>;
        this.dazedId = hazard.id;
        this.effects.crash(
          hazard.position,
          lateralAt(drive.road, hazard.position, hazard.lane) * LANE_METRES,
        );
        break;
      }
      case 'stuck':
        this.effects.splash(
          drive.car.nose - CAR_LENGTH * 0.8,
          (this.carLateral ?? 0) * LANE_METRES,
        );
        break;
      case 'carrot':
        this.effects.petals(drive.car.nose, (this.carLateral ?? 0) * LANE_METRES);
        break;
    }
  }

  onBeat() {
    this.lastBeatAt = this.time;
  }

  /** A fresh point in a duel, or a new run: forget the old road's animations. */
  reset() {
    this.dizzyNext = this.dazedId !== null;
    this.dizzyId = null;
    this.carLateral = null;
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
    const slow = scene.crash ? 0.35 : 1;
    this.time += frameSeconds;
    this.effects.update(frameSeconds * slow);
    const { drive } = scene;
    const { car, road } = drive;
    const nose = this.previousNose + (this.currentNose - this.previousNose) * alpha;

    const target = lateralAt(road, car.nose, car.lane);
    if (this.carLateral === null || reduced) this.carLateral = target;
    const before = this.carLateral;
    this.carLateral += (target - this.carLateral) * (1 - Math.exp(-frameSeconds * SLIDE_RATE));
    const lean = reduced ? 0 : Math.max(-1, Math.min(1, (target - before) * 3));

    const climbRate = drive.climb < this.climb ? 40 : 9;
    this.climb += (drive.climb - this.climb) * (1 - Math.exp(-frameSeconds * climbRate));
    if (reduced) this.climb = drive.climb;

    const hopAge = (this.time - this.carHopStart) / CAR_HOP_SECONDS;
    const hop = !reduced && hopAge >= 0 && hopAge < 1 ? Math.sin(hopAge * Math.PI) * 1.3 : 0;
    const bounce = reduced || scene.crash ? 0 : Math.abs(Math.sin(this.time * 11)) * 0.03;
    const muddy = isMuddy(road, car.nose, car.lane);

    if (!scene.crash && !reduced && drive.speed > 0) {
      this.effects.wheels(
        car.nose,
        this.carLateral * LANE_METRES,
        CAR_LENGTH,
        drive.speed,
        frameSeconds,
        muddy,
      );
      this.effects.trail(scene.look.trail, car.nose, this.carLateral * LANE_METRES, CAR_LENGTH);
    }

    const hazards: HazardFrame[] = [];
    for (const hazard of drive.hazards) {
      if (!hazard.revealed || hazard.collected) continue;
      hazards.push(this.hazardFrame(hazard, scene, nose, reduced));
    }
    this.forgetGone(drive);

    const beatAge = this.time - this.lastBeatAt;
    return {
      time: this.time,
      nose,
      speed: drive.speed,
      climb: this.climb,
      road,
      car: {
        lateral: this.carLateral,
        lean,
        hop,
        bounce,
        ghost: drive.roadTime < car.graceUntil,
        stuck: car.heldPresses.length > 0,
        look: scene.look,
      },
      hazards,
      commitGap: scene.commitGap,
      dropLane: scene.dropLane,
      beatPulse: reduced ? 0 : Math.max(0, 1 - beatAge / 0.14),
      crash: scene.crash ? this.crashFrame(scene) : null,
      summit: scene.summit,
      palette: scene.palette,
      particles: this.effects.particles,
      reducedMotion: reduced,
    };
  }

  private hazardFrame(
    hazard: Hazard,
    scene: SceneState,
    nose: number,
    reduced: boolean,
  ): HazardFrame {
    const { drive } = scene;
    const motion = this.motionOf(hazard, drive);
    const target = lateralAt(drive.road, hazard.position, hazard.lane);
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
      dazed: hazard.id === this.dazedId && !scene.crash,
      dizzy: hazard.id === this.dizzyId && this.time - motion.revealedAt < 2.5,
      facing: hazard.id % 2 === 0 ? 1 : -1,
      seed: hazard.id * 7919 + hazard.lane,
      hat: hazard.role === 'rival' ? scene.rivalHat : null,
    };
  }

  private crashFrame(scene: SceneState): CrashFrame | null {
    const crash = scene.crash;
    if (!crash) return null;
    const { hazard } = crash;
    return {
      age: crash.age,
      carLateral: this.carLateral ?? 0,
      donkeyLateral: this.motions.get(hazard.id)?.lateral ?? 0,
      donkeySeed: hazard.id * 7919 + hazard.lane,
      donkeyFacing: hazard.id % 2 === 0 ? 1 : -1,
      donkeyHat: hazard.role === 'rival' ? scene.rivalHat : null,
    };
  }

  private motionOf(hazard: Hazard, drive: Drive): HazardMotion {
    let motion = this.motions.get(hazard.id);
    if (!motion) {
      motion = {
        lateral: lateralAt(drive.road, hazard.position, hazard.lane),
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
