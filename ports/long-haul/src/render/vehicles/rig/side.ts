import { css, litRgb, mix, rgb } from '../../colour';
import { obliqueCamera, type Camera } from '../camera';
import type { Vec3 } from '../geometry';
import { drawLamps, type Lamp } from '../lamps';
import { environmentKey, type Environment } from '../light';
import type { Part } from '../parts';
import { VehicleSprite } from '../sprite';
import { RIG, type RigLights, type RigModel } from './model';
import { rigLampStrength, rigPieces } from './rig';
import { tractorLamps, tractorWheels } from './tractor';
import { trailerLamps, trailerWheels } from './trailer';

/**
 * The rig in the side diorama: the body painted once into layers and
 * reused, the wheels turning live between them, the tractor and the trailer
 * each riding their own springs, then lamps, exhaust and, after dark, the
 * pool of the headlights on the road ahead.
 */
export interface RigSideFrame {
  model: RigModel;
  lights: RigLights;
  env: Environment;
  /** Screen x of the trailer's back doors, the road under the near wheels, the rig's length in pixels. */
  left: number;
  road: number;
  length: number;
  /** Wheel rotation in radians, and the front wheels' steering. */
  turn: number;
  steer: number;
  /** Feet the tractor and the trailer ride above their springs. */
  tractorLift: number;
  trailerLift: number;
  /** Exhaust: 0 idling … 1 pulling hard; `climb` darkens it on a grade. */
  throttle: number;
  climb: number;
  time: number;
  reducedMotion: boolean;
}

/** How far a foot of depth slides the picture sideways and up: the diorama's slight three-quarter. */
export const DIORAMA_LEAN = 0.17;
export const DIORAMA_RISE = 0.1;
const SPAN = RIG.length + 4.8 * DIORAMA_LEAN * 2;

/**
 * The inner tyre of each pair hides behind its partner from the side, so it
 * is painted with the body rather than turned every frame.
 */
const tucked = (wheel: Part) => wheel.kind === 'cylinder' && Math.abs(wheel.centre[2]) < 3;

/** The lamps never move on the rig, so the lists are made once. */
const TRAILER_LAMPS = trailerLamps();
const TRACTOR_LAMPS = tractorLamps();
const NEAR_WHEELS = 3.5;

export class RigSideView {
  private readonly trailer = new VehicleSprite();
  private readonly tractor = new VehicleSprite();

  /** The camera that puts the rig where the frame asks, before any spring travel. */
  camera(frame: Pick<RigSideFrame, 'left' | 'road' | 'length'>, lift = 0): Camera {
    const scale = frame.length / SPAN;
    return obliqueCamera({
      lean: DIORAMA_LEAN,
      rise: DIORAMA_RISE,
      scale,
      x: frame.left + 4.8 * DIORAMA_LEAN * scale,
      y: frame.road - NEAR_WHEELS * DIORAMA_RISE * scale - lift * scale,
    });
  }

  draw(ctx: CanvasRenderingContext2D, frame: RigSideFrame) {
    const { model, lights, env } = frame;
    const camera = this.camera(frame);
    const scale = frame.length / SPAN;
    // The body is painted once and kept, so its aerial holds still.
    const state = { lights, turn: frame.turn, steer: frame.steer, sway: 0 };
    const wheels = {
      trailer: trailerWheels(model, frame.turn),
      tractor: tractorWheels(model, state),
    };
    const shape = [
      Math.round(frame.left),
      Math.round(frame.road),
      Math.round(frame.length),
      JSON.stringify(model),
      lights.driver,
      Math.round(lights.cab * 10),
      lights.bunk,
    ].join('|');
    const light = environmentKey(env);

    this.paintShadow(ctx, camera, env);
    if (env.wet > 0) this.paintWetRoad(ctx, camera, env, scale);
    this.trailer.draw(ctx, {
      shape,
      light,
      camera,
      env,
      min: [-0.5, 0, -4.9],
      max: [47.2, 13.8, 4.9],
      body: () => [...rigPieces(model, state).trailer, ...wheels.trailer.filter(tucked)],
      wheels: wheels.trailer.filter((wheel) => !tucked(wheel)),
      lift: frame.trailerLift * scale,
    });
    this.tractor.draw(ctx, {
      shape,
      light,
      camera,
      env,
      min: [36, 0, -4.9],
      max: [66, 13.4, 4.9],
      body: () => [...rigPieces(model, state).tractor, ...wheels.tractor.filter(tucked)],
      wheels: wheels.tractor.filter((wheel) => !tucked(wheel)),
      lift: frame.tractorLift * scale,
    });
    if (!frame.reducedMotion) this.paintSmoke(ctx, this.camera(frame, frame.tractorLift), frame);
    const strength = (lamp: Lamp) => rigLampStrength(lamp, lights);
    drawLamps(ctx, TRAILER_LAMPS, this.camera(frame, frame.trailerLift), strength, env.night);
    drawLamps(ctx, TRACTOR_LAMPS, this.camera(frame, frame.tractorLift), strength, env.night);
    if (lights.head) this.paintBeams(ctx, camera, env);
  }

  /** A soft shadow along the road, darkest under the tyres. */
  private paintShadow(ctx: CanvasRenderingContext2D, camera: Camera, env: Environment) {
    const strength = 0.22 + (1 - env.night) * 0.18 - env.lighting.overcast * 0.08;
    const left = camera.project([0, 0, 0]);
    const right = camera.project([RIG.length, 0, 0]);
    const scale = camera.pixelsAt([0, 0, 0]);
    const body = ctx.createLinearGradient(0, left.y - scale * 0.6, 0, left.y + scale * 0.9);
    body.addColorStop(0, 'rgba(0, 0, 0, 0)');
    body.addColorStop(0.5, `rgba(0, 0, 0, ${strength})`);
    body.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(
      (left.x + right.x) / 2,
      left.y + scale * 0.15,
      (right.x - left.x) / 2 + scale,
      scale * 0.75,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.fillStyle = `rgba(0, 0, 0, ${strength * 1.3})`;
    for (const axle of [...RIG.trailer.axles, ...RIG.driveAxles, RIG.steerAxle]) {
      const at = camera.project([axle, 0, NEAR_WHEELS]);
      ctx.beginPath();
      ctx.ellipse(at.x, at.y, scale * 2.1, scale * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** A wet road mirrors the rig's lamps as long smears beneath it. */
  private paintWetRoad(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    env: Environment,
    scale: number,
  ) {
    const left = camera.project([0, 0, NEAR_WHEELS]);
    const right = camera.project([RIG.length, 0, NEAR_WHEELS]);
    const sheen = ctx.createLinearGradient(0, left.y, 0, left.y + scale * 3.2);
    const sky = css(mix(env.skyHorizon, rgb('#ffffff'), 0.2), 0.16 * env.wet);
    sheen.addColorStop(0, sky);
    sheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(left.x, left.y, right.x - left.x, scale * 3.2);
  }

  /** Puffs from the stack tops, drifting back with the wind of driving. */
  private paintSmoke(ctx: CanvasRenderingContext2D, camera: Camera, frame: RigSideFrame) {
    const amount = 0.18 + frame.throttle * 0.6;
    const grey = mix(
      rgb('#8c8c90'),
      rgb('#3b3a3a'),
      Math.min(1, frame.climb * 0.8 + frame.throttle * 0.2),
    );
    const colour = litRgb(grey, frame.env.lighting);
    for (const z of [3.78, -3.78]) {
      for (let puff = 0; puff < 7; puff++) {
        const age = (frame.time * (0.9 + frame.throttle * 0.8) + puff / 7) % 1;
        const at: Vec3 = [53.36 - age * 16, RIG.stackTop + 0.2 + age * 3.5, z];
        const point = camera.project(at);
        const radius = (0.35 + age * 2.6) * camera.pixelsAt(at);
        ctx.fillStyle = css(colour, amount * 0.3 * (1 - age) * (z > 0 ? 1 : 0.6));
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /** The headlights' pool on the road ahead, and their beams in the air. */
  private paintBeams(ctx: CanvasRenderingContext2D, camera: Camera, env: Environment) {
    const lamp = camera.project([64.95, 4.85, 2.5]);
    const pool = camera.project([95, 0, 2]);
    const scale = camera.pixelsAt([95, 0, 2]);
    const strength = 0.25 + env.night * 0.35;
    const glow = ctx.createRadialGradient(pool.x, pool.y, 0, pool.x, pool.y, scale * 30);
    glow.addColorStop(0, `rgba(255, 236, 190, ${strength})`);
    glow.addColorStop(1, 'rgba(255, 236, 190, 0)');
    ctx.fillStyle = glow;
    ctx.save();
    ctx.translate(pool.x, pool.y);
    ctx.scale(1, 0.12);
    ctx.translate(-pool.x, -pool.y);
    ctx.fillRect(pool.x - scale * 30, pool.y - scale * 30, scale * 60, scale * 60);
    ctx.restore();
    const far = camera.project([140, 0, 2.5]);
    const high = camera.project([140, 10, 2.5]);
    const beam = ctx.createLinearGradient(lamp.x, 0, far.x, 0);
    const haze = 0.1 + env.lighting.veil * 0.25 + env.wet * 0.1;
    beam.addColorStop(0, `rgba(255, 236, 190, ${haze * env.night + 0.04})`);
    beam.addColorStop(1, 'rgba(255, 236, 190, 0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(lamp.x, lamp.y - scale * 0.3);
    ctx.lineTo(high.x, high.y);
    ctx.lineTo(far.x, far.y);
    ctx.lineTo(lamp.x, lamp.y + scale * 0.3);
    ctx.closePath();
    ctx.fill();
  }
}
