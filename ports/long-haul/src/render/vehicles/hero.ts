import type { ConditionId } from '../../engine/conditions';
import { framedCamera, type Camera } from './camera';
import type { Vec3 } from './geometry';
import { drawLamps } from './lamps';
import { environmentFor, environmentKey, type Environment } from './light';
import type { Part } from './parts';
import type { RigLights, RigModel } from './rig/model';
import { rigLampStrength, rigPieces } from './rig/rig';
import { BEACONS, sedanBody, sedanLamps, sedanWheels, type SedanState } from './sedan/body';
import { barFlash, drawBeacons } from './sedan/lightbar';
import type { SedanModel } from './sedan/model';
import { sedanLampStrength } from './sedan/sedan';
import { VehicleSprite } from './sprite';

/**
 * Posed pictures of the vehicles, framed to fit a rectangle: the rig on an
 * event card, in the garage, on the logbook; the cruiser beside it. Each
 * keeps its painting between frames, so a card can animate its lamps
 * without repainting the rig.
 */
export interface Pose {
  azimuth: number;
  elevation: number;
  /** The part of the world to frame, in the vehicle's own feet. */
  min: Vec3;
  max: Vec3;
  rect: { x: number; y: number; width: number; height: number };
  margin?: number;
}

/** Studio light for a picture: the sun's height and the weather it stands in. */
export function posterLight(
  sunAltitude: number,
  condition: ConditionId = 'clear',
  ground = '#4a4d52',
): Environment {
  return environmentFor({
    sunAltitude,
    condition,
    sun: [-0.55, Math.max(0.08, Math.sin((Math.max(-4, sunAltitude) * Math.PI) / 180)), 0.45],
    ground,
    horizon: '#6f6a5c',
  });
}

export const WHOLE_RIG = { min: [0, 0, -4.8] as Vec3, max: [65.6, 13.6, 4.8] as Vec3 };
export const WHOLE_SEDAN = { min: [-0.3, 0, -3.6] as Vec3, max: [18, 7.2, 3.6] as Vec3 };

export function poseCamera(pose: Pose): Camera {
  return framedCamera({
    azimuth: pose.azimuth,
    elevation: pose.elevation,
    min: pose.min,
    max: pose.max,
    left: pose.rect.x,
    top: pose.rect.y,
    width: pose.rect.width,
    height: pose.rect.height,
    margin: pose.margin,
  });
}

export class RigPortrait {
  private readonly sprite = new VehicleSprite();

  draw(
    ctx: CanvasRenderingContext2D,
    model: RigModel,
    lights: RigLights,
    env: Environment,
    camera: Camera,
    key: string,
  ) {
    const state = { lights, turn: 0, steer: 0, sway: 0 };
    const pieces = rigPieces(model, state);
    this.sprite.draw(ctx, {
      shape: `${key}|${JSON.stringify(model)}|${lights.driver}|${lights.cab}`,
      light: environmentKey(env),
      camera,
      env,
      ...WHOLE_RIG,
      body: (): Part[] => [
        ...pieces.trailer,
        ...pieces.tractor,
        ...pieces.trailerWheels,
        ...pieces.tractorWheels,
      ],
      wheels: [],
      lift: 0,
    });
    drawLamps(ctx, pieces.lamps, camera, (lamp) => rigLampStrength(lamp, lights), env.night);
  }
}

export class SedanPortrait {
  private readonly sprite = new VehicleSprite();

  draw(
    ctx: CanvasRenderingContext2D,
    model: SedanModel,
    state: SedanState,
    env: Environment,
    camera: Camera,
    key: string,
    time: number,
    reducedMotion: boolean,
  ) {
    this.sprite.draw(ctx, {
      shape: `${key}|${JSON.stringify(model)}|${state.lights.driver}`,
      light: environmentKey(env),
      camera,
      env,
      ...WHOLE_SEDAN,
      body: (): Part[] => [...sedanBody(model, state), ...sedanWheels(model, state)],
      wheels: [],
      lift: 0,
    });
    drawLamps(
      ctx,
      sedanLamps(model),
      camera,
      (lamp) => sedanLampStrength(lamp, state.lights),
      env.night,
    );
    if (model.kind === 'patrol' && state.lights.bar)
      drawBeacons(ctx, camera, BEACONS.red, BEACONS.blue, barFlash(time, reducedMotion), env.night);
  }
}
