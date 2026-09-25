import { createRng } from '@shared/rng';
import { withAlpha } from '../src/colour';
import { defineCover } from '../src/cover-api';

/**
 * Skyline Showdown's cabinet screen: a city at dusk, two gorillas on their
 * rooftops and a banana forever arcing between them while the sun watches.
 * Drawn in its own 160 × 120 space and scaled to the cabinet.
 */
const WIDTH = 160;
const HEIGHT = 120;
const STREET = 112;
const FLIGHT_SECONDS = 2.4;

interface Tower {
  x: number;
  width: number;
  top: number;
  colour: string;
  lit: boolean[];
}

export default defineCover({
  posterTime: FLIGHT_SECONDS * 0.45,
  create({ seed }) {
    const rng = createRng(seed);
    const facades = ['#3b2a55', '#4a2f4f', '#2f3558', '#503345', '#36405e'];
    const towers: Tower[] = [];
    for (let x = 1; x < WIDTH;) {
      const width = rng.int(14, 24);
      const top = STREET - rng.int(26, 62);
      const lit = Array.from({ length: 40 }, () => rng.chance(0.72));
      towers.push({ x, width, top, colour: rng.pick(facades), lit });
      x += width + 1;
    }
    const far = Array.from({ length: 14 }, (_, index) => ({
      x: index * 12 - 4 + rng.float(-3, 3),
      width: rng.float(9, 16),
      top: STREET - rng.float(50, 85),
    }));
    const left = towers[1] ?? towers[0];
    const right = towers.at(-2) ?? towers.at(-1);
    if (!left || !right) throw new Error('The cover city is too small.');
    const from = { x: left.x + left.width / 2, y: left.top - 7 };
    const to = { x: right.x + right.width / 2, y: right.top - 7 };

    return {
      draw(ctx, { width, height, time, energy }) {
        ctx.save();
        ctx.scale(width / WIDTH, height / HEIGHT);

        const sky = ctx.createLinearGradient(0, 0, 0, STREET);
        sky.addColorStop(0, '#1c1446');
        sky.addColorStop(0.6, '#6b2f6e');
        sky.addColorStop(1, '#f07a4a');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        drawSun(ctx, time, energy);

        ctx.fillStyle = '#3a1f52';
        for (const tower of far) ctx.fillRect(tower.x, tower.top, tower.width, STREET - tower.top);

        for (const tower of towers) {
          ctx.fillStyle = tower.colour;
          ctx.fillRect(tower.x, tower.top, tower.width, STREET - tower.top);
          ctx.fillStyle = withAlpha('#ff9d6c', 0.35);
          ctx.fillRect(tower.x, tower.top, tower.width, 0.8);
          let index = 0;
          for (let y = tower.top + 3; y < STREET - 3; y += 6) {
            for (let x = tower.x + 2; x < tower.x + tower.width - 2; x += 4) {
              const flicker = Math.sin(time * 0.7 + index * 12.9) > 0.97;
              ctx.fillStyle =
                tower.lit[index % tower.lit.length] !== flicker ? '#ffcf7a' : '#1c1528';
              ctx.fillRect(x, y, 2, 3);
              index++;
            }
          }
        }
        ctx.fillStyle = '#120c1c';
        ctx.fillRect(0, STREET, WIDTH, HEIGHT - STREET);

        const phase = (time % FLIGHT_SECONDS) / FLIGHT_SECONDS;
        const throwing = energy > 0.2 && phase < 0.15;
        drawGorilla(ctx, from.x, from.y, '#6e4a3a', '#ff7a3d', throwing ? -1 : 0);
        drawGorilla(ctx, to.x, to.y, '#56627e', '#3fe0ff', 0);
        drawBanana(ctx, from, to, phase);

        ctx.restore();
      },
    };
  },
});

function drawSun(ctx: CanvasRenderingContext2D, time: number, energy: number) {
  const x = 80;
  const y = 18;
  const glow = ctx.createRadialGradient(x, y, 2, x, y, 20);
  glow.addColorStop(0, withAlpha('#ffcf5a', 0.5));
  glow.addColorStop(1, withAlpha('#ffcf5a', 0));
  ctx.fillStyle = glow;
  ctx.fillRect(x - 20, y - 20, 40, 40);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(time * 0.3);
  ctx.fillStyle = '#ffb02a';
  for (let ray = 0; ray < 10; ray++) {
    ctx.rotate(Math.PI / 5);
    ctx.beginPath();
    ctx.moveTo(-1.2, -6);
    ctx.lineTo(0, -10);
    ctx.lineTo(1.2, -6);
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = '#ffc234';
  ctx.beginPath();
  ctx.arc(x, y, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3a1a10';
  ctx.beginPath();
  ctx.arc(x - 2, y - 1.5, 0.7, 0, Math.PI * 2);
  ctx.arc(x + 2, y - 1.5, 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#3a1a10';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  // The sun gasps while the cabinet is lit and a banana sails past.
  if (energy > 0.5) ctx.arc(x, y + 2.2, 1.2, 0, Math.PI * 2);
  else ctx.arc(x, y + 0.5, 2.6, Math.PI * 0.2, Math.PI * 0.8);
  ctx.stroke();
}

function drawGorilla(
  ctx: CanvasRenderingContext2D,
  x: number,
  feetY: number,
  fur: string,
  accent: string,
  raise: number,
) {
  const y = feetY - 7;
  ctx.fillStyle = fur;
  ctx.beginPath();
  ctx.ellipse(x, y + 3.2, 4.2, 3.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y - 1.2, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x - 3, y + 5.5, 2, 2);
  ctx.fillRect(x + 1, y + 5.5, 2, 2);
  ctx.strokeStyle = fur;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 3.5, y + 1.5);
  ctx.lineTo(x - 5.5, y + (raise ? -4 : 5));
  ctx.moveTo(x + 3.5, y + 1.5);
  ctx.lineTo(x + 5.5, y + 5);
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.fillRect(x - 2.2, y - 2.4, 4.4, 0.9);
}

function drawBanana(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  phase: number,
) {
  const peak = Math.min(from.y, to.y) - 40;
  const at = (share: number) => ({
    x: from.x + (to.x - from.x) * share,
    y: (1 - share) ** 2 * from.y + 2 * (1 - share) * share * peak + share ** 2 * to.y,
  });
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let step = 1; step <= 8; step++) {
    const share = Math.max(0, phase - step * 0.018);
    const point = at(share);
    ctx.fillStyle = withAlpha('#ffe68a', 0.4 * (1 - step / 9));
    ctx.beginPath();
    ctx.arc(point.x, point.y, 1.3 * (1 - step / 12), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  const banana = at(phase);
  ctx.save();
  ctx.translate(banana.x, banana.y);
  ctx.rotate(phase * 22);
  ctx.strokeStyle = '#ffe14d';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, -1.2, 2.2, Math.PI * 0.2, Math.PI * 0.8);
  ctx.stroke();
  ctx.restore();
}
