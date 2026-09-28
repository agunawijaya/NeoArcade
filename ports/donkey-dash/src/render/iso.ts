import type { BodyShape, HatStyle, Paint } from '../garage';
import { mix, type Coat } from './palette';

/**
 * True 2:1 isometric drawing. The road runs along `u` (up and to the right
 * on screen), `v` points across it towards the viewer (down and to the
 * right), `z` is up. One metre along u or v moves `unit` pixels across and
 * half that up or down; one metre up is 1.2 × unit.
 */
export interface IsoProjection {
  originX: number;
  originY: number;
  unit: number;
}

export interface Point {
  x: number;
  y: number;
}

export function iso(projection: IsoProjection, u: number, v: number, z = 0): Point {
  const { originX, originY, unit } = projection;
  return {
    x: originX + (u + v) * unit,
    y: originY + ((v - u) * unit) / 2 - z * unit * 1.2,
  };
}

/** Painter's order: things further back (up-left) first. */
export function isoDepth(u: number, v: number): number {
  return v - u;
}

export interface BoxColours {
  top: string;
  /** The face towards the viewer across the road (+v). */
  side: string;
  /** The face looking back down the road (−u). */
  end: string;
}

/** A box from (u, v, z) with size (du, dv, dz); only the three faces the camera sees. */
export function isoBox(
  ctx: CanvasRenderingContext2D,
  projection: IsoProjection,
  u: number,
  v: number,
  z: number,
  du: number,
  dv: number,
  dz: number,
  colours: BoxColours,
) {
  const p = (a: number, b: number, c: number) => iso(projection, a, b, c);
  face(
    ctx,
    [p(u, v + dv, z), p(u + du, v + dv, z), p(u + du, v + dv, z + dz), p(u, v + dv, z + dz)],
    colours.side,
  );
  face(ctx, [p(u, v, z), p(u, v + dv, z), p(u, v + dv, z + dz), p(u, v, z + dz)], colours.end);
  face(
    ctx,
    [p(u, v, z + dz), p(u + du, v, z + dz), p(u + du, v + dv, z + dz), p(u, v + dv, z + dz)],
    colours.top,
  );
}

/** A flat shape on the ground (or at height z), given as (u, v) corners. */
export function isoFlat(
  ctx: CanvasRenderingContext2D,
  projection: IsoProjection,
  corners: readonly (readonly [number, number])[],
  colour: string,
  z = 0,
) {
  face(
    ctx,
    corners.map(([u, v]) => iso(projection, u, v, z)),
    colour,
  );
}

export function shaded(colour: string): BoxColours {
  return { top: mix(colour, '#ffffff', 0.12), side: colour, end: mix(colour, '#000000', 0.22) };
}

function face(ctx: CanvasRenderingContext2D, points: Point[], colour: string) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  points.forEach((point, index) =>
    index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y),
  );
  ctx.closePath();
  ctx.fill();
}

/** A soft round shadow on the ground. */
export function isoShadow(
  ctx: CanvasRenderingContext2D,
  projection: IsoProjection,
  u: number,
  v: number,
  radius: number,
  colour: string,
) {
  const centre = iso(projection, u, v);
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.ellipse(
    centre.x,
    centre.y,
    radius * projection.unit * 1.2,
    radius * projection.unit * 0.6,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
}

export interface IsoDonkeyPose {
  coat: Coat;
  /** 1: its head is towards the viewer; -1: away. */
  facing: 1 | -1;
  time: number;
  seed: number;
  startled: number;
  dazed: boolean;
  hop: number;
  hat: HatStyle | null;
}

/**
 * A chunky block donkey standing across the road, its near edge at `u`.
 * Parts are drawn back to front so the blocks overlap properly.
 */
export function drawIsoDonkey(
  ctx: CanvasRenderingContext2D,
  projection: IsoProjection,
  u: number,
  v: number,
  pose: IsoDonkeyPose,
) {
  const { coat, facing, time, seed, startled, dazed } = pose;
  const lift = Math.sin(pose.hop * Math.PI) * 0.6 - (dazed ? 0.25 : 0);
  const body = shaded(coat.body);
  const dark = shaded(coat.dark);
  const light = shaded(coat.light);
  const half = 0.75;
  // Positions across the road, from the tail end to the head end.
  const across = (offset: number) => v + offset * facing;
  const parts: { order: number; draw(): void }[] = [];
  const box = (
    a: number,
    b: number,
    c: number,
    du: number,
    dv: number,
    dz: number,
    colours: BoxColours,
  ) => {
    const start = facing > 0 ? b : b - dv;
    parts.push({
      order: isoDepth(a + du / 2, start + dv / 2) + c * 0.01,
      draw: () => isoBox(ctx, projection, a, start, c + lift, du, dv, dz, colours),
    });
  };
  const legHeight = dazed ? 0.2 : 0.55;
  for (const [along, offset] of [
    [u + 0.05, -half + 0.1],
    [u + 0.32, -half + 0.1],
    [u + 0.05, half - 0.25],
    [u + 0.32, half - 0.25],
  ] as const) {
    box(along, across(offset), 0, 0.14, 0.14, legHeight, dark);
  }
  box(u, across(-half), legHeight, 0.5, 1.4, 0.55, body);
  box(u + 0.05, across(-half - 0.12), legHeight + 0.3, 0.1, 0.14, 0.12, dark);
  const earFlick = Math.max(0, Math.sin(time * 1.3 + (seed % 17)) - 0.93) * 3;
  const headV = across(half - 0.1);
  box(u + 0.08, headV, legHeight + 0.4, 0.34, 0.3, 0.55, body);
  box(u + 0.06, across(half + 0.1), legHeight + 0.62, 0.38, 0.5, 0.34, body);
  box(u + 0.08, across(half + 0.48), legHeight + 0.62, 0.34, 0.18, 0.24, light);
  box(
    u + 0.1,
    across(half + 0.12),
    legHeight + 0.96,
    0.08,
    0.08,
    0.42 + startled * 0.1 + earFlick * 0.1,
    dark,
  );
  box(u + 0.3, across(half + 0.12), legHeight + 0.96, 0.08, 0.08, 0.38 + startled * 0.1, dark);
  parts.sort((a, b) => a.order - b.order);
  for (const part of parts) part.draw();

  // The eye, on the side of the head facing the viewer, with its unimpressed lid.
  const eye = iso(
    projection,
    u + 0.26,
    across(half + 0.32) + (facing > 0 ? 0.25 : 0),
    legHeight + 0.8 + lift,
  );
  ctx.fillStyle = dazed ? '#ffe45c' : '#231c19';
  ctx.fillRect(
    eye.x - projection.unit * 0.05,
    eye.y - projection.unit * 0.05,
    projection.unit * 0.1,
    projection.unit * (startled > 0.3 ? 0.12 : 0.06),
  );
  if (pose.hat) {
    const top = iso(projection, u + 0.25, across(half + 0.3), legHeight + 1.02 + lift);
    drawIsoHat(ctx, top, projection.unit, pose.hat);
  }
}

function drawIsoHat(ctx: CanvasRenderingContext2D, top: Point, unit: number, hat: HatStyle) {
  const colours: Record<HatStyle, string> = {
    straw: '#e8c25e',
    cowboy: '#8a5a34',
    party: '#ff5e8a',
    flower: '#ff9ec4',
    top: '#1f1b24',
    crown: '#ffd23f',
  };
  ctx.fillStyle = colours[hat];
  const size = unit * 0.34;
  if (hat === 'party') {
    ctx.beginPath();
    ctx.moveTo(top.x - size * 0.6, top.y);
    ctx.lineTo(top.x, top.y - size * 2.2);
    ctx.lineTo(top.x + size * 0.6, top.y);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.ellipse(
    top.x,
    top.y,
    size * (hat === 'top' || hat === 'crown' ? 0.8 : 1.4),
    size * 0.45,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  const crown = hat === 'top' ? 1.4 : hat === 'flower' ? 0 : 0.6;
  if (crown > 0) ctx.fillRect(top.x - size * 0.6, top.y - size * crown, size * 1.2, size * crown);
}

export interface IsoCarPose {
  shape: BodyShape;
  paint: Paint;
  daylight: number;
  lean: number;
}

/** The car as blocks: chassis, cabin, wheels, lights. Its nose is at `u`, centred on `v`. */
export function drawIsoCar(
  ctx: CanvasRenderingContext2D,
  projection: IsoProjection,
  u: number,
  v: number,
  lift: number,
  pose: IsoCarPose,
) {
  const { shape, paint } = pose;
  const length = shape.length;
  const width = shape.width;
  const back = u - length;
  const left = v - width / 2;
  const tyre: BoxColours = { top: '#3a3640', side: '#1d1a20', end: '#141217' };
  const body: BoxColours = {
    top: mix(paint.body, '#ffffff', 0.18),
    side: paint.body,
    end: paint.shade,
  };
  const glass: BoxColours = { top: '#6a88b4', side: '#2d3c5c', end: '#26324a' };
  const z = lift + 0.38;
  // Wheels on the far side first, then the body, then the near wheels peeking out below it.
  isoBox(ctx, projection, back + 0.55, left + 0.05, lift, 0.7, 0.25, 0.5, tyre);
  isoBox(ctx, projection, u - 1.25, left + 0.05, lift, 0.7, 0.25, 0.5, tyre);
  isoBox(ctx, projection, back, left, z, length, width, shape.height, body);
  const cabinFrom = back + shape.cabin[0] * length;
  const cabinTo = back + shape.cabin[1] * length;
  if (!shape.open) {
    isoBox(
      ctx,
      projection,
      cabinFrom,
      left + 0.14,
      z + shape.height,
      cabinTo - cabinFrom,
      width - 0.28,
      shape.cabinHeight,
      glass,
    );
    isoBox(
      ctx,
      projection,
      cabinFrom + 0.2,
      left + 0.18,
      z + shape.height + shape.cabinHeight - 0.06,
      cabinTo - cabinFrom - 0.4,
      width - 0.36,
      0.08,
      body,
    );
  } else {
    isoBox(
      ctx,
      projection,
      cabinFrom,
      left + 0.25,
      z + shape.height,
      0.5,
      0.5,
      0.35,
      shaded('#3a2a2a'),
    );
    isoBox(
      ctx,
      projection,
      cabinFrom,
      left + width - 0.75,
      z + shape.height,
      0.5,
      0.5,
      0.35,
      shaded('#3a2a2a'),
    );
  }
  // A stripe along the bonnet.
  isoBox(
    ctx,
    projection,
    cabinTo,
    v - 0.12,
    z + shape.height,
    u - cabinTo - 0.1,
    0.24,
    0.02,
    shaded(paint.trim),
  );
  isoBox(ctx, projection, back + 0.55, left + width - 0.2, lift, 0.7, 0.25, 0.5, tyre);
  isoBox(ctx, projection, u - 1.25, left + width - 0.2, lift, 0.7, 0.25, 0.5, tyre);
  // Tail lights on the back face.
  for (const offset of [0.18, width - 0.46]) {
    const light = iso(projection, back, left + offset, z + shape.height * 0.62);
    const next = iso(projection, back, left + offset + 0.28, z + shape.height * 0.62);
    ctx.strokeStyle = '#ff4d4d';
    ctx.lineWidth = Math.max(1.5, projection.unit * 0.14);
    ctx.beginPath();
    ctx.moveTo(light.x, light.y);
    ctx.lineTo(next.x, next.y);
    ctx.stroke();
  }
}
