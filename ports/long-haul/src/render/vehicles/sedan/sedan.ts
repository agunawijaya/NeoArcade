import { obliqueCamera, type Camera } from '../camera';
import { drawLamps, type Lamp } from '../lamps';
import { environmentKey, type Environment } from '../light';
import { drawParts } from '../parts';
import { VehicleSprite } from '../sprite';
import { DIORAMA_LEAN, DIORAMA_RISE } from '../rig/side';
import { BEACONS, sedanBody, sedanLamps, sedanWheels, type SedanState } from './body';
import { barFlash, drawBeacons } from './lightbar';
import { SEDAN, type SedanLights, type SedanModel } from './model';

/**
 * The sedan whole: drawn straight from its parts for a camera that moves
 * (the mirrors, the windscreen), or kept painted for the side diorama, where
 * the camera only slides along with it.
 */
export function sedanLampStrength(lamp: Lamp, lights: SedanLights): number {
  let power = 0;
  for (const role of lamp.roles) {
    if (role === 'head' && lights.head) power = Math.max(power, 1);
    if (role === 'marker' && lights.markers) power = Math.max(power, 0.7);
    if (role === 'tail' && (lights.markers || lights.head)) power = Math.max(power, 0.55);
    if (role === 'brake' && lights.brake) power = 1;
    if (role === 'left' && lights.left) power = 1;
    if (role === 'right' && lights.right) power = 1;
    if (role === 'spot' && lights.spot) power = 1;
  }
  return power;
}

export interface SedanFrame {
  model: SedanModel;
  state: SedanState;
  env: Environment;
  time: number;
  reducedMotion: boolean;
}

export function drawSedan(ctx: CanvasRenderingContext2D, camera: Camera, frame: SedanFrame) {
  const { model, state, env } = frame;
  drawParts(ctx, [...sedanBody(model, state), ...sedanWheels(model, state)], camera, env);
  drawSedanLights(ctx, camera, frame);
}

/** Lamps and, on the cruiser, the beacons turning. */
export function drawSedanLights(ctx: CanvasRenderingContext2D, camera: Camera, frame: SedanFrame) {
  const { model, state, env } = frame;
  drawLamps(
    ctx,
    sedanLamps(model),
    camera,
    (lamp) => sedanLampStrength(lamp, state.lights),
    env.night,
  );
  if (model.kind === 'patrol' && state.lights.bar)
    drawBeacons(
      ctx,
      camera,
      BEACONS.red,
      BEACONS.blue,
      barFlash(frame.time, frame.reducedMotion),
      env.night,
    );
}

/** The camera that puts a sedan in the diorama: its back bumper at `left`, its near wheels on `road`. */
export function sedanSideCamera(left: number, road: number, scale: number, lift = 0): Camera {
  return obliqueCamera({
    lean: DIORAMA_LEAN,
    rise: DIORAMA_RISE,
    scale,
    x: left + SEDAN.halfWidth * DIORAMA_LEAN * scale,
    y: road - SEDAN.track * DIORAMA_RISE * scale - lift * scale,
  });
}

export class SedanSideView {
  private readonly sprite = new VehicleSprite();

  draw(
    ctx: CanvasRenderingContext2D,
    frame: SedanFrame & { left: number; road: number; scale: number; lift: number },
  ) {
    const { model, state, env } = frame;
    // Painted at a size rounded to a few steps and slid into place, so a car
    // passing or changing lanes keeps its painting instead of repainting every frame.
    const painted = 2 ** (Math.round(Math.log2(frame.scale) * 24) / 24);
    const stretch = frame.scale / painted;
    const camera = sedanSideCamera(0, 0, painted);
    ctx.save();
    ctx.translate(frame.left, frame.road);
    ctx.scale(stretch, stretch);
    this.paintShadow(ctx, camera, env);
    this.sprite.draw(ctx, {
      shape: [
        painted.toFixed(4),
        JSON.stringify(model),
        state.lights.driver,
        Math.round((state.door ?? 0) * 24),
      ].join('|'),
      light: environmentKey(env),
      camera,
      env,
      min: [-0.2, 0, -3.7],
      max: [18, 7.2, 6],
      body: () => sedanBody(model, { ...state, sway: 0 }),
      wheels: sedanWheels(model, state),
      lift: frame.lift * painted,
    });
    drawSedanLights(ctx, sedanSideCamera(0, 0, painted, frame.lift), frame);
    ctx.restore();
  }

  private paintShadow(ctx: CanvasRenderingContext2D, camera: Camera, env: Environment) {
    const a = camera.project([0, 0, 0]);
    const b = camera.project([SEDAN.length, 0, 0]);
    const scale = camera.pixelsAt([0, 0, 0]);
    ctx.fillStyle = `rgba(0, 0, 0, ${0.24 + (1 - env.night) * 0.14})`;
    ctx.beginPath();
    ctx.ellipse(
      (a.x + b.x) / 2,
      a.y + scale * 0.1,
      (b.x - a.x) / 2 + scale * 0.6,
      scale * 0.6,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}
