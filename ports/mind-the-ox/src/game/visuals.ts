import type { GameEvent } from '../engine/events';
import type { WorldMap } from '../engine/map';
import { cosine, sine } from '../engine/trig';
import type { Plane, World } from '../engine/world';
import { goldenHour, type Livery, type Palette } from '../render/palette';
import { ParticleSystem } from '../render/particles';
import { buildScenery, type Scenery } from '../render/scenery';
import { burningHeight, isBurning, woundPoint } from '../render/ship-damage';
import { funnelTops, shipLayout } from '../render/ship-shapes';
import type { Frame, PlaneFrame, Rescue, Splat } from '../render/view';
import type { ThemeId } from '../themes';

/** How quickly a plane rolls over on screen when its pilot flips it, in radians a second. */
const ROLL_RATE = Math.PI * 4;
/** The camera keeps this much of the screen ahead of the plane, eased. */
const LOOK_AHEAD = 0.18;
const CAMERA_EASE = 2.4;
/** A pilot fished out of the sea: the boat goes out, picks them up and comes back, in this long. */
const RESCUE_SECONDS = 9;
/** A contrail streams from planes going this fast or faster, units a move. */
const CONTRAIL_SPEED = 7;

/** How the session wants the moments of a tick shown. */
export interface AbsorbOptions {
  /** Planes whose pilot sees splats on their goggles: the ones people are flying. */
  splatsFor: ReadonlySet<number>;
  /** What a downed pilot does: floats down under a parachute, or glides the plane in. */
  downed: 'parachute' | 'glide';
  /** The Airshow throws confetti and flour where the others throw fire. */
  festive: boolean;
  /** In the cartoon war every pilot in the water fishes themselves out, with a cheerful splash. */
  cheerful: boolean;
}

export interface FrameRequest {
  world: World;
  palette: Palette;
  theme: ThemeId;
  time: number;
  /** The plane to follow, if any. */
  focus: Plane | null;
  /** Which camera and goggles this frame is for: one per player in a split screen. */
  view: number;
  /** Half the width of the field the view shows, to keep the camera inside the world. */
  halfWidth: number;
  sun: number | null;
  theEnd: number | null;
  reducedMotion: boolean;
  liveries: ReadonlyMap<number, Livery>;
  /** Puts the camera at a spot instead of following, e.g. for a still. */
  cameraX?: number;
}

/**
 * Everything the views need that the engine does not keep: where each
 * camera is, how far through a roll each plane is, smoke, fire, feathers,
 * splats on the goggles. It reads the engine's events after each tick,
 * moves its particles once per display frame (`advance`), and builds a
 * Frame for each view.
 */
export class Visuals {
  private readonly particles = new ParticleSystem();
  private readonly rolls = new Map<number, number>();
  private readonly spins = new Map<number, number>();
  private readonly planeFrames = new Map<number, PlaneFrame>();
  private readonly splats = new Map<number, Splat[]>();
  private readonly cameras = new Map<number, number>();
  private fires: { x: number; y: number; until: number; size: number }[] = [];
  private rescues: Rescue[] = [];
  private scenery: Scenery | null = null;
  private sceneryFor: WorldMap | null = null;
  private lastTime: number | null = null;
  private seconds = 0;
  private smokeClock = 0;
  /** Where each smoking plane last left a puff, so the trail is laid evenly along its path. */
  private readonly trails = new Map<number, { x: number; y: number }>();
  private readonly contrailMarks = new Map<number, { x: number; y: number }>();

  sceneryOf(world: World, theme: ThemeId): Scenery {
    if (!this.scenery || this.sceneryFor !== world.map || this.scenery.theme !== theme) {
      this.scenery = buildScenery(world.map, theme);
      this.sceneryFor = world.map;
    }
    return this.scenery;
  }

  /** Starts afresh, e.g. for a new round. */
  reset() {
    this.particles.clear();
    this.rolls.clear();
    this.splats.clear();
    this.fires = [];
    this.rescues = [];
    this.cameras.clear();
    this.trails.clear();
    this.contrailMarks.clear();
  }

  /** Turns one tick's events into smoke, fire and the rest. */
  absorb(events: readonly GameEvent[], world: World, time: number, options: AbsorbOptions) {
    for (const event of events) this.absorbEvent(event, world, time, options);
  }

  private absorbEvent(event: GameEvent, world: World, time: number, options: AbsorbOptions) {
    const fx = this.particles;
    switch (event.type) {
      case 'gun': {
        const plane = world.planes.find((candidate) => candidate.id === event.plane);
        if (!plane) return;
        const noseX = plane.x + cosine(plane.heading) * 9;
        const noseY = plane.y + sine(plane.heading) * 9;
        fx.emit({ kind: 'flash', x: noseX, y: noseY, vx: 0, vy: 0, life: 0.07, size: 2.4 });
        fx.emit({
          kind: 'puff',
          x: noseX,
          y: noseY,
          vx: plane.vx * 30,
          vy: plane.vy * 30 + 2,
          life: 0.5,
          size: 0.9,
          darkness: 0.1,
        });
        return;
      }
      case 'splash':
        this.splash(event.x, event.y, event.size === 'large' ? 1 : 0.4);
        return;
      case 'torpedo-hit':
        // The torpedo's own splash is already there; this is the hull blowing a column of water skywards.
        this.splash(event.x, event.y, 1.8);
        return;
      case 'ditched':
        if (event.rescuedBy !== null)
          this.rescues.push({ x: event.x, ship: event.rescuedBy, age: 0 });
        else if (options.cheerful) {
          this.rescues.push({ x: event.x, ship: null, age: 0 });
          this.splash(event.x, event.y, 1.3);
        }
        return;
      case 'flak-burst':
        fx.emit({ kind: 'flash', x: event.x, y: event.y, vx: 0, vy: 0, life: 0.1, size: 3 });
        for (let puff = 0; puff < 3; puff++) {
          fx.emit({
            kind: 'smoke',
            x: event.x + fx.spread(1.2),
            y: event.y + fx.spread(1.2),
            vx: fx.spread(2),
            vy: 1,
            life: 2.4,
            size: 1.5,
            darkness: 0.95,
          });
        }
        return;
      case 'raider-gun':
        fx.emit({ kind: 'flash', x: event.x, y: event.y, vx: 0, vy: 0, life: 0.06, size: 1.8 });
        return;
      case 'ship-gun':
      case 'target-gun':
        fx.emit({ kind: 'flash', x: event.x, y: event.y, vx: 0, vy: 0, life: 0.06, size: 2.2 });
        fx.emit({
          kind: 'puff',
          x: event.x,
          y: event.y,
          vx: 0,
          vy: 3,
          life: 0.6,
          size: 1,
          darkness: 0.2,
        });
        return;
      case 'explosion':
        if (options.festive) this.confetti(event.x, event.y, event.size);
        else this.explosion(event.x, event.y, event.size);
        return;
      case 'crater':
        for (let clod = 0; clod < 14; clod++) {
          fx.emit({
            kind: options.festive ? 'flour' : 'dirt',
            x: event.x + fx.spread(3),
            y: event.y + 1,
            vx: fx.spread(30),
            vy: 25 + fx.random() * 45,
            life: 1.4,
            size: 0.5 + fx.random() * 0.7,
          });
        }
        return;
      case 'bird-hit':
      case 'flock-scattered':
        for (let feather = 0; feather < (event.type === 'bird-hit' ? 10 : 6); feather++) {
          fx.emit({
            kind: 'feather',
            x: event.x + fx.spread(2),
            y: event.y + fx.spread(2),
            vx: fx.spread(25),
            vy: fx.spread(20),
            life: 2.6,
            size: 0.6 + fx.random() * 0.4,
          });
        }
        return;
      case 'splat':
        if (options.splatsFor.has(event.plane)) this.addSplat(event.plane, event.kind);
        return;
      case 'bailout':
        if (options.downed === 'parachute') {
          fx.emit({
            kind: 'parachute',
            x: event.x,
            y: event.y,
            vx: event.vx * 20,
            vy: 0,
            life: 30,
            size: 1,
            tint: event.side === 0 ? 'friend' : 'foe',
          });
        }
        return;
      case 'crash':
        if (options.festive) {
          this.dustUp(event.x, world.terrain.heightAt(event.x));
          return;
        }
        this.fires.push({
          x: event.x,
          y: world.terrain.heightAt(event.x),
          until: time + 4,
          size: 1,
        });
        return;
      case 'target-destroyed':
        if (options.festive) return;
        this.fires.push({
          x: event.x,
          y: event.y,
          until: time + (event.kind === 'depot' ? 10 : 7),
          size: event.kind === 'depot' ? 2 : 1.3,
        });
        return;
      case 'convoy-escaped':
        this.dustUp(event.x, event.y);
        return;
      case 'ox-hit':
        for (let puff = 0; puff < 8; puff++) {
          fx.emit({
            kind: 'puff',
            x: event.x + fx.spread(5),
            y: event.y + 3,
            vx: fx.spread(12),
            vy: 4 + fx.random() * 6,
            life: 1.2,
            size: 1.6,
            darkness: 0,
          });
        }
        return;
      case 'stall':
      case 'plane-wounded': {
        const plane = world.planes.find((candidate) => candidate.id === event.plane);
        if (!plane) return;
        for (let bit = 0; bit < 5; bit++) {
          fx.emit({
            kind: event.type === 'stall' || options.festive ? 'puff' : 'splinter',
            x: plane.x,
            y: plane.y,
            vx: fx.spread(25),
            vy: fx.spread(25),
            life: 1,
            size: 0.7,
            darkness: 0.6,
          });
        }
        return;
      }
      case 'takeoff':
      case 'landed': {
        const plane = world.planes.find((candidate) => candidate.id === event.plane);
        if (plane) this.dustUp(plane.x, plane.y - 4, -plane.vx * 20);
        return;
      }
      default:
        return;
    }
  }

  /** A column of water thrown up, and its spray falling back; `size` 1 for a bomb. */
  private splash(x: number, y: number, size: number) {
    const fx = this.particles;
    fx.emit({ kind: 'column', x, y, vx: 0, vy: 0, life: 1.4 + size * 0.4, size });
    for (let drop = 0; drop < 6 + size * 12; drop++) {
      fx.emit({
        kind: 'spray',
        x: x + fx.spread(2 * size),
        y: y + 1,
        vx: fx.spread(22 * size),
        vy: 20 + fx.random() * 40 * size,
        life: 1.6,
        size: 0.35 + fx.random() * 0.35,
      });
    }
  }

  private dustUp(x: number, y: number, drift = 0) {
    const fx = this.particles;
    for (let puff = 0; puff < 5; puff++) {
      fx.emit({
        kind: 'puff',
        x: x + fx.spread(4),
        y,
        vx: drift + fx.spread(6),
        vy: 2 + fx.random() * 3,
        life: 0.9,
        size: 1.3,
        darkness: 0,
      });
    }
  }

  private explosion(x: number, y: number, size: 'small' | 'large' | 'huge') {
    const fx = this.particles;
    const scale = size === 'small' ? 1 : size === 'large' ? 1.8 : 3;
    fx.emit({ kind: 'flash', x, y, vx: 0, vy: 0, life: 0.18, size: 9 * scale });
    fx.emit({ kind: 'ring', x, y, vx: 0, vy: 0, life: 0.45, size: 14 * scale });
    for (let flame = 0; flame < 8 * scale; flame++) {
      fx.emit({
        kind: 'fire',
        x: x + fx.spread(2 * scale),
        y: y + fx.spread(2 * scale),
        vx: fx.spread(22 * scale),
        vy: fx.spread(22 * scale) + 6,
        life: 0.5 + fx.random() * 0.4,
        size: 1.6 * scale * (0.6 + fx.random() * 0.6),
      });
    }
    for (let puff = 0; puff < 9 * scale; puff++) {
      fx.emit({
        kind: 'smoke',
        x: x + fx.spread(3 * scale),
        y: y + fx.spread(3 * scale),
        vx: fx.spread(10 * scale),
        vy: fx.spread(8) + 5,
        life: 1.8 + fx.random() * 1.6,
        size: 2 * scale * (0.6 + fx.random() * 0.5),
        darkness: 0.75,
      });
    }
    for (let spark = 0; spark < 10 * scale; spark++) {
      fx.emit({
        kind: 'spark',
        x,
        y,
        vx: fx.spread(80),
        vy: fx.spread(60) + 30,
        life: 0.7 + fx.random() * 0.5,
        size: 0.4,
      });
    }
  }

  /** The Airshow's explosions: a pop, a puff of coloured smoke and a shower of confetti. */
  private confetti(x: number, y: number, size: 'small' | 'large' | 'huge') {
    const fx = this.particles;
    const scale = size === 'small' ? 1 : size === 'large' ? 1.8 : 3;
    fx.emit({ kind: 'ring', x, y, vx: 0, vy: 0, life: 0.4, size: 12 * scale });
    for (let puff = 0; puff < 5 * scale; puff++) {
      fx.emit({
        kind: 'puff',
        x: x + fx.spread(3 * scale),
        y: y + fx.spread(3 * scale),
        vx: fx.spread(8 * scale),
        vy: fx.spread(6) + 4,
        life: 1.4 + fx.random(),
        size: 2.2 * scale,
        darkness: 0,
      });
    }
    for (let bit = 0; bit < 22 * scale; bit++) {
      fx.emit({
        kind: 'confetti',
        x,
        y,
        vx: fx.spread(60 * Math.sqrt(scale)),
        vy: fx.spread(40) + 35,
        life: 2.2 + fx.random() * 1.4,
        size: 0.55,
      });
    }
  }

  private addSplat(plane: number, kind: Splat['kind']) {
    const fx = this.particles;
    const list = this.splats.get(plane) ?? [];
    list.push({
      kind,
      x: 0.2 + fx.random() * 0.6,
      y: 0.25 + fx.random() * 0.45,
      size: kind === 'hole' ? 0.05 + fx.random() * 0.02 : 0.09 + fx.random() * 0.05,
      age: 0,
      seed: Math.floor(fx.random() * 1000),
    });
    if (list.length > 8) list.shift();
    this.splats.set(plane, list);
  }

  /**
   * Moves everything on by one display frame: particles, the smoke trails,
   * the burning wrecks, the splats fading, each plane's roll and propeller.
   * `contrails` gives the colour streaming from planes that have one.
   */
  advance(world: World, time: number, contrails: ReadonlyMap<number, string> = new Map()) {
    const seconds = this.lastTime === null ? 0 : Math.min(0.1, Math.max(0, time - this.lastTime));
    this.lastTime = time;
    this.seconds = seconds;
    this.emitContinuous(world, time, seconds);
    this.emitContrails(world, contrails);
    this.particles.update(seconds, (x) => world.terrain.heightAt(x));
    for (const rescue of this.rescues) rescue.age += seconds;
    this.rescues = this.rescues.filter((rescue) => rescue.age < RESCUE_SECONDS);
    for (const list of this.splats.values()) {
      for (const splat of list) splat.age += seconds;
    }
    for (const [plane, list] of this.splats) {
      this.splats.set(
        plane,
        list.filter((splat) => splat.age < 6),
      );
    }
    this.planeFrames.clear();
    for (const plane of world.planes)
      this.planeFrames.set(plane.id, this.planeFrame(plane, seconds));
  }

  frame(request: FrameRequest): Frame {
    const { world, time } = request;
    return {
      time,
      world,
      theme: request.theme,
      // The flight into the sun turns the light golden over its first half.
      palette:
        request.sun === null ? request.palette : goldenHour(request.palette, request.sun / 0.55),
      scenery: this.sceneryOf(world, request.theme),
      cameraX: this.followCamera(request),
      focus: request.focus,
      planes: world.planes.map(
        (plane) => this.planeFrames.get(plane.id) ?? { plane, roll: 0, spin: 0, power: 0 },
      ),
      liveries: request.liveries,
      particles: this.particles.particles,
      splats: request.focus ? (this.splats.get(request.focus.id) ?? []) : [],
      rescues: this.rescues,
      sun: request.sun,
      theEnd: request.theEnd,
      reducedMotion: request.reducedMotion,
    };
  }

  private planeFrame(plane: Plane, seconds: number): PlaneFrame {
    const target = plane.inverted ? Math.PI : 0;
    const current = this.rolls.get(plane.id) ?? target;
    const step = ROLL_RATE * seconds;
    const next =
      Math.abs(target - current) <= step ? target : current + Math.sign(target - current) * step;
    this.rolls.set(plane.id, next);
    const power =
      plane.state === 'parked'
        ? 0.15
        : plane.state === 'crashed' || plane.state === 'falling'
          ? 0
          : 0.3 + plane.throttle * 0.175;
    const spin = (this.spins.get(plane.id) ?? 0) + seconds * (12 + power * 40);
    this.spins.set(plane.id, spin);
    return { plane, roll: next, spin, power };
  }

  /** Wounded and falling planes trail smoke, a puff every unit or so of their path; wrecks burn for a while. */
  private emitContinuous(world: World, time: number, seconds: number) {
    const fx = this.particles;
    for (const plane of world.planes) {
      const falling = plane.state === 'falling';
      const smoking =
        falling || (plane.wounded && (plane.state === 'flying' || plane.state === 'stalled'));
      if (!smoking) {
        this.trails.delete(plane.id);
        continue;
      }
      const tailX = plane.x - cosine(plane.heading) * 3;
      const tailY = plane.y - sine(plane.heading) * 3;
      const last = this.trails.get(plane.id) ?? { x: tailX, y: tailY };
      const distance = Math.hypot(tailX - last.x, tailY - last.y);
      const puffs = Math.min(8, Math.floor(distance / 1.1));
      for (let puff = 1; puff <= puffs; puff++) {
        const share = puff / puffs;
        fx.emit({
          kind: 'smoke',
          x: last.x + (tailX - last.x) * share + fx.spread(0.6),
          y: last.y + (tailY - last.y) * share + fx.spread(0.6),
          vx: fx.spread(2.5),
          vy: 1.5,
          life: (falling ? 2.6 : 1.7) * (0.8 + fx.random() * 0.4),
          size: (falling ? 2.4 : 1.6) * (0.8 + fx.random() * 0.4),
          darkness: falling ? 0.9 : 0.35,
        });
      }
      if (puffs > 0) this.trails.set(plane.id, { x: tailX, y: tailY });
      else if (!this.trails.has(plane.id)) this.trails.set(plane.id, last);
      if (falling && fx.random() < seconds * 30)
        fx.emit({
          kind: 'fire',
          x: plane.x,
          y: plane.y,
          vx: fx.spread(6),
          vy: 4,
          life: 0.35,
          size: 1.4,
        });
    }
    this.smokeClock += seconds;
    if (this.smokeClock < 0.035) return;
    this.smokeClock = 0;
    this.emitShipSmoke(world);
    this.fires = this.fires.filter((fire) => fire.until > time);
    for (const fire of this.fires) {
      fx.emit({
        kind: 'smoke',
        x: fire.x + fx.spread(3 * fire.size),
        y: fire.y + 3,
        vx: fx.spread(2) + 3,
        vy: 8 + fx.random() * 6,
        life: 3.2,
        size: 2.2 * fire.size,
        darkness: 0.85,
      });
      if (fx.random() < 0.6)
        fx.emit({
          kind: 'fire',
          x: fire.x + fx.spread(3 * fire.size),
          y: fire.y + 1,
          vx: fx.spread(3),
          vy: 6 + fx.random() * 6,
          life: 0.5,
          size: 1.4 * fire.size,
        });
    }
  }

  /**
   * Ships at sea: smoke from every funnel, drifting aft; from every heavy
   * blow a ship has taken, fire for a while and smoke for as long as it
   * floats; from one badly hurt, smoke all along the deck; from one going
   * down, fire and smoke all along the hull.
   */
  private emitShipSmoke(world: World) {
    const fx = this.particles;
    for (const ship of world.ships) {
      if (ship.state === 'sunk' || ship.escaped) continue;
      const drift = -ship.vx * 30 + world.rules.wind * 6;
      if (ship.state === 'afloat') {
        for (const top of funnelTops(ship)) {
          if (fx.random() > 0.3) continue;
          fx.emit({
            kind: 'smoke',
            x: top.x + fx.spread(0.6),
            y: top.y,
            vx: drift + fx.spread(1.5),
            vy: 5 + fx.random() * 3,
            life: 2.6 + fx.random(),
            size: 1.3,
            darkness: 0.6,
          });
        }
      }
      for (const wound of ship.wounds) {
        const { x } = woundPoint(ship, wound);
        const y = ship.y + burningHeight(ship, wound);
        const burning = isBurning(ship, wound, world.tick);
        if (fx.random() < (burning ? 0.5 : 0.16))
          fx.emit({
            kind: 'smoke',
            x: x + fx.spread(1.5),
            y: y + 1,
            vx: drift + fx.spread(2),
            vy: 7 + fx.random() * 5,
            life: burning ? 3.6 : 2.6,
            size: burning ? 2.4 : 1.6,
            darkness: burning ? 0.9 : 0.7,
          });
        // Sparks and embers over the flames the ship painters draw; too many wash out to white.
        if (burning && fx.random() < 0.4)
          fx.emit({
            kind: 'fire',
            x: x + fx.spread(2.5),
            y: y + 2,
            vx: fx.spread(3),
            vy: 8 + fx.random() * 6,
            life: 0.7,
            size: 1.2 + fx.random() * 0.6,
          });
      }
      const hurt = 1 - ship.hitPoints / ship.maxHitPoints;
      if (hurt < 0.4 && ship.state === 'afloat') continue;
      const { length, freeboard } = shipLayout(ship.kind);
      const at = ship.x + fx.spread(length * 0.35);
      const deck = ship.y + freeboard;
      if (fx.random() < (ship.state === 'sinking' ? 0.9 : hurt * 0.8))
        fx.emit({
          kind: 'smoke',
          x: at,
          y: deck,
          vx: drift + fx.spread(2),
          vy: 7 + fx.random() * 5,
          life: 3.4,
          size: 2.2,
          darkness: 0.85,
        });
      if (ship.state === 'sinking')
        fx.emit({
          kind: 'fire',
          x: at,
          y: deck + 0.5,
          vx: fx.spread(3),
          vy: 6 + fx.random() * 5,
          life: 0.6,
          size: 1.6,
        });
    }
  }

  /** A thin coloured trail from the wingtips of a plane flying fast: a cosmetic, nothing more. */
  private emitContrails(world: World, contrails: ReadonlyMap<number, string>) {
    for (const plane of world.planes) {
      const colour = contrails.get(plane.id);
      const fast = plane.state === 'flying' && plane.speed >= CONTRAIL_SPEED;
      if (!colour || !fast) {
        this.contrailMarks.delete(plane.id);
        continue;
      }
      const tailX = plane.x - cosine(plane.heading) * 6;
      const tailY = plane.y - sine(plane.heading) * 6;
      const last = this.contrailMarks.get(plane.id) ?? { x: tailX, y: tailY };
      const distance = Math.hypot(tailX - last.x, tailY - last.y);
      const marks = Math.min(6, Math.floor(distance / 1.6));
      for (let mark = 1; mark <= marks; mark++) {
        const share = mark / marks;
        this.particles.emit({
          kind: 'contrail',
          x: last.x + (tailX - last.x) * share,
          y: last.y + (tailY - last.y) * share,
          vx: 0,
          vy: 0.6,
          life: 1.6,
          size: 0.9,
          tint: colour,
        });
      }
      if (marks > 0) this.contrailMarks.set(plane.id, { x: tailX, y: tailY });
      else if (!this.contrailMarks.has(plane.id)) this.contrailMarks.set(plane.id, last);
    }
  }

  private followCamera(request: FrameRequest): number {
    const { focus, world, halfWidth } = request;
    if (request.cameraX !== undefined) {
      this.cameras.set(request.view, request.cameraX);
      return request.cameraX;
    }
    const fallback = focus?.base.x ?? world.map.bases[0]?.x ?? world.map.width / 2;
    let wanted = focus
      ? focus.x +
        Math.sign(focus.vx) * halfWidth * 2 * LOOK_AHEAD * Math.min(1, Math.abs(focus.vx) * 2)
      : fallback;
    wanted = Math.min(world.map.width - halfWidth, Math.max(halfWidth, wanted));
    const current = this.cameras.get(request.view);
    const next =
      current === undefined || this.seconds === 0
        ? (current ?? wanted)
        : current + (wanted - current) * Math.min(1, this.seconds * CAMERA_EASE);
    this.cameras.set(request.view, next);
    return next;
  }
}
