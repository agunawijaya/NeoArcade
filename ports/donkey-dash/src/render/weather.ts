import { hash } from './scenery';
import type { Frame, Viewport } from './view';

/**
 * Weather over the whole picture, the same in every view: pollen in the
 * golden light, mountain mist, desert heat shimmer, fireflies at night and
 * falling snow. Each mote's place is worked out from its number and the
 * time, so there is nothing to keep between frames.
 */
export function drawWeather(ctx: CanvasRenderingContext2D, frame: Frame, viewport: Viewport) {
  const { width, height } = viewport;
  const time = frame.reducedMotion ? 0 : frame.time;
  const drift = frame.reducedMotion ? 0 : frame.nose * 0.6;
  ctx.save();
  switch (frame.palette.weather) {
    case 'pollen':
      motes(ctx, 26, (index) => {
        const x = wrap(hash(index) * width + Math.sin(time * 0.6 + index) * 30, width);
        const y = wrap(hash(index + 500) * height + time * 12 + drift * 0.3, height);
        return { x, y, radius: 1.2 + hash(index + 900) * 1.8, colour: 'rgba(255, 244, 196, 0.55)' };
      });
      break;
    case 'snow':
      motes(ctx, 110, (index) => {
        const depth = 0.4 + hash(index + 50) * 0.6;
        const x = wrap(
          hash(index) * width + Math.sin(time * 0.9 + index) * 18 * depth - time * 20 * depth,
          width,
        );
        const y = wrap(hash(index + 400) * height + (time * 70 + drift * 2) * depth, height);
        return {
          x,
          y,
          radius: 1 + depth * 2.4,
          colour: `rgba(255, 255, 255, ${0.45 + depth * 0.45})`,
        };
      });
      break;
    case 'fireflies':
      ctx.globalCompositeOperation = 'lighter';
      motes(ctx, 34, (index) => {
        const x = wrap(hash(index) * width + Math.sin(time * 0.5 + index * 3) * 40, width);
        const y = wrap(
          hash(index + 70) * height + Math.cos(time * 0.4 + index) * 30 + drift * 0.4,
          height,
        );
        const glow = 0.5 + 0.5 * Math.sin(time * 2.2 + index * 1.7);
        return { x, y, radius: 2 + glow * 3, colour: `rgba(214, 255, 120, ${0.15 + glow * 0.6})` };
      });
      break;
    case 'mist':
      for (let band = 0; band < 4; band++) {
        const y = height * (0.2 + band * 0.2) + Math.sin(time * 0.2 + band) * 20;
        const fog = ctx.createLinearGradient(0, y - 60, 0, y + 60);
        fog.addColorStop(0, 'rgba(235, 238, 248, 0)');
        fog.addColorStop(0.5, `rgba(235, 238, 248, ${0.12 + frame.palette.fog * 0.1})`);
        fog.addColorStop(1, 'rgba(235, 238, 248, 0)');
        ctx.fillStyle = fog;
        ctx.fillRect(0, y - 60, width, 120);
      }
      break;
    case 'heat':
      for (let band = 0; band < 7; band++) {
        const y = height * 0.08 + band * 18 + Math.sin(time * 3 + band) * 3;
        ctx.fillStyle = `rgba(255, 230, 190, ${0.05 + 0.03 * Math.sin(time * 4 + band * 2)})`;
        ctx.fillRect(0, y, width, 6);
      }
      break;
    case 'none':
      break;
  }
  ctx.restore();
}

function motes(
  ctx: CanvasRenderingContext2D,
  count: number,
  place: (index: number) => { x: number; y: number; radius: number; colour: string },
) {
  for (let index = 0; index < count; index++) {
    const { x, y, radius, colour } = place(index);
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function wrap(value: number, size: number): number {
  return ((value % size) + size) % size;
}
