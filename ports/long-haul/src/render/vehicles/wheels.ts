import type { Cylinder, FaceDraw } from './parts';
import type { Vec3 } from './geometry';

/**
 * Wheels: a tyre with tread and a sidewall, and the rim that tells you what
 * kind of vehicle it is. Polished aluminium on the tractor, painted steel
 * discs with hand holes on the trailer, black steel with a small chrome cap
 * on a patrol car, full covers on a family sedan. Everything on the rim
 * turns with `turn`, so the eye reads the speed from the lug nuts.
 */
export type RimStyle = 'polished' | 'steel-disc' | 'patrol' | 'cover';

export interface WheelSpec {
  centre: Vec3;
  radius: number;
  width: number;
  rim: RimStyle;
  /** +1 when the outside of the wheel faces the vehicle's right (+z), −1 for the left. */
  side: 1 | -1;
  /** The inner tyre of a pair: hidden behind its partner, so no rim is painted. */
  inner?: boolean;
  /** Steering angle in radians, positive to the left. */
  steer?: number;
  /** Painted steel colour for discs, or the car's cap. */
  paint?: string;
}

/** Tread blocks round a tyre; enough that they flicker past at speed. */
const TREAD_BLOCKS = 36;

export function wheelPart(spec: WheelSpec, turn: number, dirt = 0): Cylinder {
  const steer = spec.steer ?? 0;
  const axis: Vec3 = [Math.sin(steer) * spec.side, 0, Math.cos(steer) * spec.side];
  return {
    kind: 'cylinder',
    centre: spec.centre,
    axis,
    up: [0, 1, 0],
    radius: spec.radius,
    length: spec.width,
    material: { kind: 'rubber', colour: '#232427' },
    capMaterial: { kind: 'rubber', colour: '#2b2c30' },
    // The tread's angles are measured round the axis, which points outwards on either side.
    bandMarks: { count: TREAD_BLOCKS, phase: -turn * spec.side, colour: 'rgba(8, 8, 10, 0.75)' },
    cap: spec.inner ? paintSidewall(spec.radius, dirt) : paintWheelFace(spec, turn, dirt),
  };
}

function paintSidewall(radius: number, dirt: number) {
  return (face: FaceDraw) => sidewall(face, radius, dirt);
}

function sidewall(face: FaceDraw, radius: number, dirt: number) {
  const { ctx } = face;
  // The bulge of the sidewall catches a soft ring of light, the shoulder a darker one.
  const ring = ctx.createRadialGradient(0, 0, radius * 0.55, 0, 0, radius);
  ring.addColorStop(0, face.ink('#1b1c1f', 'rubber'));
  ring.addColorStop(0.45, face.ink('#3a3b40', 'rubber', 0.6));
  ring.addColorStop(0.8, face.ink('#26272b', 'rubber'));
  ring.addColorStop(1, face.ink('#121315', 'rubber'));
  ctx.fillStyle = ring;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  if (dirt > 0.05) {
    const mud = ctx.createLinearGradient(0, -radius, 0, radius * 0.2);
    mud.addColorStop(0, `rgba(122, 104, 82, ${0.45 * dirt})`);
    mud.addColorStop(1, 'rgba(122, 104, 82, 0)');
    ctx.fillStyle = mud;
    ctx.fill();
  }
}

function paintWheelFace(spec: WheelSpec, turn: number, dirt: number) {
  return (face: FaceDraw) => {
    sidewall(face, spec.radius, dirt);
    const rim = spec.radius * (spec.rim === 'cover' || spec.rim === 'patrol' ? 0.66 : 0.6);
    const { ctx } = face;
    ctx.save();
    // Rolling forward turns the rim clockwise when forward is to the right of the picture.
    ctx.rotate(face.u[0] >= 0 ? -turn : turn);
    switch (spec.rim) {
      case 'polished':
        polishedRim(face, rim);
        break;
      case 'steel-disc':
        steelDisc(face, rim, spec.paint ?? '#e9e7df');
        break;
      case 'patrol':
        patrolRim(face, rim, spec.paint ?? '#1d1e21');
        break;
      case 'cover':
        wheelCover(face, rim);
        break;
    }
    ctx.restore();
  };
}

function disc(ctx: CanvasRenderingContext2D, radius: number) {
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
}

/** A ring of `count` dots at `distance` from the hub. */
function boltCircle(
  ctx: CanvasRenderingContext2D,
  count: number,
  distance: number,
  size: number,
  colour: string,
  offset = 0,
) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  for (let index = 0; index < count; index++) {
    const angle = offset + (index / count) * Math.PI * 2;
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;
    ctx.moveTo(x + size, y);
    ctx.arc(x, y, size, 0, Math.PI * 2);
  }
  ctx.fill();
}

/** Polished aluminium: a bright dish, ten oval hand holes, a chrome hub. */
function polishedRim(face: FaceDraw, radius: number) {
  const { ctx } = face;
  const dish = ctx.createLinearGradient(0, radius, 0, -radius);
  dish.addColorStop(0, face.ink('#d9dee3', 'chrome', -0.5));
  dish.addColorStop(0.45, face.ink('#eef1f4', 'chrome', 0.05));
  dish.addColorStop(0.55, face.ink('#8f969d', 'chrome', 0.15));
  dish.addColorStop(1, face.ink('#f7f9fb', 'chrome', 0.3));
  ctx.fillStyle = dish;
  disc(ctx, radius);
  ctx.fill();
  ctx.strokeStyle = face.ink('#6d757d', 'metal');
  ctx.lineWidth = radius * 0.05;
  disc(ctx, radius * 0.97);
  ctx.stroke();
  if (face.pixels * radius > 6) {
    ctx.fillStyle = face.ink('#15171a', 'rubber');
    for (let hole = 0; hole < 10; hole++) {
      const angle = (hole / 10) * Math.PI * 2;
      ctx.save();
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.ellipse(radius * 0.66, 0, radius * 0.13, radius * 0.075, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  const hub = ctx.createRadialGradient(-radius * 0.08, radius * 0.08, 0, 0, 0, radius * 0.36);
  hub.addColorStop(0, face.ink('#ffffff', 'chrome', 0.6));
  hub.addColorStop(1, face.ink('#7d858d', 'chrome', -0.4));
  ctx.fillStyle = hub;
  disc(ctx, radius * 0.36);
  ctx.fill();
  if (face.pixels * radius > 10)
    boltCircle(ctx, 10, radius * 0.29, radius * 0.035, face.ink('#4a5057', 'metal'), Math.PI / 10);
}

/** A painted steel disc: duller, with round hand holes and the nuts showing. */
function steelDisc(face: FaceDraw, radius: number, paint: string) {
  const { ctx } = face;
  const dish = ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, radius);
  dish.addColorStop(0, face.ink(paint, 'paint', 0.2));
  dish.addColorStop(0.7, face.ink(paint, 'paint'));
  dish.addColorStop(1, face.ink(paint, 'paint', -0.6));
  ctx.fillStyle = dish;
  disc(ctx, radius);
  ctx.fill();
  if (face.pixels * radius > 6) {
    boltCircle(ctx, 10, radius * 0.66, radius * 0.1, face.ink('#141518', 'rubber'));
    boltCircle(ctx, 10, radius * 0.34, radius * 0.04, face.ink('#5c5f64', 'metal'), Math.PI / 10);
  }
  ctx.fillStyle = face.ink('#3a3d42', 'metal');
  disc(ctx, radius * 0.2);
  ctx.fill();
}

/** Black steel with the chrome "dog dish" cap of a fleet car. */
function patrolRim(face: FaceDraw, radius: number, paint: string) {
  const { ctx } = face;
  ctx.fillStyle = face.ink(paint, 'paint');
  disc(ctx, radius);
  ctx.fill();
  if (face.pixels * radius > 6) {
    boltCircle(ctx, 6, radius * 0.72, radius * 0.07, face.ink('#0b0c0d', 'rubber'), Math.PI / 6);
  }
  const cap = ctx.createLinearGradient(0, -radius * 0.55, 0, radius * 0.55);
  cap.addColorStop(0, face.ink('#c9ced3', 'chrome', -0.4));
  cap.addColorStop(0.5, face.ink('#7e868e', 'chrome'));
  cap.addColorStop(1, face.ink('#f5f7f9', 'chrome', 0.6));
  ctx.fillStyle = cap;
  disc(ctx, radius * 0.52);
  ctx.fill();
  ctx.fillStyle = face.ink('#4b5056', 'metal');
  disc(ctx, radius * 0.12);
  ctx.fill();
}

/** A full wheel cover with spokes pressed into it. */
function wheelCover(face: FaceDraw, radius: number) {
  const { ctx } = face;
  const cover = ctx.createLinearGradient(0, -radius, 0, radius);
  cover.addColorStop(0, face.ink('#aeb5bc', 'chrome', -0.5));
  cover.addColorStop(0.5, face.ink('#6f777f', 'chrome'));
  cover.addColorStop(1, face.ink('#f2f4f6', 'chrome', 0.6));
  ctx.fillStyle = cover;
  disc(ctx, radius);
  ctx.fill();
  if (face.pixels * radius > 6) {
    ctx.strokeStyle = face.ink('#3e444a', 'metal');
    ctx.lineWidth = radius * 0.05;
    ctx.beginPath();
    for (let spoke = 0; spoke < 12; spoke++) {
      const angle = (spoke / 12) * Math.PI * 2;
      ctx.moveTo(Math.cos(angle) * radius * 0.3, Math.sin(angle) * radius * 0.3);
      ctx.lineTo(Math.cos(angle) * radius * 0.85, Math.sin(angle) * radius * 0.85);
    }
    ctx.stroke();
  }
  ctx.fillStyle = face.ink('#e8ebee', 'chrome', 0.4);
  disc(ctx, radius * 0.22);
  ctx.fill();
}
