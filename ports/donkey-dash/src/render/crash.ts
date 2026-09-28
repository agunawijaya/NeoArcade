import type { Box, Viewport } from './view';

/**
 * The signature moment, as in 1981: car and donkey split down the middle
 * and the four halves fly off towards the corners of the screen, the car's
 * to the bottom, the donkey's to the top. The original moved them in seven
 * steps, each covering 1/64, 1/32 … 1/1 of what was left; here the same
 * accelerating curve runs smoothly, after a slow-motion beat, with a spin,
 * a comic BOOM! and hay in the air. Nobody is hurt: it is a cartoon.
 */
export interface CrashActor {
  box: Box;
  /** Draws the actor exactly where it stood, in screen coordinates. */
  draw(ctx: CanvasRenderingContext2D): void;
}

/** A still, slow-motion moment before the halves fly. */
export const SPLIT_DELAY = 0.18;
export const FLIGHT_SECONDS = 1.3;

/** How far along its flight a half is: the original's doubling steps, made continuous. */
export function flightProgress(age: number): number {
  const t = Math.min(1, Math.max(0, (age - SPLIT_DELAY) / FLIGHT_SECONDS));
  if (t === 0) return 0;
  return Math.max(0, (2 ** (10 * (t - 1)) - 1 / 1024) / (1 - 1 / 1024));
}

export function drawCrash(
  ctx: CanvasRenderingContext2D,
  age: number,
  viewport: Viewport,
  car: CrashActor,
  donkey: CrashActor,
  reducedMotion: boolean,
) {
  const progress = flightProgress(age);
  const { width, height } = viewport;
  const halves: [CrashActor, 'left' | 'right', number, number][] = [
    [donkey, 'left', 0, 0],
    [donkey, 'right', width, 0],
    [car, 'left', 0, height],
    [car, 'right', width, height],
  ];
  for (const [actor, side, cornerX, cornerY] of halves) {
    drawHalf(ctx, actor, side, cornerX, cornerY, progress, age, reducedMotion);
  }
  const impact = {
    x: (car.box.x + car.box.width / 2 + donkey.box.x + donkey.box.width / 2) / 2,
    y: Math.min(car.box.y, donkey.box.y + donkey.box.height),
  };
  if (age >= 0 && age < 0.2)
    drawFlash(ctx, impact.x, impact.y, 1 - age / 0.2, Math.max(width, height) * 0.25);
  // The BOOM! floats above the pile-up: the torn donkey is the joke, so it stays in sight.
  const size = Math.max(36, Math.min(width, height) * 0.11);
  const above = Math.min(car.box.y, donkey.box.y) - size * 1.2;
  const boomY = Math.max(viewport.insetTop + size * 1.2, above);
  drawBoom(ctx, impact.x, boomY, size, age, reducedMotion);
}

function drawHalf(
  ctx: CanvasRenderingContext2D,
  actor: CrashActor,
  side: 'left' | 'right',
  cornerX: number,
  cornerY: number,
  progress: number,
  age: number,
  reducedMotion: boolean,
) {
  const { box } = actor;
  const middle = box.x + box.width / 2;
  const halfX = side === 'left' ? box.x + box.width / 4 : box.x + (box.width * 3) / 4;
  const halfY = box.y + box.height / 2;
  // Past the corner, so the half leaves the screen entirely.
  const size = Math.max(box.width, box.height);
  const awayX = cornerX + Math.sign(cornerX - halfX || (side === 'left' ? -1 : 1)) * size;
  const awayY = cornerY + Math.sign(cornerY - halfY || -1) * size;
  // Before the flight the halves only just part, as if in slow motion.
  const part = Math.min(1, age / SPLIT_DELAY) * box.width * 0.06 * (side === 'left' ? -1 : 1);
  const x = halfX + part + (awayX - halfX) * progress;
  const y = halfY + (awayY - halfY) * progress;
  const spin = reducedMotion ? 0 : (side === 'left' ? -1 : 1) * progress * Math.PI * 2.5;

  ctx.save();
  if (reducedMotion) ctx.globalAlpha = 1 - progress;
  ctx.translate(x, y);
  ctx.rotate(spin);
  ctx.translate(-halfX, -halfY);
  ctx.beginPath();
  tornEdge(ctx, box, middle, side);
  ctx.clip();
  actor.draw(ctx);
  ctx.restore();
}

/** The clip for one half, split along a jagged tear rather than a clean line. */
function tornEdge(ctx: CanvasRenderingContext2D, box: Box, middle: number, side: 'left' | 'right') {
  const teeth = 6;
  const bite = box.width * 0.05;
  const outer = side === 'left' ? box.x - box.width : box.x + box.width * 2;
  ctx.moveTo(outer, box.y - box.height);
  for (let tooth = 0; tooth <= teeth; tooth++) {
    const y = box.y - box.height * 0.2 + ((box.height * 1.4) / teeth) * tooth;
    ctx.lineTo(middle + (tooth % 2 === 0 ? -bite : bite), y);
  }
  ctx.lineTo(middle, box.y + box.height * 2);
  ctx.lineTo(outer, box.y + box.height * 2);
  ctx.closePath();
}

function drawFlash(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  strength: number,
  radius: number,
) {
  const flash = ctx.createRadialGradient(x, y, 0, x, y, radius);
  flash.addColorStop(0, `rgba(255, 255, 240, ${0.9 * strength})`);
  flash.addColorStop(1, 'rgba(255, 255, 240, 0)');
  ctx.fillStyle = flash;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function drawBoom(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  baseSize: number,
  age: number,
  reducedMotion: boolean,
) {
  const fade = age < 1.9 ? 1 : Math.max(0, 1 - (age - 1.9) / 0.4);
  if (fade <= 0) return;
  const pop = reducedMotion
    ? 1
    : age < 0.14
      ? (age / 0.14) * 1.25
      : 1 + 0.25 * Math.exp(-(age - 0.14) * 6);
  const size = baseSize * pop;
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.translate(x, y);
  ctx.rotate(-0.08);
  // The comic burst behind the word.
  ctx.beginPath();
  const spikes = 14;
  for (let point = 0; point < spikes * 2; point++) {
    const radius = (point % 2 === 0 ? 1.45 : 1.05) * size;
    const angle = (point * Math.PI) / spikes;
    ctx.lineTo(Math.cos(angle) * radius * 1.25, Math.sin(angle) * radius * 0.8);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffd23f';
  ctx.fill();
  ctx.lineWidth = Math.max(3, size * 0.07);
  ctx.strokeStyle = '#2a1400';
  ctx.stroke();
  ctx.font = `900 ${size}px "Arial Black", "Segoe UI Black", Impact, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(4, size * 0.16);
  ctx.strokeStyle = '#2a1400';
  ctx.strokeText('BOOM!', 0, size * 0.04);
  ctx.fillStyle = '#ff4d2e';
  ctx.fillText('BOOM!', 0, size * 0.04);
  ctx.restore();
}
