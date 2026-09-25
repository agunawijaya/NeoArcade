import { createRng } from '@shared/rng';
import { defineCover } from './cover-api';
import { shade, withAlpha } from './colour';

/**
 * The generic attract-mode screen for a game whose own cover is missing or
 * broken: the title glowing over a neon horizon.
 */
export const fallbackCover = defineCover({
  posterTime: 1.2,
  create({ seed, accent, title }) {
    const rng = createRng(seed);
    const stars = Array.from({ length: 70 }, () => ({
      x: rng.next(),
      y: rng.next() * 0.62,
      size: rng.float(0.4, 1.4),
      twinkle: rng.float(0, Math.PI * 2),
    }));

    return {
      draw(ctx, { width, height, time, energy }) {
        const horizon = height * 0.64;

        const sky = ctx.createLinearGradient(0, 0, 0, horizon);
        sky.addColorStop(0, '#05040b');
        sky.addColorStop(1, shade(accent, -0.72));
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, width, horizon);
        ctx.fillStyle = '#05040b';
        ctx.fillRect(0, horizon, width, height - horizon);

        for (const star of stars) {
          const glow = 0.45 + 0.35 * Math.sin(time * 1.7 + star.twinkle);
          ctx.fillStyle = `rgba(235, 238, 255, ${glow})`;
          const x = (((star.x - time * 0.004 * (1 + energy * 3)) % 1) + 1) % 1;
          ctx.fillRect(x * width, star.y * height, star.size, star.size);
        }

        const halo = ctx.createRadialGradient(
          width / 2,
          horizon,
          0,
          width / 2,
          horizon,
          width * 0.55,
        );
        halo.addColorStop(0, withAlpha(accent, 0.5 + energy * 0.25));
        halo.addColorStop(1, withAlpha(accent, 0));
        ctx.fillStyle = halo;
        ctx.fillRect(0, 0, width, height);

        drawGrid(ctx, width, height, horizon, accent, time * (0.25 + energy * 0.6));
        drawTitle(ctx, title, width, height * 0.36, accent, energy);

        if (energy > 0.5 && Math.floor(time * 1.6) % 2 === 0) {
          ctx.font = `600 ${Math.round(height * 0.055)}px ui-monospace, Consolas, monospace`;
          ctx.textAlign = 'center';
          ctx.fillStyle = withAlpha('#ffffff', (energy - 0.5) * 2);
          ctx.fillText('PRESS START', width / 2, height * 0.9);
        }
      },
    };
  },
});

function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  horizon: number,
  accent: string,
  scroll: number,
) {
  ctx.save();
  ctx.strokeStyle = withAlpha(accent, 0.55);
  ctx.lineWidth = 1;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 6;
  ctx.beginPath();
  for (let i = -12; i <= 12; i++) {
    ctx.moveTo(width / 2 + i * width * 0.02, horizon);
    ctx.lineTo(width / 2 + i * width * 0.16, height);
  }
  // Horizontal lines bunch up towards the horizon, as they would in perspective.
  for (let i = 0; i < 10; i++) {
    const depth = (i + (scroll % 1)) / 10;
    const y = horizon + (height - horizon) * depth * depth;
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawTitle(
  ctx: CanvasRenderingContext2D,
  title: string,
  width: number,
  centreY: number,
  accent: string,
  energy: number,
) {
  const lines = splitTitle(title);
  const size = Math.min(
    width * 0.11,
    ((width * 0.9) / Math.max(...lines.map((line) => line.length))) * 1.7,
  );
  ctx.save();
  ctx.font = `${Math.round(size)}px 'Tilt Neon', system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = accent;
  lines.forEach((line, index) => {
    const y = centreY + (index - (lines.length - 1) / 2) * size * 1.05;
    ctx.shadowBlur = 18 + energy * 14;
    ctx.fillStyle = withAlpha(accent, 0.9);
    ctx.fillText(line, width / 2, y);
    ctx.shadowBlur = 4;
    ctx.fillStyle = '#fff6fb';
    ctx.fillText(line, width / 2, y);
  });
  ctx.restore();
}

function splitTitle(title: string): string[] {
  const words = title.toUpperCase().split(/\s+/);
  if (words.length < 2 || title.length < 12) return [words.join(' ')];
  const middle = Math.ceil(words.length / 2);
  return [words.slice(0, middle).join(' '), words.slice(middle).join(' ')];
}
