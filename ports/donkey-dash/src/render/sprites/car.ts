import type { BodyShape, Paint } from '../../garage';

/**
 * The car: a cute, chunky hatchback (or whatever the garage fitted). All
 * shapes come from the body's measurements, so every body style works in
 * every view. Metres, +y down; the caller scales and places it.
 */
export interface CarPose {
  shape: BodyShape;
  paint: Paint;
  /** -1…1, leaning into a lane change. */
  lean: number;
  /** 1 in daylight, 0 at night: the headlights come on as it falls. */
  daylight: number;
  /** Spinning its wheels in mud. */
  stuck: boolean;
  time: number;
}

const TYRE = '#1d1a20';
const GLASS = '#26324a';
const GLASS_SHINE = 'rgba(190, 225, 255, 0.55)';
const TAIL_LIGHT = '#ff4d4d';
const HEADLIGHT = '#fff6d0';

/**
 * Seen from above and a little behind, nose up, as the Classic view's tilted
 * table-top shows it. Origin at the centre of the car.
 */
export function drawCarTop(ctx: CanvasRenderingContext2D, pose: CarPose) {
  const { shape, paint, stuck, time } = pose;
  const length = shape.length;
  const width = shape.width;
  const half = length / 2;
  const radius = 0.3 + shape.round * 0.45;
  const jitter = stuck ? Math.sin(time * 60) * 0.03 : 0;

  ctx.save();
  ctx.rotate(pose.lean * 0.12);

  ctx.fillStyle = TYRE;
  for (const x of [-width / 2 - 0.02, width / 2 - 0.26]) {
    for (const y of [-half + 0.55, half - 1.15]) {
      roundRect(ctx, x + jitter, y, 0.28, 0.62, 0.08);
      ctx.fill();
    }
  }

  // The body, darker towards the tail, where the tilt shows its back.
  const body = ctx.createLinearGradient(0, -half, 0, half);
  body.addColorStop(0, paint.body);
  body.addColorStop(0.75, paint.body);
  body.addColorStop(1, paint.shade);
  ctx.fillStyle = body;
  roundRect(ctx, -width / 2, -half, width, length, radius);
  ctx.fill();

  // Its back face: tail lights and a bumper.
  ctx.fillStyle = paint.shade;
  roundRect(ctx, -width / 2 + 0.05, half - 0.42, width - 0.1, 0.38, radius * 0.6);
  ctx.fill();
  ctx.fillStyle = TAIL_LIGHT;
  roundRect(ctx, -width / 2 + 0.14, half - 0.36, 0.34, 0.14, 0.05);
  ctx.fill();
  roundRect(ctx, width / 2 - 0.48, half - 0.36, 0.34, 0.14, 0.05);
  ctx.fill();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.fillRect(-width / 2 + 0.2, half - 0.12, width - 0.4, 0.07);

  const cabinFront = half - shape.cabin[1] * length;
  const cabinBack = half - shape.cabin[0] * length;
  if (shape.bed) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    roundRect(ctx, -width / 2 + 0.18, cabinBack + 0.1, width - 0.36, half - cabinBack - 0.6, 0.08);
    ctx.fill();
  }
  if (shape.open) {
    // Two seats in the open air.
    ctx.fillStyle = '#3a2a2a';
    roundRect(ctx, -width / 2 + 0.22, cabinFront + 0.35, width / 2 - 0.3, 0.7, 0.15);
    ctx.fill();
    roundRect(ctx, 0.08, cabinFront + 0.35, width / 2 - 0.3, 0.7, 0.15);
    ctx.fill();
    ctx.fillStyle = GLASS;
    roundRect(ctx, -width / 2 + 0.18, cabinFront, width - 0.36, 0.18, 0.08);
    ctx.fill();
  } else {
    ctx.fillStyle = GLASS;
    roundRect(
      ctx,
      -width / 2 + 0.14,
      cabinFront,
      width - 0.28,
      cabinBack - cabinFront,
      radius * 0.8,
    );
    ctx.fill();
    // The roof sits over the glass, leaving the windscreen and rear window.
    const windscreen = 0.42 + shape.round * 0.1;
    ctx.fillStyle = paint.body;
    roundRect(
      ctx,
      -width / 2 + 0.22,
      cabinFront + windscreen,
      width - 0.44,
      Math.max(0.3, cabinBack - cabinFront - windscreen - 0.36),
      radius * 0.7,
    );
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    roundRect(ctx, -width / 2 + 0.36, cabinFront + windscreen + 0.1, width * 0.22, 0.9, 0.12);
    ctx.fill();
    ctx.strokeStyle = GLASS_SHINE;
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(-width / 2 + 0.35, cabinFront + 0.3);
    ctx.lineTo(-width / 2 + 0.6, cabinFront + 0.1);
    ctx.stroke();
  }

  // A racing stripe down the bonnet, in the trim colour.
  ctx.fillStyle = paint.trim;
  ctx.globalAlpha = 0.75;
  ctx.fillRect(-0.12, -half + 0.12, 0.24, Math.max(0.2, cabinFront + half - 0.2));
  ctx.globalAlpha = 1;

  ctx.fillStyle = HEADLIGHT;
  for (const x of [-width / 2 + 0.3, width / 2 - 0.3]) {
    ctx.beginPath();
    ctx.ellipse(x, -half + 0.12, 0.17, 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Seen from behind and a little above, for the Chase view. Origin on the ground, mid-bumper. */
export function drawCarRear(ctx: CanvasRenderingContext2D, pose: CarPose) {
  const { shape, paint, stuck, time, daylight } = pose;
  const width = shape.width;
  const bodyTop = -(0.3 + shape.height);
  const roof = bodyTop - shape.cabinHeight;
  const jitter = stuck ? Math.sin(time * 55) * 0.025 : 0;

  ctx.save();
  ctx.rotate(pose.lean * 0.07);

  ctx.fillStyle = TYRE;
  roundRect(ctx, -width / 2 + 0.02 + jitter, -0.62, 0.42, 0.62, 0.12);
  ctx.fill();
  roundRect(ctx, width / 2 - 0.44 - jitter, -0.62, 0.42, 0.62, 0.12);
  ctx.fill();

  if (!shape.open) {
    const cabinWidth = width * (0.84 - shape.cabinHeight * 0.1);
    const topWidth = width * (0.58 + shape.round * 0.12);
    ctx.fillStyle = paint.body;
    ctx.beginPath();
    ctx.moveTo(-cabinWidth / 2, bodyTop + 0.02);
    ctx.lineTo(-topWidth / 2, roof + 0.08 * shape.round);
    ctx.quadraticCurveTo(0, roof - 0.08 * shape.round, topWidth / 2, roof + 0.08 * shape.round);
    ctx.lineTo(cabinWidth / 2, bodyTop + 0.02);
    ctx.closePath();
    ctx.fill();
    // The rear window, with the sky caught in it.
    const inset = 0.12;
    const glass = ctx.createLinearGradient(0, roof, 0, bodyTop);
    glass.addColorStop(0, '#5b7aa6');
    glass.addColorStop(1, GLASS);
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.moveTo(-cabinWidth / 2 + inset, bodyTop - 0.04);
    ctx.lineTo(-topWidth / 2 + inset, roof + 0.12);
    ctx.lineTo(topWidth / 2 - inset, roof + 0.12);
    ctx.lineTo(cabinWidth / 2 - inset, bodyTop - 0.04);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = GLASS_SHINE;
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(-topWidth / 2 + 0.3, roof + 0.2);
    ctx.lineTo(-cabinWidth / 2 + 0.35, bodyTop - 0.12);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#3a2a2a';
    roundRect(ctx, -width / 2 + 0.3, bodyTop - 0.34, 0.42, 0.36, 0.12);
    ctx.fill();
    roundRect(ctx, width / 2 - 0.72, bodyTop - 0.34, 0.42, 0.36, 0.12);
    ctx.fill();
  }

  const body = ctx.createLinearGradient(0, bodyTop, 0, -0.25);
  body.addColorStop(0, paint.body);
  body.addColorStop(1, paint.shade);
  ctx.fillStyle = body;
  roundRect(ctx, -width / 2, bodyTop, width, -0.25 - bodyTop, 0.18 + shape.round * 0.2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.fillRect(-width / 2 + 0.15, bodyTop + 0.04, width - 0.3, 0.05);

  // Tail lights glow a little brighter as the day goes.
  const glow = 0.35 + (1 - daylight) * 0.65;
  ctx.fillStyle = TAIL_LIGHT;
  roundRect(ctx, -width / 2 + 0.1, bodyTop + 0.12, 0.36, 0.2, 0.05);
  ctx.fill();
  roundRect(ctx, width / 2 - 0.46, bodyTop + 0.12, 0.36, 0.2, 0.05);
  ctx.fill();
  if (glow > 0.5) {
    for (const x of [-width / 2 + 0.28, width / 2 - 0.28]) {
      const halo = ctx.createRadialGradient(x, bodyTop + 0.22, 0.05, x, bodyTop + 0.22, 0.42);
      halo.addColorStop(0, `rgba(255, 90, 80, ${(glow - 0.5) * 0.9})`);
      halo.addColorStop(1, 'rgba(255, 70, 70, 0)');
      ctx.fillStyle = halo;
      ctx.fillRect(x - 0.42, bodyTop - 0.2, 0.84, 0.84);
    }
  }

  ctx.fillStyle = '#f4f1e8';
  roundRect(ctx, -0.26, bodyTop + 0.36, 0.52, 0.16, 0.03);
  ctx.fill();
  ctx.fillStyle = '#39343d';
  for (let mark = 0; mark < 5; mark++) ctx.fillRect(-0.2 + mark * 0.085, bodyTop + 0.4, 0.05, 0.08);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  roundRect(ctx, -width / 2 + 0.05, -0.42, width - 0.1, 0.16, 0.06);
  ctx.fill();
  ctx.fillStyle = '#2b2b30';
  ctx.beginPath();
  ctx.arc(width / 2 - 0.55, -0.34, 0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.max(0, Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}
