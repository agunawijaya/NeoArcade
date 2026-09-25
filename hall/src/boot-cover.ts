import { createRng } from '@shared/rng';
import { defineCover } from './cover-api';
import { withAlpha } from './colour';

/**
 * What the empty cabinets show while the Hall has no games: a cabinet
 * powering on and running its self-test, forever.
 */
const CYCLE_SECONDS = 11;
const STATIC_END = 0.9;
const BARS_END = 2.3;
const TEST_END = 7.6;

const TEST_LINES = [
  'NEOARCADE BOARD REV 0.1',
  '',
  'RAM TEST ........ OK',
  'ROM TEST ........ OK',
  'SOUND CHIP ...... OK',
  'COIN MECH ....... OK',
  'GAME ROM ........ NOT FOUND',
];

const COLOUR_BARS = ['#c9c9c9', '#c9c900', '#00c9c9', '#00c900', '#c900c9', '#c90000', '#0000c9'];
const MONO = 'ui-monospace, "Cascadia Mono", Consolas, monospace';

export const bootCover = defineCover({
  posterTime: 8.4,
  create({ seed, accent }) {
    const rng = createRng(seed);
    const phase = rng.float(0, CYCLE_SECONDS);
    const noiseFrames = Array.from({ length: 4 }, () => makeNoiseFrame(rng.next));

    return {
      draw(ctx, { width, height, time, reducedMotion }) {
        const t = reducedMotion ? 8.4 : (time + phase) % CYCLE_SECONDS;
        ctx.fillStyle = '#030306';
        ctx.fillRect(0, 0, width, height);

        if (t < STATIC_END) {
          const frame = noiseFrames[Math.floor(time * 24) % noiseFrames.length];
          if (frame) {
            ctx.imageSmoothingEnabled = false;
            ctx.globalAlpha = 0.55;
            ctx.drawImage(frame, 0, 0, width, height);
            ctx.globalAlpha = 1;
          }
        } else if (t < BARS_END) {
          drawColourBars(ctx, width, height, t - STATIC_END);
        } else if (t < TEST_END) {
          drawSelfTest(ctx, width, height, t - BARS_END, accent);
        } else {
          drawPleaseWait(ctx, width, height, t - TEST_END, accent);
        }
      },
    };
  },
});

function makeNoiseFrame(random: () => number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 72;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const pixels = ctx.createImageData(canvas.width, canvas.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const value = random() * 200;
    pixels.data[i] = value;
    pixels.data[i + 1] = value;
    pixels.data[i + 2] = value * 1.1;
    pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}

function drawColourBars(ctx: CanvasRenderingContext2D, width: number, height: number, t: number) {
  const barWidth = width / COLOUR_BARS.length;
  // The picture rolls once as the tube syncs, like an old monitor warming up.
  const roll = Math.max(0, 1 - t * 2.2) * height;
  ctx.save();
  ctx.globalAlpha = Math.min(1, t * 3) * 0.8;
  COLOUR_BARS.forEach((colour, index) => {
    ctx.fillStyle = colour;
    ctx.fillRect(index * barWidth, -roll, barWidth + 1, height * 0.72);
    ctx.fillRect(index * barWidth, height - roll, barWidth + 1, height * 0.72);
  });
  ctx.fillStyle = '#101018';
  ctx.fillRect(0, height * 0.72 - roll, width, height * 0.28);
  ctx.restore();
}

function drawSelfTest(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  t: number,
  accent: string,
) {
  const size = Math.max(7, height * 0.062);
  ctx.font = `${size}px ${MONO}`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  const left = width * 0.08;
  const shown = Math.floor(t * 2.2);

  TEST_LINES.slice(0, shown).forEach((line, index) => {
    const failing = line.endsWith('NOT FOUND');
    ctx.fillStyle = failing ? withAlpha(accent, 0.95) : 'rgba(170, 255, 200, 0.85)';
    ctx.fillText(line, left, height * 0.12 + index * size * 1.45);
  });

  if (shown >= TEST_LINES.length) {
    const progress = Math.min(1, (t - TEST_LINES.length / 2.2) / 1.6);
    const barY = height * 0.8;
    ctx.strokeStyle = 'rgba(170, 255, 200, 0.6)';
    ctx.strokeRect(left, barY, width * 0.84, size);
    ctx.fillStyle = 'rgba(170, 255, 200, 0.75)';
    ctx.fillRect(left + 2, barY + 2, (width * 0.84 - 4) * progress, size - 4);
  }
}

function drawPleaseWait(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  t: number,
  accent: string,
) {
  const glow = ctx.createRadialGradient(
    width / 2,
    height / 2,
    0,
    width / 2,
    height / 2,
    width * 0.6,
  );
  glow.addColorStop(0, withAlpha(accent, 0.22));
  glow.addColorStop(1, withAlpha(accent, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  const size = Math.max(9, height * 0.1);
  ctx.font = `${size}px 'Tilt Neon', system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = accent;
  ctx.shadowBlur = 12;
  ctx.fillStyle = withAlpha('#ffffff', Math.floor(t * 1.5) % 2 === 0 ? 0.95 : 0.55);
  ctx.fillText('PLEASE WAIT', width / 2, height * 0.46);
  ctx.shadowBlur = 0;

  ctx.fillStyle = withAlpha(accent, 0.9);
  for (let dot = 0; dot < 3; dot++) {
    const lit = Math.floor(t * 3) % 3 === dot;
    ctx.globalAlpha = lit ? 1 : 0.3;
    ctx.beginPath();
    ctx.arc(width / 2 + (dot - 1) * size * 0.7, height * 0.64, size * 0.14, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
