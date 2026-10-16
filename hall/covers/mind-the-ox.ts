import { createRng } from '@shared/rng';
import { defineCover } from '../src/cover-api';

/**
 * Mind the Ox's animated cover: a summer morning over the Western Front in
 * gouache. A biplane loops lazily over the fields, drops a bomb on a fuel
 * depot that goes up in a fat orange bloom, and below it all an ox goes on
 * chewing, unimpressed. Drawn in its own 160 × 120 space and scaled to fit.
 */
const WIDTH = 160;
const HEIGHT = 120;
const GROUND = 92;
const LOOP_SECONDS = 7;

export default defineCover({
  posterTime: LOOP_SECONDS * 0.5,
  create({ seed }) {
    const rng = createRng(seed);
    const hills = Array.from({ length: 10 }, () => rng.float(6, 16));
    const clouds = Array.from({ length: 4 }, (_, index) => ({
      x: index * 46 + rng.float(0, 20),
      y: rng.float(12, 40),
      size: rng.float(0.7, 1.2),
    }));
    return {
      draw(ctx, { width, height, time, energy }) {
        ctx.save();
        ctx.scale(width / WIDTH, height / HEIGHT);
        const clock = (time * (0.85 + energy * 0.4)) % LOOP_SECONDS;
        drawSky(ctx, clouds, time);
        drawHills(ctx, hills);
        drawField(ctx);
        drawDepot(ctx, clock);
        drawOx(ctx, time);
        drawPlane(ctx, clock);
        ctx.restore();
      },
    };
  },
});

function drawSky(
  ctx: CanvasRenderingContext2D,
  clouds: { x: number; y: number; size: number }[],
  time: number,
) {
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
  sky.addColorStop(0, '#6fa8d6');
  sky.addColorStop(0.7, '#a9d1ea');
  sky.addColorStop(1, '#f4e7c8');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, GROUND);
  const sun = ctx.createRadialGradient(126, 22, 2, 126, 22, 30);
  sun.addColorStop(0, 'rgba(255, 246, 216, 1)');
  sun.addColorStop(0.3, 'rgba(255, 240, 190, 0.7)');
  sun.addColorStop(1, 'rgba(255, 236, 170, 0)');
  ctx.fillStyle = sun;
  ctx.fillRect(90, 0, 70, 60);
  for (const cloud of clouds) {
    const x = ((cloud.x + time * 2) % (WIDTH + 40)) - 20;
    for (const [dx, dy, radius] of [
      [0, 0, 7],
      [7, -3, 8],
      [15, 0, 6],
      [8, 2, 7],
    ] as const) {
      ctx.fillStyle = '#c9d6e3';
      ctx.beginPath();
      ctx.arc(
        x + dx * cloud.size,
        cloud.y + dy * cloud.size + 1.5,
        radius * cloud.size,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.fillStyle = '#fffdf6';
      ctx.beginPath();
      ctx.arc(
        x + dx * cloud.size,
        cloud.y + dy * cloud.size,
        radius * cloud.size * 0.92,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
}

function drawHills(ctx: CanvasRenderingContext2D, hills: number[]) {
  ctx.fillStyle = '#9fb6c2';
  ctx.beginPath();
  ctx.moveTo(0, GROUND);
  hills.forEach((height, index) =>
    ctx.lineTo((index / (hills.length - 1)) * WIDTH, GROUND - 14 - height),
  );
  ctx.lineTo(WIDTH, GROUND);
  ctx.fill();
  ctx.fillStyle = '#8fa77a';
  ctx.beginPath();
  ctx.moveTo(0, GROUND);
  hills.forEach((height, index) =>
    ctx.lineTo((index / (hills.length - 1)) * WIDTH, GROUND - 4 - height * 0.5),
  );
  ctx.lineTo(WIDTH, GROUND);
  ctx.fill();
}

function drawField(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#a9bf62';
  ctx.fillRect(0, GROUND - 4, WIDTH, 8);
  ctx.fillStyle = '#7f9a45';
  ctx.fillRect(0, GROUND + 3, WIDTH, 2);
  const soil = ctx.createLinearGradient(0, GROUND + 4, 0, HEIGHT);
  soil.addColorStop(0, '#8a6a45');
  soil.addColorStop(1, '#5f4630');
  ctx.fillStyle = soil;
  ctx.fillRect(0, GROUND + 4, WIDTH, HEIGHT - GROUND);
  ctx.strokeStyle = 'rgba(60, 40, 24, 0.35)';
  ctx.lineWidth = 0.6;
  for (const y of [GROUND + 12, GROUND + 20]) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(50, y - 2, 110, y + 3, WIDTH, y);
    ctx.stroke();
  }
}

/** The depot on the right: standing, then blooming orange after the bomb lands, then burning. */
function drawDepot(ctx: CanvasRenderingContext2D, clock: number) {
  const x = 118;
  const hit = clock > 3.9;
  if (!hit) {
    ctx.fillStyle = '#9a9c96';
    ctx.fillRect(x - 6, GROUND - 13, 10, 10);
    ctx.fillStyle = '#c4c6c0';
    ctx.fillRect(x - 6, GROUND - 13, 4, 10);
    ctx.fillStyle = '#c8412f';
    ctx.fillRect(x - 6, GROUND - 9, 10, 1.6);
    ctx.fillStyle = '#7d7f7a';
    ctx.fillRect(x + 5, GROUND - 6, 3, 3);
    return;
  }
  const age = clock - 3.9;
  ctx.fillStyle = '#3a2e25';
  ctx.beginPath();
  ctx.ellipse(x - 1, GROUND - 3, 9, 2, 0, Math.PI, 0);
  ctx.fill();
  const bloom = Math.min(1, age * 3);
  const fade = Math.max(0, 1 - age / 2.2);
  if (fade > 0) {
    const fire = ctx.createRadialGradient(x - 1, GROUND - 8, 0, x - 1, GROUND - 8, 16 * bloom);
    fire.addColorStop(0, `rgba(255, 243, 192, ${fade})`);
    fire.addColorStop(0.45, `rgba(255, 154, 60, ${fade * 0.9})`);
    fire.addColorStop(1, 'rgba(200, 65, 47, 0)');
    ctx.fillStyle = fire;
    ctx.beginPath();
    ctx.arc(x - 1, GROUND - 8, 16 * bloom, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let puff = 0; puff < 5; puff++) {
    const rise = (age * 0.6 + puff * 0.2) % 1;
    ctx.fillStyle = `rgba(70, 64, 60, ${0.5 * (1 - rise)})`;
    ctx.beginPath();
    ctx.arc(x - 2 + rise * 6, GROUND - 10 - rise * 26, 3 + rise * 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** The ox, side on, head down, chewing; it looks up when the depot goes. */
function drawOx(ctx: CanvasRenderingContext2D, time: number) {
  const x = 40;
  const y = GROUND - 2;
  const chew = Math.sin(time * 5) * 0.4;
  ctx.fillStyle = '#7a5234';
  ctx.fillRect(x - 6, y - 4, 2, 4);
  ctx.fillRect(x + 4, y - 4, 2, 4);
  ctx.fillStyle = '#a8784e';
  ctx.beginPath();
  ctx.ellipse(x, y - 7, 9, 4.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + 10, y - 4 + chew, 3.4, 2.6, 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d8b28c';
  ctx.beginPath();
  ctx.ellipse(x + 12.5, y - 2.4 + chew, 1.6, 1.3, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#efe3c4';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 9, y - 6.5);
  ctx.lineTo(x + 11, y - 9.5);
  ctx.stroke();
  ctx.strokeStyle = '#7a5234';
  ctx.beginPath();
  ctx.moveTo(x - 9, y - 7);
  ctx.quadraticCurveTo(x - 12, y - 4 + Math.sin(time * 1.7), x - 11, y - 1);
  ctx.stroke();
}

/** The biplane: in from the left, over the depot, bomb away, then a climbing turn into the sun. */
function drawPlane(ctx: CanvasRenderingContext2D, clock: number) {
  const t = clock / LOOP_SECONDS;
  const x = -20 + t * 200;
  const climb = Math.max(0, (clock - 3.6) / 3.4);
  const y = 50 - climb * climb * 34 + Math.sin(clock * 1.4) * 2;
  const pitch = -0.08 - climb * 0.5;
  if (clock > 3.1 && clock < 3.9) {
    // The bomb, arcing down onto the depot.
    const fall = (clock - 3.1) / 0.8;
    ctx.fillStyle = '#4f514d';
    ctx.beginPath();
    ctx.ellipse(96 + fall * 22, 56 + fall * fall * 30, 1.6, 0.8, 0.8 * fall, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(pitch);
  ctx.fillStyle = '#4e4b2b';
  ctx.fillRect(-9, 3, 16, 2.2);
  ctx.fillStyle = '#6f6b3e';
  ctx.beginPath();
  ctx.moveTo(-12, 0);
  ctx.lineTo(6, -1.5);
  ctx.lineTo(8, 0.5);
  ctx.lineTo(6, 2.5);
  ctx.lineTo(-12, 1.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(-14, -3, 3, 4);
  ctx.fillRect(-9, -4.5, 16, 2.2);
  ctx.fillStyle = '#6b4a2b';
  ctx.fillRect(-4, -2.4, 0.8, 5.6);
  ctx.fillRect(2, -2.4, 0.8, 5.6);
  ctx.fillStyle = '#b9b6ad';
  ctx.fillRect(6, -1.6, 2.4, 3.6);
  ctx.fillStyle = 'rgba(70, 58, 46, 0.3)';
  ctx.beginPath();
  ctx.ellipse(9.2, 0.2, 0.8, 4.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#27408b';
  ctx.beginPath();
  ctx.arc(-6, 0.5, 1.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f4efe2';
  ctx.beginPath();
  ctx.arc(-6, 0.5, 0.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#b8282e';
  ctx.beginPath();
  ctx.arc(-6, 0.5, 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#f4efe2';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-1, -2.4);
  ctx.quadraticCurveTo(-4, -3 + Math.sin(clock * 12) * 0.6, -7, -2.2);
  ctx.stroke();
  ctx.restore();
}
