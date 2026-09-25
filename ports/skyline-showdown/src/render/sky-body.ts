import { createRng } from '@shared/rng';
import { SUN } from '../engine/constants';
import type { Point } from '../engine/geometry';
import type { WorldId } from '../engine/worlds';
import { withAlpha } from './palette';

/**
 * The game's mascot: the face in the sky, where the original's sun sat. It
 * smiles, blinks, follows the banana with its eyes and gasps when one goes
 * through it. Each world gets its own: the Sun over Earth (and the Moon
 * over Earth at night), Earth over the Moon, Phobos over Mars and Io over
 * Jupiter.
 */
export class SkyBody {
  /** Seconds left of the shocked face. */
  private shocked = 0;
  private wobble = 0;
  private blinkIn = 3;
  private blinking = 0;
  lookAt: Point | null = null;
  private readonly spots: { x: number; y: number; radius: number; colour: string }[];

  constructor(
    private readonly world: WorldId,
    /** Earth's night sky swaps the Sun for the Moon. */
    private readonly night = false,
  ) {
    const rng = createRng(world.length * 97);
    this.spots = Array.from({ length: 9 }, () => ({
      x: rng.float(-9, 9),
      y: rng.float(-9, 9),
      radius: rng.float(1.2, 3.8),
      colour: rng.pick(['#3f7d3c', '#5a9448', '#e8e8e8']),
    }));
  }

  gasp() {
    this.shocked = 2.2;
    this.wobble = 1;
  }

  calm() {
    this.shocked = 0;
  }

  update(delta: number) {
    this.shocked = Math.max(0, this.shocked - delta);
    this.wobble = Math.max(0, this.wobble - delta * 2.5);
    this.blinkIn -= delta;
    if (this.blinkIn <= 0) {
      this.blinking = 0.14;
      this.blinkIn = 3 + Math.random() * 4;
    }
    this.blinking = Math.max(0, this.blinking - delta);
  }

  draw(ctx: CanvasRenderingContext2D, time: number, glow: number) {
    const { x, y } = SUN;
    const squash = 1 + Math.sin(this.wobble * 18) * this.wobble * 0.12;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(squash, 2 - squash);

    const aura = ctx.createRadialGradient(0, 0, 8, 0, 0, 38);
    aura.addColorStop(0, withAlpha(this.auraColour(), 0.32 * glow));
    aura.addColorStop(1, withAlpha(this.auraColour(), 0));
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, 0, 42, 0, Math.PI * 2);
    ctx.fill();

    switch (this.world) {
      case 'earth':
        if (this.night) this.drawMoon(ctx);
        else this.drawSun(ctx, time);
        break;
      case 'moon':
        this.drawEarth(ctx, time);
        break;
      case 'mars':
        this.drawPhobos(ctx);
        break;
      case 'jupiter':
        this.drawIo(ctx);
        break;
    }
    this.drawFace(ctx);
    ctx.restore();
  }

  private auraColour(): string {
    if (this.world === 'earth' && this.night) return '#bcd0ff';
    return { earth: '#ffcf5a', moon: '#6fb8ff', mars: '#e8c8a8', jupiter: '#ffd06a' }[this.world];
  }

  private drawMoon(ctx: CanvasRenderingContext2D) {
    const face = ctx.createRadialGradient(-4, -4, 1, 0, 0, 12);
    face.addColorStop(0, '#fbfcff');
    face.addColorStop(1, '#b9c2d8');
    ctx.fillStyle = face;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = withAlpha('#8a93ad', 0.4);
    for (const spot of this.spots.slice(0, 6)) {
      ctx.beginPath();
      ctx.arc(spot.x * 0.9, spot.y * 0.9, spot.radius * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawSun(ctx: CanvasRenderingContext2D, time: number) {
    ctx.save();
    ctx.rotate(time * 0.15);
    ctx.fillStyle = '#ffb02a';
    for (let ray = 0; ray < 12; ray++) {
      ctx.rotate(Math.PI / 6);
      ctx.beginPath();
      ctx.moveTo(-2.2, -11);
      ctx.lineTo(0, -19 - (ray % 2) * 2);
      ctx.lineTo(2.2, -11);
      ctx.fill();
    }
    ctx.restore();
    const face = ctx.createRadialGradient(-3, -4, 1, 0, 0, 12);
    face.addColorStop(0, '#ffe98a');
    face.addColorStop(0.6, '#ffc234');
    face.addColorStop(1, '#ff8a1e');
    ctx.fillStyle = face;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = withAlpha('#ff7a5a', 0.35);
    ctx.beginPath();
    ctx.arc(-6.5, 3.5, 2, 0, Math.PI * 2);
    ctx.arc(6.5, 3.5, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawEarth(ctx: CanvasRenderingContext2D, time: number) {
    const ocean = ctx.createRadialGradient(-4, -4, 1, 0, 0, 12);
    ocean.addColorStop(0, '#6fc3ff');
    ocean.addColorStop(1, '#1d4f9a');
    ctx.fillStyle = ocean;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.clip();
    const drift = (time * 1.5) % 24;
    for (const spot of this.spots) {
      ctx.fillStyle = withAlpha(spot.colour, spot.colour === '#e8e8e8' ? 0.6 : 0.85);
      ctx.beginPath();
      ctx.ellipse(
        ((spot.x + drift + 12) % 24) - 12,
        spot.y,
        spot.radius * 1.4,
        spot.radius,
        0.3,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = withAlpha('#aee0ff', 0.7);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 12.2, 0, Math.PI * 2);
    ctx.stroke();
  }

  private drawPhobos(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#8a7a6c';
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.bezierCurveTo(-13, -8, -4, -11, 2, -10.5);
    ctx.bezierCurveTo(10, -10, 14, -3, 12.5, 3);
    ctx.bezierCurveTo(11, 10, 1, 10.5, -4, 9.5);
    ctx.bezierCurveTo(-10, 8.5, -11.5, 5, -12, 0);
    ctx.fill();
    ctx.fillStyle = withAlpha('#4a3e36', 0.45);
    for (const spot of this.spots.slice(0, 6)) {
      ctx.beginPath();
      ctx.arc(spot.x, spot.y * 0.8, spot.radius * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawIo(ctx: CanvasRenderingContext2D) {
    const surface = ctx.createRadialGradient(-4, -4, 1, 0, 0, 12);
    surface.addColorStop(0, '#fff2a0');
    surface.addColorStop(1, '#e0a030');
    ctx.fillStyle = surface;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = withAlpha('#9a3a1a', 0.55);
    for (const spot of this.spots.slice(0, 7)) {
      ctx.beginPath();
      ctx.arc(spot.x * 0.9, spot.y * 0.9, spot.radius * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawFace(ctx: CanvasRenderingContext2D) {
    const look = this.lookAt
      ? {
          x: Math.max(-1, Math.min(1, (this.lookAt.x - SUN.x) / 120)),
          y: Math.max(-1, Math.min(1, (this.lookAt.y - SUN.y) / 120)),
        }
      : { x: 0, y: 0.3 };
    const ink = '#3a1a10';
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineWidth = 0.9;
    ctx.lineCap = 'round';

    for (const side of [-1, 1]) {
      const eyeX = side * 3.8;
      if (this.blinking > 0 && this.shocked === 0) {
        ctx.beginPath();
        ctx.moveTo(eyeX - 1.3, -2.6);
        ctx.lineTo(eyeX + 1.3, -2.6);
        ctx.stroke();
        continue;
      }
      const size = this.shocked > 0 ? 2.1 : 1.6;
      ctx.fillStyle = '#fffaf0';
      ctx.beginPath();
      ctx.ellipse(eyeX, -2.8, size, size * 1.15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.arc(
        eyeX + look.x * 0.8,
        -2.8 + look.y * 0.8,
        this.shocked > 0 ? 0.7 : 0.9,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    ctx.beginPath();
    if (this.shocked > 0) {
      ctx.fillStyle = ink;
      ctx.ellipse(0, 4.5, 2.4, 2.9, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.arc(0, 1.2, 5, Math.PI * 0.2, Math.PI * 0.8);
      ctx.stroke();
    }
  }
}
