import { createRng } from '@shared/rng';
import { defineCover } from '../src/cover-api';

/**
 * Donkey Dash's animated cover: a country road at golden hour, seen from
 * behind a little orange hatchback. Donkeys trot over the crest of the hill
 * one after another, and the car hops lanes to miss each one. Drawn in its
 * own 160 × 120 space and scaled to fit.
 */
const WIDTH = 160;
const HEIGHT = 120;
const HORIZON = 52;
const DONKEY_SECONDS = 1.6;

export default defineCover({
  posterTime: DONKEY_SECONDS * 0.62,
  create({ seed }) {
    const rng = createRng(seed);
    const lanes = Array.from({ length: 32 }, () => (rng.chance(0.5) ? -1 : 1));
    const hills = Array.from({ length: 9 }, () => rng.float(4, 12));

    return {
      draw(ctx, { width, height, time, energy }) {
        ctx.save();
        ctx.scale(width / WIDTH, height / HEIGHT);
        drawSky(ctx, hills);
        const pace = 0.8 + energy * 0.5;
        const clock = time * pace;
        const index = Math.floor(clock / DONKEY_SECONDS);
        const t = (clock % DONKEY_SECONDS) / DONKEY_SECONDS;
        drawRoad(ctx, clock * 30);
        const donkeyLane = lanes[index % lanes.length] ?? 1;
        // The car moves into the other lane just in time.
        const carLane =
          t > 0.45 ? -donkeyLane : (lanes[(index + lanes.length - 1) % lanes.length] ?? 1) * -1;
        drawDonkey(ctx, donkeyLane, t, time);
        drawCar(ctx, carLane, t, time);
        ctx.restore();
      },
    };
  },
});

function drawSky(ctx: CanvasRenderingContext2D, hills: number[]) {
  const sky = ctx.createLinearGradient(0, 0, 0, HORIZON);
  sky.addColorStop(0, '#3b3a78');
  sky.addColorStop(0.6, '#e0806a');
  sky.addColorStop(1, '#ffd08a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HORIZON + 1);
  const sun = ctx.createRadialGradient(92, HORIZON - 6, 2, 92, HORIZON - 6, 40);
  sun.addColorStop(0, 'rgba(255, 220, 150, 0.9)');
  sun.addColorStop(1, 'rgba(255, 190, 110, 0)');
  ctx.fillStyle = sun;
  ctx.fillRect(40, 0, 110, HORIZON);
  ctx.fillStyle = '#fff1c4';
  ctx.beginPath();
  ctx.arc(92, HORIZON - 4, 9, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#8a6c8e';
  ctx.beginPath();
  ctx.moveTo(0, HORIZON);
  hills.forEach((rise, index) => ctx.lineTo((index * WIDTH) / (hills.length - 1), HORIZON - rise));
  ctx.lineTo(WIDTH, HORIZON);
  ctx.fill();
}

function drawRoad(ctx: CanvasRenderingContext2D, scroll: number) {
  ctx.fillStyle = '#8fa546';
  ctx.fillRect(0, HORIZON, WIDTH, HEIGHT - HORIZON);
  for (let band = 0; band < 8; band++) {
    const y = HORIZON + ((band * 9 + scroll * 0.4) % 72);
    ctx.fillStyle = 'rgba(181, 195, 90, 0.45)';
    ctx.fillRect(0, y, WIDTH, 2 + (y - HORIZON) * 0.06);
  }
  const road = (half: number, colour: string) => {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(80 - half * 0.12, HORIZON);
    ctx.lineTo(80 + half * 0.12, HORIZON);
    ctx.lineTo(80 + half, HEIGHT);
    ctx.lineTo(80 - half, HEIGHT);
    ctx.closePath();
    ctx.fill();
  };
  road(74, '#c9a26a');
  road(62, '#4a4252');
  ctx.fillStyle = '#ffd978';
  for (let dash = 0; dash < 6; dash++) {
    const d = ((dash + scroll * 0.05) % 6) / 6;
    const y0 = HORIZON + d * d * (HEIGHT - HORIZON);
    const y1 = HORIZON + Math.min(1, d + 0.06) ** 2 * (HEIGHT - HORIZON);
    const w = 0.4 + d * 1.6;
    ctx.fillRect(80 - w / 2, y0, w, y1 - y0);
  }
}

/** Where a spot `depth` (0 at the crest, 1 by the car) sits across the road. */
function laneX(lane: number, depth: number): number {
  return 80 + lane * (4 + depth * 30);
}

function drawDonkey(ctx: CanvasRenderingContext2D, lane: number, t: number, time: number) {
  const depth = t * t;
  const x = laneX(lane, depth);
  const y = HORIZON + 2 + depth * 58;
  const size = 3 + depth * 20;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 10, size / 10);
  ctx.fillStyle = 'rgba(60, 30, 50, 0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 8, 1.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#3d3a40';
  ctx.lineWidth = 1.2;
  for (const leg of [-4, -2.5, 3, 4.5]) {
    ctx.beginPath();
    ctx.moveTo(leg, -7);
    ctx.lineTo(leg, 0);
    ctx.stroke();
  }
  ctx.fillStyle = '#8c8a8f';
  ctx.beginPath();
  ctx.ellipse(0, -9, 6.5, 3.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(4, -10);
  ctx.lineTo(7, -15);
  ctx.lineTo(10, -13);
  ctx.lineTo(7, -8);
  ctx.fill();
  const flick = Math.sin(time * 5) > 0.8 ? 1.5 : 0;
  ctx.fillRect(6.4, -20 - flick, 1.1, 5);
  ctx.fillRect(8, -19, 1.1, 4.5);
  ctx.fillStyle = '#d9d3cc';
  ctx.beginPath();
  ctx.ellipse(9.4, -12.4, 1.6, 1.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCar(ctx: CanvasRenderingContext2D, lane: number, t: number, time: number) {
  const x = laneX(lane, 1) * 0.7 + 80 * 0.3;
  const bounce = Math.abs(Math.sin(time * 9)) * 0.5;
  const lean = t > 0.45 && t < 0.55 ? lane * 0.08 : 0;
  ctx.save();
  ctx.translate(x, 113 - bounce);
  ctx.rotate(lean);
  ctx.fillStyle = 'rgba(40, 20, 30, 0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 4, 17, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1d1a20';
  ctx.fillRect(-14, -2, 6, 6);
  ctx.fillRect(8, -2, 6, 6);
  ctx.fillStyle = '#ff7a3d';
  ctx.beginPath();
  ctx.roundRect(-15, -14, 30, 14, 4);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-11, -14);
  ctx.lineTo(-8, -22);
  ctx.lineTo(8, -22);
  ctx.lineTo(11, -14);
  ctx.fill();
  ctx.fillStyle = '#26324a';
  ctx.beginPath();
  ctx.moveTo(-9, -15);
  ctx.lineTo(-7, -20.5);
  ctx.lineTo(7, -20.5);
  ctx.lineTo(9, -15);
  ctx.fill();
  ctx.fillStyle = '#ff4d4d';
  ctx.fillRect(-13, -11, 5, 3);
  ctx.fillRect(8, -11, 5, 3);
  ctx.restore();
}
