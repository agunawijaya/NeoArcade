import type { Camera } from '../camera';
import { drawLamps, type Lamp } from '../lamps';
import type { Environment } from '../light';
import { drawParts, type Part } from '../parts';
import type { RigLights, RigModel } from './model';
import { tractorBody, tractorLamps, tractorWheels, type TractorState } from './tractor';
import { trailerBody, trailerLamps, trailerWheels } from './trailer';

/**
 * The whole rig from one model: its body (tractor and trailer apart, since
 * they ride their springs separately), its wheels (which turn) and its
 * lamps (which light). Views that draw the rig whole, like a card picture,
 * use `drawRig`; the side view composes the pieces itself.
 */
export type RigState = TractorState;

export interface RigPieces {
  tractor: Part[];
  trailer: Part[];
  tractorWheels: Part[];
  trailerWheels: Part[];
  lamps: Lamp[];
}

export function rigPieces(model: RigModel, state: RigState): RigPieces {
  return {
    tractor: tractorBody(model, state),
    trailer: trailerBody(model),
    tractorWheels: tractorWheels(model, state),
    trailerWheels: trailerWheels(model, state.turn),
    lamps: [...tractorLamps(), ...trailerLamps()],
  };
}

/** How bright a rig lamp is with these lights on: 0 off … 1 full. */
export function rigLampStrength(lamp: Lamp, lights: RigLights): number {
  let power = 0;
  for (const role of lamp.roles) {
    if (role === 'head' && lights.head) power = Math.max(power, 1);
    if (role === 'marker' && lights.markers) power = Math.max(power, 0.75);
    if (role === 'tail' && (lights.markers || lights.head)) power = Math.max(power, 0.55);
    if (role === 'brake' && lights.brake) power = 1;
    if (role === 'left' && lights.left) power = 1;
    if (role === 'right' && lights.right) power = 1;
  }
  return power;
}

export function drawRig(
  ctx: CanvasRenderingContext2D,
  model: RigModel,
  state: RigState,
  camera: Camera,
  env: Environment,
) {
  const pieces = rigPieces(model, state);
  drawParts(
    ctx,
    [...pieces.trailer, ...pieces.tractor, ...pieces.tractorWheels, ...pieces.trailerWheels],
    camera,
    env,
  );
  drawLamps(ctx, pieces.lamps, camera, (lamp) => rigLampStrength(lamp, state.lights), env.night);
}
