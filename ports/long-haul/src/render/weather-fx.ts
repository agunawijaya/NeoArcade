import { createRng } from '@shared/rng';
import type { ConditionId } from '../engine/conditions';

/**
 * Rain, snow and fog over either view. Particles live in a fixed pool with
 * positions computed from time, so nothing is allocated per frame and the
 * same moment always looks the same.
 */
interface Particle {
  x: number;
  y: number;
  speed: number;
  size: number;
  sway: number;
}

const POOL: readonly Particle[] = (() => {
  const rng = createRng('long-haul-weather');
  return Array.from({ length: 420 }, () => ({
    x: rng.next(),
    y: rng.next(),
    speed: rng.float(0.6, 1.4),
    size: rng.float(0.6, 1.6),
    sway: rng.float(0, Math.PI * 2),
  }));
})();

export interface WeatherFrame {
  width: number;
  height: number;
  condition: ConditionId;
  time: number;
  /** How fast the scenery passes, 0–1: rain and snow slant more at speed. */
  wind: number;
  /** 0 day … 1 night: snow and rain catch the headlights. */
  night: number;
  reducedMotion: boolean;
}

export function paintPrecipitation(ctx: CanvasRenderingContext2D, frame: WeatherFrame) {
  const { condition } = frame;
  if (condition === 'rain' || condition === 'wet') {
    paintRain(ctx, frame, condition === 'rain' ? 1 : 0.15);
  } else if (condition === 'light-snow' || condition === 'blizzard') {
    paintSnow(ctx, frame, condition === 'blizzard' ? 1 : 0.4);
  }
  if (condition === 'fog' || condition === 'blizzard')
    paintFogBanks(ctx, frame, condition === 'fog' ? 0.55 : 0.4);
}

function paintRain(ctx: CanvasRenderingContext2D, frame: WeatherFrame, amount: number) {
  if (amount < 0.2 && frame.reducedMotion) return;
  const count = Math.round(POOL.length * 0.55 * amount);
  const slant = 0.25 + frame.wind * 0.6;
  const colour = frame.night > 0.5 ? '200, 215, 235' : '225, 235, 245';
  ctx.strokeStyle = `rgba(${colour}, ${0.35 + amount * 0.2})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let index = 0; index < count; index++) {
    const p = POOL[index] as Particle;
    const fall = frame.reducedMotion ? 0 : frame.time * 1.8 * p.speed;
    const y = ((p.y + fall) % 1) * frame.height;
    const x = ((((p.x - fall * slant * 0.5) % 1) + 1) % 1) * frame.width;
    const length = 10 + p.size * 10;
    ctx.moveTo(x, y);
    ctx.lineTo(x - length * slant, y + length);
  }
  ctx.stroke();
}

function paintSnow(ctx: CanvasRenderingContext2D, frame: WeatherFrame, amount: number) {
  const count = Math.round(POOL.length * amount);
  const drift = 0.15 + frame.wind * 0.9;
  ctx.fillStyle = 'rgba(250, 252, 255, 0.85)';
  for (let index = 0; index < count; index++) {
    const p = POOL[index] as Particle;
    const fall = frame.reducedMotion ? 0 : frame.time * 0.35 * p.speed;
    const y = ((p.y + fall) % 1) * frame.height;
    const wobble = frame.reducedMotion ? 0 : Math.sin(frame.time * 2 + p.sway) * 0.01;
    const x = ((((p.x - fall * drift + wobble) % 1) + 1) % 1) * frame.width;
    const size = p.size * (amount > 0.6 ? 2.2 : 1.6);
    ctx.fillRect(x, y, size, size);
  }
}

function paintFogBanks(ctx: CanvasRenderingContext2D, frame: WeatherFrame, amount: number) {
  const tone = frame.night > 0.5 ? '150, 158, 170' : '226, 230, 232';
  const gradient = ctx.createLinearGradient(0, frame.height * 0.25, 0, frame.height);
  gradient.addColorStop(0, `rgba(${tone}, ${amount * 0.35})`);
  gradient.addColorStop(0.5, `rgba(${tone}, ${amount * 0.65})`);
  gradient.addColorStop(1, `rgba(${tone}, ${amount * 0.4})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, frame.width, frame.height);
  const shift = frame.reducedMotion ? 0 : frame.time * 18;
  for (let band = 0; band < 4; band++) {
    const y = frame.height * (0.45 + band * 0.12);
    const x = ((-shift * (1 + band * 0.4)) % frame.width) - frame.width * 0.2;
    ctx.fillStyle = `rgba(${tone}, ${amount * 0.18})`;
    ctx.beginPath();
    ctx.ellipse(
      x + frame.width * 0.5,
      y,
      frame.width * 0.6,
      frame.height * 0.06,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(
      x + frame.width * 1.5,
      y,
      frame.width * 0.6,
      frame.height * 0.06,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}

/**
 * Tiredness felt on screen: the edges darken with every state past "fine",
 * and from "tired" on the eyelids droop now and then. Reduced motion keeps
 * the darkening but holds the eyelids still at a gentle half-blink.
 */
export function paintFatigue(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  severity: number,
  time: number,
  reducedMotion: boolean,
) {
  if (severity <= 1) return;
  const strength = (severity - 1) / 4;
  const vignette = ctx.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.35,
    width / 2,
    height / 2,
    Math.hypot(width, height) * 0.6,
  );
  vignette.addColorStop(0, 'rgba(8, 6, 14, 0)');
  vignette.addColorStop(1, `rgba(8, 6, 14, ${0.25 + strength * 0.55})`);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
  if (severity < 3) return;
  let close = 0;
  if (reducedMotion) {
    close = 0.08 * strength;
  } else {
    // A slow blink every few seconds, longer and deeper as tiredness grows.
    const period = 6 - strength * 2.5;
    const phase = (time % period) / period;
    const window = 0.08 + strength * 0.08;
    if (phase < window) close = Math.sin((phase / window) * Math.PI) * (0.35 + strength * 0.45);
  }
  if (close <= 0) return;
  ctx.fillStyle = 'rgba(6, 4, 10, 0.94)';
  const lid = (height / 2) * close;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(width, 0);
  ctx.lineTo(width, lid);
  ctx.quadraticCurveTo(width / 2, lid * 1.6, 0, lid);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(width, height);
  ctx.lineTo(width, height - lid);
  ctx.quadraticCurveTo(width / 2, height - lid * 1.6, 0, height - lid);
  ctx.closePath();
  ctx.fill();
}
