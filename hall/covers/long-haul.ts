import { createRng } from '@shared/rng';
import { defineCover } from '../src/cover-api';

/**
 * Long Haul's animated cover: a rig rolling east across the desert at
 * sunset, mesas sliding by behind it, mileposts and a green highway sign
 * counting down to New York. Hover and it picks up speed and the
 * headlights come on. Drawn in its own 160 × 120 space and scaled to fit.
 */
const WIDTH = 160;
const HEIGHT = 120;
const HORIZON = 70;
const ROAD_TOP = 88;
const ROAD_BOTTOM = 104;
const SIGN_GAP = 260;

export default defineCover({
  posterTime: 3.2,
  create({ seed, accent }) {
    const rng = createRng(seed);
    const mesas = Array.from({ length: 6 }, (_, index) => ({
      x: index * 70 + rng.float(0, 30),
      width: rng.float(26, 48),
      height: rng.float(8, 18),
    }));
    const shrubs = Array.from({ length: 14 }, () => ({
      x: rng.float(0, 320),
      y: rng.float(HORIZON + 4, ROAD_TOP - 2),
    }));
    const stars = Array.from({ length: 18 }, () => ({
      x: rng.float(0, WIDTH),
      y: rng.float(2, 34),
    }));

    return {
      draw(ctx, { width, height, time, energy }) {
        ctx.save();
        ctx.scale(width / WIDTH, height / HEIGHT);
        const travelled = time * (34 + energy * 40);
        drawSky(ctx, stars, energy);
        drawMesas(ctx, mesas, travelled * 0.15);
        drawGround(ctx, shrubs, travelled * 0.5);
        drawRoad(ctx, travelled);
        drawSign(ctx, travelled, accent);
        drawRig(ctx, time, energy);
        ctx.restore();
      },
    };
  },
});

function drawSky(ctx: CanvasRenderingContext2D, stars: { x: number; y: number }[], energy: number) {
  const sky = ctx.createLinearGradient(0, 0, 0, HORIZON);
  sky.addColorStop(0, '#1d2453');
  sky.addColorStop(0.55, '#b4566a');
  sky.addColorStop(1, '#ffb768');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HORIZON + 1);
  ctx.fillStyle = `rgba(255, 246, 220, ${0.35 + energy * 0.4})`;
  for (const star of stars) ctx.fillRect(star.x, star.y, 0.8, 0.8);
  const sun = ctx.createRadialGradient(118, HORIZON - 4, 2, 118, HORIZON - 4, 34);
  sun.addColorStop(0, 'rgba(255, 228, 160, 0.95)');
  sun.addColorStop(1, 'rgba(255, 170, 100, 0)');
  ctx.fillStyle = sun;
  ctx.fillRect(70, 20, 90, HORIZON - 20);
  ctx.fillStyle = '#ffe7b0';
  ctx.beginPath();
  ctx.arc(118, HORIZON - 2, 8, Math.PI, 0);
  ctx.fill();
}

function drawMesas(
  ctx: CanvasRenderingContext2D,
  mesas: { x: number; width: number; height: number }[],
  scroll: number,
) {
  ctx.fillStyle = '#7c3f4a';
  for (const mesa of mesas) {
    const x = ((((mesa.x - scroll) % 420) + 420) % 420) - 60;
    ctx.beginPath();
    ctx.moveTo(x, HORIZON);
    ctx.lineTo(x + 5, HORIZON - mesa.height);
    ctx.lineTo(x + mesa.width - 5, HORIZON - mesa.height);
    ctx.lineTo(x + mesa.width, HORIZON);
    ctx.fill();
  }
}

function drawGround(
  ctx: CanvasRenderingContext2D,
  shrubs: { x: number; y: number }[],
  scroll: number,
) {
  const ground = ctx.createLinearGradient(0, HORIZON, 0, ROAD_TOP);
  ground.addColorStop(0, '#c98a5a');
  ground.addColorStop(1, '#a8673f');
  ctx.fillStyle = ground;
  ctx.fillRect(0, HORIZON, WIDTH, HEIGHT - HORIZON);
  ctx.fillStyle = '#5f6b3a';
  for (const shrub of shrubs) {
    const x = ((((shrub.x - scroll * (0.6 + (shrub.y - HORIZON) / 40)) % 320) + 320) % 320) - 20;
    ctx.beginPath();
    ctx.ellipse(x, shrub.y, 2.4, 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#8b5534';
  ctx.fillRect(0, ROAD_BOTTOM, WIDTH, HEIGHT - ROAD_BOTTOM);
}

function drawRoad(ctx: CanvasRenderingContext2D, scroll: number) {
  ctx.fillStyle = '#34343c';
  ctx.fillRect(0, ROAD_TOP, WIDTH, ROAD_BOTTOM - ROAD_TOP);
  ctx.fillStyle = '#e8dfc7';
  ctx.fillRect(0, ROAD_BOTTOM - 1, WIDTH, 0.7);
  ctx.fillStyle = '#f2c14e';
  for (let x = -(scroll % 24); x < WIDTH; x += 24)
    ctx.fillRect(x, (ROAD_TOP + ROAD_BOTTOM) / 2, 12, 0.9);
}

/** A green sign every so often, counting down the miles to New York. */
function drawSign(ctx: CanvasRenderingContext2D, scroll: number, accent: string) {
  const index = Math.floor(scroll / SIGN_GAP);
  const x = WIDTH + 20 - (scroll % SIGN_GAP);
  const miles = Math.max(10, 2850 - index * 190);
  ctx.fillStyle = '#6b6f75';
  ctx.fillRect(x + 4, ROAD_TOP - 30, 1.2, 30);
  ctx.fillRect(x + 30, ROAD_TOP - 30, 1.2, 30);
  ctx.fillStyle = '#1d7a46';
  ctx.beginPath();
  ctx.roundRect(x, ROAD_TOP - 46, 36, 18, 2);
  ctx.fill();
  ctx.strokeStyle = '#f6f4ea';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.roundRect(x + 1, ROAD_TOP - 45, 34, 16, 1.5);
  ctx.stroke();
  ctx.fillStyle = '#f6f4ea';
  ctx.font = '700 5px "Arial Narrow", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('New York', x + 18, ROAD_TOP - 40);
  ctx.fillStyle = accent;
  ctx.fillText(miles.toLocaleString('en-US'), x + 18, ROAD_TOP - 33.5);
}

/** A long-nose conventional with a reefer trailer, rolling. */
function drawRig(ctx: CanvasRenderingContext2D, time: number, energy: number) {
  const ground = ROAD_BOTTOM - 4;
  const bob = Math.sin(time * 14) * 0.25;
  ctx.save();
  ctx.translate(20, ground + bob);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.ellipse(46, 2.5, 50, 1.6, 0, 0, Math.PI * 2);
  ctx.fill();
  // Trailer.
  ctx.fillStyle = '#e9e6dc';
  ctx.fillRect(0, -21, 62, 17);
  ctx.fillStyle = '#c8312a';
  ctx.fillRect(0, -9, 62, 2);
  ctx.fillStyle = '#f2c14e';
  ctx.fillRect(0, -6.6, 62, 0.8);
  ctx.fillStyle = '#c8312a';
  ctx.font = 'italic 700 6px "Arial Narrow", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('LONG HAUL', 31, -15);
  // Tractor: sleeper, cab, long hood.
  ctx.fillStyle = '#b8312a';
  ctx.fillRect(64, -20, 8, 16);
  ctx.fillRect(72, -17, 8, 13);
  ctx.beginPath();
  ctx.moveTo(80, -11);
  ctx.lineTo(93, -10);
  ctx.quadraticCurveTo(96, -9, 96, -6);
  ctx.lineTo(96, -4);
  ctx.lineTo(80, -4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#9fc2d8';
  ctx.fillRect(74, -15.5, 5, 4);
  ctx.fillStyle = '#d9dde2';
  ctx.fillRect(70.5, -27, 1, 23);
  ctx.fillStyle = '#f2c14e';
  ctx.fillRect(64, -8, 32, 0.9);
  // Wheels.
  ctx.fillStyle = '#17181b';
  for (const axle of [7, 12.5, 66, 71.5, 91]) {
    ctx.beginPath();
    ctx.arc(axle, -2, 2.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#9aa0a6';
  for (const axle of [7, 12.5, 66, 71.5, 91]) {
    ctx.beginPath();
    ctx.arc(axle, -2, 1, 0, Math.PI * 2);
    ctx.fill();
  }
  // Headlights, brighter as the cover wakes up.
  const beam = ctx.createLinearGradient(96, -6, 150, -6);
  beam.addColorStop(0, `rgba(255, 240, 200, ${0.25 + energy * 0.5})`);
  beam.addColorStop(1, 'rgba(255, 240, 200, 0)');
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(96, -6.5);
  ctx.lineTo(150, -12);
  ctx.lineTo(150, 4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(95, -7, 1.2, 1.4);
  ctx.restore();
}
