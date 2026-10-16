import { STEP_SECONDS, type Flight } from '../engine/flight';
import { distanceNm, type LatLon } from '../engine/geo';
import {
  ReplayPlayer,
  takeSnapshot,
  type FlightSnapshot,
  type Recording,
} from '../engine/recording';
import { onRunway, runwayPoint } from '../engine/runways';
import type { Terrain } from '../engine/terrain';
import type { FlightWorld } from '../engine/world';
import type { Lens, ViewPoint, WorldView } from '../world/world-view';

/**
 * A landing again, from the cameras a film crew would use: a chase plane
 * on the approach, the tower as it comes over the fence, a camera beside
 * the touchdown zone in slow motion, and the flight deck itself. The flight
 * is flown again from its recording, so every instrument in the cockpit
 * shot moves as it did; before it plays, one quick pass works out the path
 * flown and where the wheels touched, for the overlays and the cuts.
 */
export type ReplayCamera = 'auto' | 'chase' | 'tower' | 'runway' | 'cockpit';
export type ReplayShotCamera = Exclude<ReplayCamera, 'auto'>;

export interface ReplaySource {
  recording: Recording;
  world: FlightWorld;
  terrain: Terrain;
  /** Snapshots of the live flight, when there was one: the replay starts from the nearest. */
  snapshots: readonly FlightSnapshot[];
  /** The step to build the replay around: the touchdown, or the end. */
  focusStep: number;
}

export interface PathSample {
  position: LatLon;
  altitudeFt: number;
}

export interface ReplayShot {
  flight: Flight;
  camera: ReplayShotCamera;
  view: ViewPoint;
  lens: Lens;
  cockpit: boolean;
  slow: boolean;
}

/** The replay begins this long before the touchdown (or the end). */
const LEAD_SECONDS = 55;
/** Slow motion from this long before the touchdown to this long after. */
const SLOW_BEFORE_STEPS = 150;
const SLOW_AFTER_STEPS = 150;
const SLOW_RATE = 0.25;
/** The last picture holds this long before the replay starts again. */
const HOLD_SECONDS = 2.5;
const SAMPLE_EVERY_STEPS = 6;
/** Steps flown between breaths while preparing, so the page stays responsive. */
const SLICE_STEPS = 3000;
/** The size the aircraft should take up across a long lens's picture. */
const FRAME_SPAN_M = 230;

export class ReplayDirector {
  camera: ReplayCamera = 'auto';
  slowMotion = true;
  /** Holds the picture still, for the screenshots. */
  paused = false;
  private player: ReplayPlayer;
  private clock = 0;
  private hold = 0;
  private towerAt: { position: LatLon; altitudeFt: number } | null = null;
  private world: WorldView | null = null;

  private constructor(
    private readonly source: ReplaySource,
    private readonly start: FlightSnapshot,
    readonly path: PathSample[],
    readonly touchdown: { step: number; position: LatLon } | null,
    readonly endStep: number,
    private readonly reducedMotion: boolean,
  ) {
    this.player = this.freshPlayer();
  }

  /** Flies the recording up to the replay's start and through it once, in slices. */
  static async prepare(
    source: ReplaySource,
    reducedMotion: boolean,
    progress: (share: number) => void = () => {},
  ): Promise<ReplayDirector> {
    const { recording } = source;
    const startStep = Math.max(0, source.focusStep - Math.round(LEAD_SECONDS / STEP_SECONDS));
    const from = [...source.snapshots].reverse().find((snapshot) => snapshot.step <= startStep);
    const player = new ReplayPlayer(
      recording,
      from ? { snapshot: from, world: source.world } : { terrain: source.terrain },
    );
    const total = recording.steps - player.step;
    const breathe = async () => {
      progress(total > 0 ? 1 - (recording.steps - player.step) / total : 1);
      await new Promise((resolve) => setTimeout(resolve, 0));
    };
    while (player.step < startStep) {
      player.advanceTo(Math.min(startStep, player.step + SLICE_STEPS));
      await breathe();
    }
    const start = takeSnapshot(player.flight, player.step);
    const path: PathSample[] = [];
    let touchdown: { step: number; position: LatLon } | null = null;
    while (!player.finished) {
      const sliceEnd = Math.min(recording.steps, player.step + SLICE_STEPS);
      while (player.step < sliceEnd && !player.finished) {
        const events = player.advanceTo(player.step + 1);
        const r = player.flight.readout;
        if (!touchdown && events.some((event) => event.kind === 'touchdown'))
          touchdown = { step: player.step, position: r.position };
        if (player.step % SAMPLE_EVERY_STEPS === 0)
          path.push({ position: r.position, altitudeFt: r.altitudeFt });
      }
      await breathe();
    }
    progress(1);
    return new ReplayDirector(source, start, path, touchdown, player.step, reducedMotion);
  }

  private freshPlayer(): ReplayPlayer {
    return new ReplayPlayer(this.source.recording, {
      snapshot: this.start,
      world: this.source.world,
    });
  }

  /** The replay goes into a world view: its path, its glideslope and its touchdown mark. */
  attach(world: WorldView) {
    this.world = world;
    const strip = this.source.world.ils.runway;
    this.towerAt = world.towerNear(strip.threshold) ?? {
      // Where a tower would stand: abeam the middle of the runway, well clear of it, a cab's height up.
      position: runwayPoint(strip, strip.landingLengthFt * 0.45, -(strip.widthFt / 2 + 1800)),
      altitudeFt: strip.elevationFt + 150,
    };
    world.showReplayOverlay(this.path, this.touchdown?.position ?? null);
  }

  detach() {
    this.world?.hideReplayOverlay();
    this.world = null;
  }

  restart() {
    this.player = this.freshPlayer();
    this.clock = 0;
    this.hold = 0;
  }

  /** Straight to a moment: this many seconds from the touchdown (or from the end without one). */
  seek(secondsFromTouchdown: number) {
    this.restart();
    const anchor = this.touchdown?.step ?? this.endStep;
    this.player.advanceTo(anchor + Math.round(secondsFromTouchdown / STEP_SECONDS));
  }

  get progress(): number {
    const span = this.endStep - this.start.step;
    return span > 0 ? (this.player.step - this.start.step) / span : 1;
  }

  /** Moves the replay on by a frame and says what to show. */
  frame(frameSeconds: number): ReplayShot {
    const slow = this.inSlowMotion();
    if (!this.paused) this.advance(frameSeconds, slow);
    const camera = this.camera === 'auto' ? this.autoCamera() : this.camera;
    const flight = this.player.flight;
    return {
      flight,
      camera,
      cockpit: camera === 'cockpit',
      slow,
      ...this.lookFrom(camera, flight),
    };
  }

  private advance(frameSeconds: number, slow: boolean) {
    if (this.player.finished) {
      this.hold += frameSeconds;
      if (this.hold > HOLD_SECONDS) this.restart();
      return;
    }
    this.clock += (frameSeconds / STEP_SECONDS) * (slow ? SLOW_RATE : 1);
    const whole = Math.floor(this.clock);
    this.clock -= whole;
    if (whole > 0) this.player.advanceTo(this.player.step + whole);
  }

  private inSlowMotion(): boolean {
    if (!this.slowMotion || !this.touchdown) return false;
    const fromTouchdown = this.player.step - this.touchdown.step;
    return fromTouchdown > -SLOW_BEFORE_STEPS && fromTouchdown < SLOW_AFTER_STEPS;
  }

  /** The cuts: chase on the approach, the tower over the fence, beside the runway for the touchdown. */
  private autoCamera(): ReplayShotCamera {
    if (!this.touchdown) return 'chase';
    const toTouchdown = (this.touchdown.step - this.player.step) * STEP_SECONDS;
    if (toTouchdown > 24) return 'chase';
    if (toTouchdown > 4) return this.towerAt ? 'tower' : 'chase';
    if (toTouchdown > -6) return 'runway';
    return 'chase';
  }

  private lookFrom(camera: ReplayShotCamera, flight: Flight): { view: ViewPoint; lens: Lens } {
    const seconds = (this.player.step - this.start.step) * STEP_SECONDS;
    const r = flight.readout;
    switch (camera) {
      case 'cockpit':
        return { view: { kind: 'cockpit', headYawDeg: 0, headPitchDeg: 0 }, lens: CHASE_LENS };
      case 'tower': {
        const tower = this.towerAt;
        if (!tower) break;
        return {
          view: { kind: 'spot', position: tower.position, altitudeFt: tower.altitudeFt },
          lens: longLens(distanceNm(tower.position, r.position) * METRES_PER_NM),
        };
      }
      case 'runway': {
        const spot = this.runwaySpot();
        return {
          view: { kind: 'spot', position: spot.position, altitudeFt: spot.altitudeFt },
          lens: longLens(distanceNm(spot.position, r.position) * METRES_PER_NM, 52),
        };
      }
      case 'chase':
        break;
    }
    const orbit = this.reducedMotion ? 25 : 25 + seconds * 2.5;
    return {
      view: { kind: 'chase', distanceM: 115, heightM: 20, orbitDeg: orbit },
      lens: CHASE_LENS,
    };
  }

  /**
   * Beside the touchdown zone, a little past where the wheels came down, a
   * photographer's height above the grass — or the water, at a field built
   * out into a harbour — so the near ground never fills the picture.
   */
  private runwaySpot(): { position: LatLon; altitudeFt: number } {
    const strip = this.touchdown
      ? (this.player.flight.touchdown?.runway ?? this.source.world.ils.runway)
      : this.source.world.ils.runway;
    const along = this.touchdown ? onRunway(strip, this.touchdown.position).along + 700 : 1500;
    const side = strip.widthFt / 2 + 260;
    const position = runwayPoint(strip, along, side);
    const ground = Math.max(strip.elevationFt, this.source.terrain.elevationFt(position));
    return { position, altitudeFt: ground + 16 };
  }
}

const CHASE_LENS: Lens = { horizontalFov: 58, boresight: 0.5 };
const METRES_PER_NM = 1852;

/** A long lens that keeps the jumbo about the same size in the picture however far it is. */
function longLens(distanceM: number, widest = 60): Lens {
  const fov = 2 * Math.atan(FRAME_SPAN_M / 2 / Math.max(distanceM, 1)) * (180 / Math.PI);
  return { horizontalFov: Math.max(3, Math.min(widest, fov)), boresight: 0.5 };
}
