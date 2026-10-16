import type { Bird, Flock, Ox } from '../../engine/world';
import type { Palette } from '../palette';
import type { SideCamera } from './camera';
import { shade } from './colour';

/**
 * The ox: big, solid, chewing, utterly unimpressed by the war overhead.
 * It lifts its head to watch a plane that comes low, then goes back to
 * chewing. `attention` is 0…1 for how much it is watching.
 */
export function paintOx(
  ctx: CanvasRenderingContext2D,
  camera: SideCamera,
  palette: Palette,
  ox: Ox,
  time: number,
  attention: number,
) {
  const unit = camera.scale;
  const { hide, shade: dark, horn, muzzle } = palette.ox;
  ctx.save();
  ctx.translate(camera.x(ox.x), camera.y(ox.y));
  ctx.scale(ox.facing, 1);
  if (!ox.alive) {
    paintFallenOx(ctx, unit, palette);
    ctx.restore();
    return;
  }
  const chew = Math.sin(time * 5.2 + ox.id) * 0.18 * (1 - attention);
  const swish = Math.sin(time * 1.6 + ox.id * 2) * 0.5;
  const headLift = attention * 1.6;

  // Far legs, a shade darker.
  ctx.fillStyle = shade(dark, -0.15);
  for (const legX of [-4.2, 3.1])
    ctx.fillRect(unit * (legX + 0.7), -unit * 3.4, unit * 1.1, unit * 3.4);

  // Tail with its tuft.
  ctx.strokeStyle = dark;
  ctx.lineWidth = Math.max(1, unit * 0.32);
  ctx.beginPath();
  ctx.moveTo(-unit * 5.6, -unit * 6.4);
  ctx.quadraticCurveTo(
    -unit * (6.6 + swish),
    -unit * 4.6,
    -unit * (6.1 + swish * 1.4),
    -unit * 2.6,
  );
  ctx.stroke();
  ctx.fillStyle = shade(dark, -0.3);
  ctx.beginPath();
  ctx.ellipse(
    -unit * (6.1 + swish * 1.4),
    -unit * 2.3,
    unit * 0.45,
    unit * 0.75,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  // The barrel of a body, darker underneath.
  const body = ctx.createLinearGradient(0, -unit * 8, 0, -unit * 2.6);
  body.addColorStop(0, shade(hide, 0.08));
  body.addColorStop(1, dark);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-unit * 5.8, -unit * 6.2);
  ctx.bezierCurveTo(-unit * 5.6, -unit * 8, unit * 1, -unit * 8.4, unit * 3.4, -unit * 7.6);
  ctx.bezierCurveTo(unit * 5.2, -unit * 7, unit * 5.4, -unit * 4, unit * 4.2, -unit * 3.1);
  ctx.bezierCurveTo(unit * 2, -unit * 2.4, -unit * 3.6, -unit * 2.4, -unit * 5.4, -unit * 3.4);
  ctx.closePath();
  ctx.fill();

  // Near legs.
  ctx.fillStyle = dark;
  for (const legX of [-4.6, 2.7]) {
    ctx.fillRect(unit * legX, -unit * 3.5, unit * 1.2, unit * 3.5);
    ctx.fillStyle = shade(dark, -0.4);
    ctx.fillRect(unit * legX, -unit * 0.5, unit * 1.2, unit * 0.5);
    ctx.fillStyle = dark;
  }

  // Head, low and heavy, raised a little to watch a plane go over.
  ctx.save();
  ctx.translate(unit * 4.4, -unit * 5.4);
  ctx.rotate(-headLift * 0.28);
  ctx.fillStyle = hide;
  ctx.beginPath();
  ctx.moveTo(-unit * 0.6, -unit * 1.8);
  ctx.bezierCurveTo(unit * 1.4, -unit * 2.4, unit * 3, -unit * 1.2, unit * 3.2, unit * 0.6);
  ctx.bezierCurveTo(unit * 3.2, unit * 1.8, unit * 1.4, unit * 2.2, unit * 0.2, unit * 1.4);
  ctx.closePath();
  ctx.fill();
  // The dewlap.
  ctx.fillStyle = shade(hide, -0.15);
  ctx.beginPath();
  ctx.moveTo(-unit * 0.4, unit * 0.4);
  ctx.quadraticCurveTo(unit * 0.4, unit * 2.6, unit * 1.4, unit * 1.6);
  ctx.lineTo(unit * 0.6, unit * 0.6);
  ctx.closePath();
  ctx.fill();
  // Pale muzzle with a chewing jaw.
  ctx.fillStyle = muzzle;
  ctx.beginPath();
  ctx.ellipse(unit * 2.75, unit * 0.9, unit * 0.95, unit * 0.8, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(muzzle, -0.2);
  ctx.beginPath();
  ctx.ellipse(unit * 2.35, unit * (1.65 + chew), unit * 0.75, unit * 0.32, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(dark, -0.5);
  ctx.beginPath();
  ctx.arc(unit * 3.25, unit * 0.65, unit * 0.18, 0, Math.PI * 2);
  ctx.fill();
  // Horns curving forward and up.
  ctx.strokeStyle = horn;
  ctx.lineWidth = Math.max(1.2, unit * 0.45);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(unit * 0.3, -unit * 1.7);
  ctx.quadraticCurveTo(unit * 1.6, -unit * 3.4, unit * 2.4, -unit * 2.9);
  ctx.stroke();
  ctx.strokeStyle = shade(horn, -0.5);
  ctx.lineWidth = Math.max(1, unit * 0.32);
  ctx.beginPath();
  ctx.moveTo(unit * 2.1, -unit * 3.05);
  ctx.lineTo(unit * 2.45, -unit * 2.88);
  ctx.stroke();
  ctx.lineCap = 'butt';
  // An ear sticking out sideways.
  ctx.fillStyle = shade(hide, -0.1);
  ctx.beginPath();
  ctx.ellipse(
    -unit * 0.4,
    -unit * 1.2,
    unit * 0.9,
    unit * 0.38,
    -0.5 + Math.sin(time * 0.9 + ox.id) * 0.15,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  // The eye: heavy-lidded, unless something is worth a look.
  const open = 0.25 + attention * 0.55;
  ctx.fillStyle = '#1c1612';
  ctx.beginPath();
  ctx.ellipse(unit * 1.45, -unit * 0.55, unit * 0.36, unit * 0.36 * open, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = shade(hide, -0.35);
  ctx.lineWidth = Math.max(0.8, unit * 0.2);
  ctx.beginPath();
  ctx.moveTo(unit * 1.0, -unit * (0.55 + 0.36 * open));
  ctx.lineTo(unit * 1.95, -unit * (0.6 + 0.36 * open));
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

function paintFallenOx(ctx: CanvasRenderingContext2D, unit: number, palette: Palette) {
  const { hide, shade: dark } = palette.ox;
  ctx.fillStyle = hide;
  ctx.beginPath();
  ctx.ellipse(0, -unit * 2.4, unit * 6, unit * 2.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = dark;
  ctx.lineWidth = Math.max(1.2, unit * 0.9);
  ctx.lineCap = 'round';
  for (const legX of [-3.5, -1.8, 1.6, 3.3]) {
    ctx.beginPath();
    ctx.moveTo(unit * legX, -unit * 4);
    ctx.lineTo(unit * (legX + 0.4), -unit * 7.2);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
  ctx.strokeStyle = '#1c1612';
  ctx.lineWidth = Math.max(1, unit * 0.25);
  const eyeX = unit * 5.4;
  const eyeY = -unit * 2.6;
  ctx.beginPath();
  ctx.moveTo(eyeX - unit * 0.4, eyeY - unit * 0.4);
  ctx.lineTo(eyeX + unit * 0.4, eyeY + unit * 0.4);
  ctx.moveTo(eyeX + unit * 0.4, eyeY - unit * 0.4);
  ctx.lineTo(eyeX - unit * 0.4, eyeY + unit * 0.4);
  ctx.stroke();
}

/** Where each bird of a flock sits around its middle, so the flock keeps its shape. */
const FLOCK_SHAPE: readonly [number, number][] = [
  [0, 0],
  [-3.4, 1.2],
  [3.1, 1.6],
  [-6.2, 2.6],
  [6, 2.9],
  [-1.6, -2.2],
  [2, -2.6],
];

export function paintFlock(
  ctx: CanvasRenderingContext2D,
  camera: SideCamera,
  palette: Palette,
  flock: Flock,
  time: number,
) {
  FLOCK_SHAPE.forEach(([dx, dy], index) => {
    const bob = Math.sin(time * 3 + index * 1.7) * 0.6;
    paintBirdShape(
      ctx,
      camera.x(flock.x + dx),
      camera.y(flock.y + dy + bob),
      camera.scale * 0.9,
      palette.bird,
      time * 9 + index * 1.3,
    );
  });
}

export function paintBird(
  ctx: CanvasRenderingContext2D,
  camera: SideCamera,
  palette: Palette,
  bird: Bird,
  time: number,
) {
  paintBirdShape(
    ctx,
    camera.x(bird.x),
    camera.y(bird.y),
    camera.scale * 1.1,
    palette.bird,
    time * 11 + bird.id,
  );
}

/** A bird in flight: two wings that beat, a body between them. */
function paintBirdShape(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  unit: number,
  colour: string,
  phase: number,
) {
  const beat = Math.sin(phase);
  ctx.strokeStyle = colour;
  ctx.lineWidth = Math.max(1, unit * 0.36);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - unit * 1.6, y - unit * beat * 1.1);
  ctx.quadraticCurveTo(x - unit * 0.8, y - unit * (0.4 + beat * 0.6), x, y);
  ctx.quadraticCurveTo(
    x + unit * 0.8,
    y - unit * (0.4 + beat * 0.6),
    x + unit * 1.6,
    y - unit * beat * 1.1,
  );
  ctx.stroke();
  ctx.lineCap = 'butt';
}
