import { createRng } from '@shared/rng';
import type { Context } from './canvas-kit';
import type { Palette } from './palette';

/**
 * The windows from the captain's seat: the frame and the centre post,
 * rain beading and streaking across the glass faster as the speed builds,
 * and the wipers sweeping it clear. Under reduced motion the drops still
 * sit on the glass but neither streak nor run.
 */
interface Drop {
  x: number;
  y: number;
  size: number;
  speed: number;
}

const DROPS = 260;

export class Windscreen {
  private drops: Drop[];
  private wiperAngle = 0;
  private wiperDirection = 1;
  private wetness = 0;

  constructor(seed = 312) {
    const rng = createRng(seed);
    this.drops = Array.from({ length: DROPS }, () => ({
      x: rng.next(),
      y: rng.next(),
      size: rng.float(0.6, 2.2),
      speed: rng.float(0.6, 1.4),
    }));
  }

  /** Raining onto the glass, the airspeed, the wipers' setting, and a frame's time. */
  update(
    raining: boolean,
    airspeedKt: number,
    wipers: 'off' | 'low' | 'high',
    dt: number,
    reducedMotion: boolean,
  ) {
    this.wetness = Math.max(0, Math.min(1, this.wetness + (raining ? 0.25 : -0.08) * dt));
    const sweepRate = wipers === 'high' ? 2.4 : wipers === 'low' ? 1.3 : 0;
    if (sweepRate > 0 || this.wiperAngle > 0) {
      this.wiperAngle += this.wiperDirection * Math.max(sweepRate, 1.3) * dt;
      if (this.wiperAngle >= 1) {
        this.wiperAngle = 1;
        this.wiperDirection = -1;
      }
      if (this.wiperAngle <= 0) {
        this.wiperAngle = 0;
        this.wiperDirection = sweepRate > 0 ? 1 : 0;
      }
    }
    if (reducedMotion) return;
    const streak = Math.min(1, airspeedKt / 160);
    for (const drop of this.drops) {
      // Slow drops run down the glass; at speed the airflow drives them up and outward.
      drop.y += (0.02 - streak * 0.5) * drop.speed * dt;
      drop.x += (drop.x - 0.5) * streak * 0.2 * drop.speed * dt;
      if (drop.y < -0.05 || drop.y > 1.05 || drop.x < -0.05 || drop.x > 1.05) {
        drop.x = (drop.x * 7.31 + 0.137) % 1;
        drop.y = streak > 0.3 ? 1 : (drop.y * 3.7 + 0.29) % 1;
      }
    }
  }

  draw(context: Context, width: number, bottom: number, palette: Palette, airspeedKt: number) {
    if (this.wetness > 0.02) this.drawRain(context, width, bottom, airspeedKt);
    this.drawFrame(context, width, bottom, palette);
  }

  private drawRain(context: Context, width: number, bottom: number, airspeedKt: number) {
    const wiperX = width * (0.08 + this.wiperAngle * 0.5);
    const streak = Math.min(1, airspeedKt / 160);
    context.save();
    context.globalAlpha = this.wetness;
    for (const drop of this.drops) {
      const x = drop.x * width * 0.62;
      const y = drop.y * bottom;
      // The wiper leaves a clear sweep behind it.
      if (this.wiperAngle > 0 && Math.abs(x - wiperX) < width * 0.04) continue;
      const size = drop.size * (width / 1400);
      // A bead of water, with a short tail blown back across the glass at speed.
      if (streak > 0.1) {
        context.strokeStyle = 'rgba(214, 228, 238, 0.16)';
        context.lineWidth = size * 0.7;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + (drop.x - 0.5) * streak * size * 14, y + size * streak * 5);
        context.stroke();
      }
      context.fillStyle = 'rgba(236, 244, 250, 0.32)';
      context.beginPath();
      context.arc(x, y, size * 0.75, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = 'rgba(20, 30, 40, 0.18)';
      context.beginPath();
      context.arc(x + size * 0.2, y + size * 0.3, size * 0.45, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
    if (this.wiperAngle > 0) {
      context.strokeStyle = '#121314';
      context.lineWidth = width * 0.006;
      context.beginPath();
      context.moveTo(width * 0.31, bottom * 1.02);
      context.lineTo(wiperX, bottom * 0.35);
      context.stroke();
    }
  }

  private drawFrame(context: Context, width: number, bottom: number, palette: Palette) {
    context.fillStyle = palette.frame;
    // The top of the windows and the eyebrow.
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(width, 0);
    context.lineTo(width, bottom * 0.035);
    context.quadraticCurveTo(width * 0.5, bottom * 0.085, 0, bottom * 0.05);
    context.closePath();
    context.fill();
    // The centre post, right of the captain, and the post between the front and side windows.
    const post = (top: number, base: number, wide: number) => {
      context.beginPath();
      context.moveTo(top - wide * 0.4, 0);
      context.lineTo(top + wide * 0.4, 0);
      context.lineTo(base + wide * 0.6, bottom);
      context.lineTo(base - wide * 0.6, bottom);
      context.closePath();
      context.fill();
    };
    post(width * 0.735, width * 0.705, width * 0.024);
    post(width * 0.02, width * -0.01, width * 0.035);
    const glint = context.createLinearGradient(0, 0, width, bottom);
    glint.addColorStop(0, 'rgba(255,255,255,0.025)');
    glint.addColorStop(0.5, 'rgba(255,255,255,0)');
    glint.addColorStop(1, 'rgba(255,255,255,0.02)');
    context.fillStyle = glint;
    context.fillRect(0, 0, width, bottom);
  }
}
