import type { Point } from '../engine/geometry';
import type { Gorilla } from '../engine/gorillas';
import { Effects } from './effects';
import { GorillaActor, type GorillaLook } from './gorilla';
import { drawBanana, drawTrail } from './outfit';
import { shade, withAlpha } from './palette';

/**
 * A gorilla on a rooftop of its own, for the menus: the rival's portrait on
 * the stage card and the results screen, and the wardrobe's live preview.
 * In the wardrobe it can also throw: a banana in the chosen skin, trailing
 * the chosen trail, bursting in the chosen explosion.
 */
export type PreviewMode = 'idle' | 'victory' | 'sulk' | 'throw';

interface Framing {
  /** The box of world units that must fit in the canvas, centred. */
  width: number;
  height: number;
  /** Where the gorilla's box sits, in those units. */
  gorilla: Point;
}

const CLOSE: Framing = { width: 52, height: 58, gorilla: { x: 11, y: 20 } };
const WIDE: Framing = { width: 150, height: 104, gorilla: { x: 14, y: 40 } };
const TARGET = { x: 118, width: 22, top: 58 };
const THROW_CYCLE = 3.4;
const FLIGHT_SECONDS = 1.1;

export class GorillaPreview {
  readonly canvas = document.createElement('canvas');
  private readonly actor: GorillaActor;
  private readonly effects = new Effects();
  private trail: Point[] = [];
  private mode: PreviewMode = 'idle';
  private time = 0;
  private cycle = 0;
  private burst = false;

  constructor(look: GorillaLook) {
    this.actor = new GorillaActor(0, look);
    this.canvas.className = 'preview';
    this.canvas.setAttribute('aria-hidden', 'true');
  }

  set look(look: GorillaLook) {
    this.actor.look = look;
  }

  show(mode: PreviewMode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.cycle = 0;
    this.trail = [];
    this.effects.clear();
    this.actor.setMood(mode === 'victory' ? 'dance' : mode === 'sulk' ? 'facepalm' : 'idle');
  }

  update(delta: number, reducedMotion: boolean) {
    // Reduced motion keeps the gorilla standing; the outfit still shows in full.
    const step = reducedMotion ? 0 : delta;
    this.time += step;
    this.actor.update(step);
    this.effects.update(step, 0);
    if (this.mode === 'throw') this.playThrow(step);
  }

  draw() {
    // Close on the gorilla, pulling back only to show a throw.
    const throwing = this.mode === 'throw';
    const frame = throwing ? WIDE : CLOSE;
    const ctx = this.fitCanvas();
    if (!ctx) return;
    const { width, height } = this.canvas;
    const scale = Math.min(width / frame.width, height / frame.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.setTransform(
      scale,
      0,
      0,
      scale,
      (width - frame.width * scale) / 2,
      (height - frame.height * scale) / 2,
    );
    const gorilla: Gorilla = { ...frame.gorilla, building: 0 };
    this.drawRoof(ctx, gorilla.x - 6, gorilla.y + 30, 42);
    if (throwing) this.drawRoof(ctx, TARGET.x, TARGET.top, TARGET.width);
    this.actor.draw(ctx, gorilla, '#ffd8b0', this.time);
    if (throwing) this.drawBanana(ctx);
    this.effects.draw(ctx);
  }

  private fitCanvas(): CanvasRenderingContext2D | null {
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(this.canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(this.canvas.clientHeight * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    return this.canvas.getContext('2d');
  }

  private drawRoof(ctx: CanvasRenderingContext2D, x: number, top: number, width: number) {
    const colour = '#3a3350';
    const body = ctx.createLinearGradient(0, top, 0, top + 40);
    body.addColorStop(0, colour);
    body.addColorStop(1, withAlpha(colour, 0));
    ctx.fillStyle = body;
    ctx.fillRect(x, top, width, 40);
    ctx.fillStyle = shade(colour, 0.35);
    ctx.fillRect(x, top, width, 1.2);
  }

  /** Aims, throws, flies, bursts, and again. */
  private playThrow(delta: number) {
    const before = this.cycle;
    this.cycle = (this.cycle + delta) % THROW_CYCLE;
    if (this.cycle < before) {
      this.trail = [];
      this.burst = false;
    }
    if (this.cycle < 0.7) this.actor.setMood('aim');
    else if (this.cycle < 0.9) this.actor.setMood('throw');
    else this.actor.setMood('idle');
    this.actor.holdingBanana = this.cycle < 0.8;

    const flight = (this.cycle - 0.8) / FLIGHT_SECONDS;
    if (flight >= 0 && flight <= 1) {
      this.trail.push(this.bananaAt(flight));
      if (this.trail.length > 16) this.trail.shift();
    } else if (flight > 1 && !this.burst) {
      this.burst = true;
      const landing = this.bananaAt(1);
      const { outfit, accent } = this.actor.look;
      this.effects.explode(landing.x, landing.y, 7, '#3a3350', false, outfit.explosion, accent);
    } else if (this.trail.length > 0) {
      this.trail.shift();
    }
  }

  private bananaAt(share: number): Point {
    const start = { x: WIDE.gorilla.x + 8, y: WIDE.gorilla.y + 4 };
    const end = { x: TARGET.x + TARGET.width / 2, y: TARGET.top };
    return {
      x: start.x + (end.x - start.x) * share,
      y: start.y + (end.y - start.y) * share - Math.sin(share * Math.PI) * 44,
    };
  }

  private drawBanana(ctx: CanvasRenderingContext2D) {
    const { outfit, accent } = this.actor.look;
    drawTrail(ctx, this.trail, outfit.trail, accent, false, this.time);
    const flight = (this.cycle - 0.8) / FLIGHT_SECONDS;
    if (this.mode !== 'throw' || flight < 0 || flight > 1) return;
    const at = this.bananaAt(flight);
    ctx.save();
    ctx.translate(at.x, at.y);
    ctx.rotate(this.time * 13);
    ctx.scale(1.35, 1.35);
    drawBanana(ctx, outfit.banana, false, this.time);
    ctx.restore();
  }
}
