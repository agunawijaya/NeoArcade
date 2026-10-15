import { createRng } from '@shared/rng';
import { defineCover } from '../src/cover-api';

/**
 * Flight 312's animated cover: the jumbo seen from behind on short final
 * at dawn, just out of the overcast, the approach lights' rabbit running
 * up to a runway that waits in perspective. Hover and the landing lights
 * come on and the runway draws closer. Drawn in its own 160 × 120 space
 * and scaled to fit.
 */
const WIDTH = 160;
const HEIGHT = 120;
const HORIZON = 62;
const VANISH = { x: 80, y: HORIZON };

export default defineCover({
  posterTime: 1.3,
  create({ seed, accent }) {
    const rng = createRng(seed);
    const cloud = Array.from({ length: 22 }, () => ({
      x: rng.float(-20, WIDTH + 20),
      y: rng.float(4, 30),
      width: rng.float(26, 60),
      height: rng.float(4, 9),
      drift: rng.float(1.5, 4),
    }));
    const fields = Array.from({ length: 30 }, () => ({
      x: rng.float(-1, 1),
      depth: rng.float(0.05, 1),
      shade: rng.float(0, 1),
    }));

    return {
      draw(ctx, { width, height, time, energy, reducedMotion }) {
        ctx.save();
        ctx.scale(width / WIDTH, height / HEIGHT);
        const t = reducedMotion ? 1.3 : time;
        drawSky(ctx);
        drawGround(ctx, fields);
        drawRunway(ctx, t, energy);
        drawCloudDeck(ctx, cloud, t);
        drawJumbo(ctx, t, energy, accent);
        ctx.restore();
      },
    };
  },
});

function drawSky(ctx: CanvasRenderingContext2D) {
  const sky = ctx.createLinearGradient(0, 0, 0, HORIZON);
  sky.addColorStop(0, '#2c3f68');
  sky.addColorStop(0.55, '#7b6f8a');
  sky.addColorStop(1, '#f0a26a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HORIZON);
  const sun = ctx.createRadialGradient(118, HORIZON, 0, 118, HORIZON, 40);
  sun.addColorStop(0, 'rgba(255, 214, 150, 0.9)');
  sun.addColorStop(1, 'rgba(255, 214, 150, 0)');
  ctx.fillStyle = sun;
  ctx.fillRect(70, HORIZON - 40, 90, 40);
}

function drawGround(
  ctx: CanvasRenderingContext2D,
  fields: { x: number; depth: number; shade: number }[],
) {
  const ground = ctx.createLinearGradient(0, HORIZON, 0, HEIGHT);
  ground.addColorStop(0, '#4b4a48');
  ground.addColorStop(1, '#2a2b2a');
  ctx.fillStyle = ground;
  ctx.fillRect(0, HORIZON, WIDTH, HEIGHT - HORIZON);
  // Snowy fields in perspective, lighter toward the haze.
  for (const field of fields) {
    const y = HORIZON + (HEIGHT - HORIZON) * field.depth ** 1.6;
    const spread = 6 + 180 * field.depth;
    const x = VANISH.x + field.x * spread;
    ctx.fillStyle = `rgba(${200 + field.shade * 40}, ${205 + field.shade * 35}, ${215 + field.shade * 30}, ${0.12 + 0.18 * (1 - field.depth)})`;
    ctx.fillRect(x, y, 4 + 30 * field.depth, 1 + 4 * field.depth);
  }
  const haze = ctx.createLinearGradient(0, HORIZON, 0, HORIZON + 10);
  haze.addColorStop(0, 'rgba(240, 170, 120, 0.55)');
  haze.addColorStop(1, 'rgba(240, 170, 120, 0)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, HORIZON, WIDTH, 10);
}

/** A point on the runway's centreline, `along` from 0 (far) to 1 (near), and `across` from −1 to 1. */
function onRunway(along: number, across: number): [number, number] {
  const y = HORIZON + 4 + along * along * 46;
  const halfWidth = 2 + along * along * 26;
  return [VANISH.x + across * halfWidth, y];
}

function drawRunway(ctx: CanvasRenderingContext2D, time: number, energy: number) {
  const [x0, y0] = onRunway(0, -1);
  const [x1] = onRunway(0, 1);
  const [x2, y2] = onRunway(0.62, 1);
  const [x3] = onRunway(0.62, -1);
  ctx.fillStyle = '#26272a';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y0);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(235, 235, 228, 0.8)';
  for (let dash = 0.05; dash < 0.58; dash += 0.06) {
    const [cx, cy] = onRunway(dash, 0);
    ctx.fillRect(cx - 0.3, cy, 0.6, 0.5 + dash * 2);
  }
  const glow = (x: number, y: number, colour: string, size: number) => {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  };
  for (let along = 0; along <= 0.62; along += 0.045) {
    for (const side of [-1.06, 1.06]) {
      const [x, y] = onRunway(along, side);
      glow(x, y, 'rgba(255, 244, 220, 0.85)', 0.35 + along * 0.6);
    }
  }
  // The approach lights reach out toward the aircraft; the rabbit runs up them twice a second.
  const rabbit = (time * 2 * (1 + energy * 0.5)) % 1;
  for (let step = 0; step < 9; step++) {
    const along = 0.66 + step * 0.045;
    const [x, y] = onRunway(along, 0);
    if (y > HEIGHT) break;
    const lit = Math.abs(1 - step / 8 - rabbit) < 0.06;
    for (let lamp = -2; lamp <= 2; lamp++) {
      glow(x + lamp * (0.4 + along * 1.6), y, 'rgba(255, 246, 225, 0.8)', 0.3 + along * 0.5);
    }
    if (lit) glow(x, y - 0.5, 'rgba(240, 248, 255, 0.95)', 1.6 + along * 1.4);
  }
}

function drawCloudDeck(
  ctx: CanvasRenderingContext2D,
  cloud: { x: number; y: number; width: number; height: number; drift: number }[],
  time: number,
) {
  for (const puff of cloud) {
    const x = ((((puff.x - time * puff.drift) % (WIDTH + 60)) + WIDTH + 60) % (WIDTH + 60)) - 30;
    ctx.fillStyle = 'rgba(214, 200, 210, 0.35)';
    ctx.beginPath();
    ctx.ellipse(x, puff.y, puff.width / 2, puff.height / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const base = ctx.createLinearGradient(0, 24, 0, 40);
  base.addColorStop(0, 'rgba(110, 108, 130, 0.5)');
  base.addColorStop(1, 'rgba(110, 108, 130, 0)');
  ctx.fillStyle = base;
  ctx.fillRect(0, 24, WIDTH, 16);
}

/** The jumbo from behind: fuselage and hump, swept wings with four engines, the tailplane and fin. */
function drawJumbo(ctx: CanvasRenderingContext2D, time: number, energy: number, accent: string) {
  const sink = Math.sin(time * 0.6) * 1.2;
  const cx = 80 + Math.sin(time * 0.4) * 1.5;
  const cy = 56 + sink - energy * 4;
  const bank = Math.sin(time * 0.5) * 0.03;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(bank);
  if (energy > 0.05) {
    const beam = ctx.createLinearGradient(0, 0, 0, 40);
    beam.addColorStop(0, `rgba(255, 245, 220, ${0.35 * energy})`);
    beam.addColorStop(1, 'rgba(255, 245, 220, 0)');
    ctx.fillStyle = beam;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 6, 2);
      ctx.lineTo(side * 2 - 8, 40);
      ctx.lineTo(side * 2 + 8, 40);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.fillStyle = '#1d2027';
  // Wings, a little dihedral.
  ctx.beginPath();
  ctx.moveTo(-3, 1);
  ctx.lineTo(-38, -2.5);
  ctx.lineTo(-38, -1.5);
  ctx.lineTo(-3, 3);
  ctx.moveTo(3, 1);
  ctx.lineTo(38, -2.5);
  ctx.lineTo(38, -1.5);
  ctx.lineTo(3, 3);
  ctx.fill();
  for (const x of [-25, -13, 13, 25]) {
    ctx.beginPath();
    ctx.ellipse(x, 2.6 + Math.abs(x) * -0.06, 1.8, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Tailplane and fin.
  ctx.beginPath();
  ctx.moveTo(-14, -5);
  ctx.lineTo(14, -5);
  ctx.lineTo(14, -4.2);
  ctx.lineTo(-14, -4.2);
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(-0.8, -4);
  ctx.lineTo(-0.5, -15);
  ctx.lineTo(0.5, -15);
  ctx.lineTo(0.8, -4);
  ctx.fill();
  ctx.fillStyle = '#2a2e36';
  ctx.beginPath();
  ctx.ellipse(0, 1, 3.4, 3.4, 0, 0, Math.PI * 2);
  ctx.fill();
  // The beacon and the tail light.
  ctx.fillStyle = time % 1.2 < 0.15 ? '#ff3b30' : 'rgba(255, 59, 48, 0.25)';
  ctx.beginPath();
  ctx.arc(0, -2.8, 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
