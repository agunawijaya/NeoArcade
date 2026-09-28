import { createRng, type Rng } from '@shared/rng';
import type { TrailStyle } from '../garage';
import { withAlpha } from './palette';

/**
 * Little bits of life that live on the road: dust behind the wheels, mud
 * splashes, hay and sparks from a crash, the garage trail, confetti at the
 * finish. They sit in road coordinates (metres along, metres across, metres
 * up), so every view projects them its own way, and they never touch the game.
 */
export type ParticleKind =
  | 'dust'
  | 'mud'
  | 'hay'
  | 'spark'
  | 'heart'
  | 'note'
  | 'sparkle'
  | 'rainbow'
  | 'confetti'
  | 'petal';

export interface Particle {
  kind: ParticleKind;
  /** Metres along the road. */
  along: number;
  /** Metres across, from the middle of the road. */
  across: number;
  /** Metres up. */
  up: number;
  velocity: { along: number; across: number; up: number };
  age: number;
  life: number;
  /** Metres. */
  size: number;
  colour: string;
  spin: number;
}

const GRAVITY = 9;
const MAX_PARTICLES = 420;
const RAINBOW = ['#ff5e5e', '#ffb14a', '#ffe45c', '#5fd67a', '#4ab8ff', '#9a7bff'];
const CONFETTI = ['#ff7a3d', '#ffd23f', '#46a8e8', '#5cd6a6', '#e8364f', '#ffffff'];

export class Effects {
  particles: Particle[] = [];
  private readonly rng: Rng = createRng(0xd0e1);
  private trailClock = 0;

  update(seconds: number) {
    for (const particle of this.particles) {
      particle.age += seconds;
      particle.along += particle.velocity.along * seconds;
      particle.across += particle.velocity.across * seconds;
      particle.up += particle.velocity.up * seconds;
      if (FALLS.has(particle.kind)) particle.velocity.up -= GRAVITY * seconds;
      if (particle.up < 0 && FALLS.has(particle.kind)) {
        particle.up = 0;
        particle.velocity.up *= -0.3;
        particle.velocity.along *= 0.6;
        particle.velocity.across *= 0.6;
      }
      if (particle.kind === 'dust' || particle.kind === 'mud') particle.size *= 1 + seconds * 0.9;
    }
    this.particles = this.particles.filter((particle) => particle.age < particle.life);
  }

  clear() {
    this.particles = [];
  }

  /** Dust puffs from the rear wheels; more at speed. */
  wheels(
    nose: number,
    across: number,
    carLength: number,
    speed: number,
    seconds: number,
    muddy: boolean,
  ) {
    this.trailClock += seconds * (4 + speed * 0.5);
    while (this.trailClock >= 1) {
      this.trailClock -= 1;
      for (const side of [-0.7, 0.7]) {
        this.add({
          kind: muddy ? 'mud' : 'dust',
          along: nose - carLength + this.rng.float(-0.2, 0.2),
          across: across + side + this.rng.float(-0.1, 0.1),
          up: 0.1,
          velocity: {
            along: -this.rng.float(0.5, 2),
            across: side * this.rng.float(0.2, 0.8),
            up: this.rng.float(0.3, 1.2),
          },
          life: this.rng.float(0.4, 0.8),
          size: this.rng.float(0.12, 0.22),
          colour: muddy ? '#6e4a2c' : '#f6ead2',
        });
      }
    }
  }

  /** The garage trail, streaming from behind the car. */
  trail(style: TrailStyle, nose: number, across: number, carLength: number) {
    if (style === 'dust') return;
    const kind: ParticleKind =
      style === 'hearts'
        ? 'heart'
        : style === 'notes'
          ? 'note'
          : style === 'sparkles'
            ? 'sparkle'
            : 'rainbow';
    if (!this.rng.chance(style === 'rainbow' ? 0.9 : 0.35)) return;
    this.add({
      kind,
      along: nose - carLength - 0.2,
      across: across + (style === 'rainbow' ? 0 : this.rng.float(-0.6, 0.6)),
      up: style === 'rainbow' ? 0.35 : this.rng.float(0.4, 1.1),
      velocity: {
        along: -0.4,
        across: this.rng.float(-0.2, 0.2),
        up: style === 'rainbow' ? 0 : 0.6,
      },
      life: style === 'rainbow' ? 0.5 : 0.9,
      size: style === 'rainbow' ? 1.3 : 0.4,
      colour:
        style === 'hearts'
          ? '#ff5e8a'
          : style === 'notes'
            ? '#fff3c4'
            : style === 'sparkles'
              ? '#fff8d6'
              : '#ffffff',
    });
  }

  splash(along: number, across: number) {
    this.burst(along, across, 'mud', 14, ['#6e4a2c', '#8a6040', '#4d321e'], 2.5);
  }

  /** Hay, sparks and dust flung up by a crash. */
  crash(along: number, across: number) {
    this.burst(along, across, 'hay', 26, ['#f2cf6b', '#e0b54c', '#fff0a8'], 6);
    this.burst(along, across, 'spark', 18, ['#fff4c2', '#ffb347', '#ffffff'], 8);
    this.burst(along, across, 'dust', 10, ['#e8d2ae'], 2);
  }

  confetti(along: number, width: number) {
    for (let index = 0; index < 60; index++) {
      this.add({
        kind: 'confetti',
        along: along + this.rng.float(-2, 6),
        across: this.rng.float(-width, width),
        up: this.rng.float(2, 5),
        velocity: {
          along: this.rng.float(-1, 1),
          across: this.rng.float(-1, 1),
          up: this.rng.float(0, 3),
        },
        life: 2.2,
        size: 0.16,
        colour: this.rng.pick(CONFETTI),
      });
    }
  }

  petals(along: number, across: number) {
    this.burst(along, across, 'petal', 8, ['#ffd6e8', '#fff3a8', '#ffffff'], 2);
  }

  private burst(
    along: number,
    across: number,
    kind: ParticleKind,
    count: number,
    colours: string[],
    force: number,
  ) {
    for (let index = 0; index < count; index++) {
      this.add({
        kind,
        along: along + this.rng.float(-0.5, 0.5),
        across: across + this.rng.float(-0.5, 0.5),
        up: this.rng.float(0.2, 1.2),
        velocity: {
          along: this.rng.float(-force, force) * 0.6,
          across: this.rng.float(-force, force),
          up: this.rng.float(force * 0.3, force),
        },
        life: this.rng.float(0.6, 1.4),
        size: kind === 'hay' ? this.rng.float(0.15, 0.35) : this.rng.float(0.06, 0.14),
        colour: this.rng.pick(colours),
      });
    }
  }

  private add(particle: Omit<Particle, 'age' | 'spin'>) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push({ ...particle, age: 0, spin: this.rng.float(-6, 6) });
  }
}

const FALLS = new Set<ParticleKind>(['hay', 'spark', 'mud', 'confetti', 'petal']);

/** How opaque a particle is as it ages: quick in, slow out. */
export function particleAlpha(particle: Particle): number {
  const t = particle.age / particle.life;
  return Math.min(1, t * 8) * (1 - t) * (particle.kind === 'dust' ? 0.4 : 1);
}

export const RAINBOW_COLOURS = RAINBOW;

/** Draws one particle at a screen point, `scale` pixels per metre, `fade` for extra transparency. */
export function drawParticle(
  ctx: CanvasRenderingContext2D,
  particle: Particle,
  x: number,
  y: number,
  scale: number,
  fade = 1,
) {
  const alpha = particleAlpha(particle) * fade;
  if (alpha <= 0.01) return;
  const size = Math.max(1, particle.size * scale);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  switch (particle.kind) {
    case 'dust': {
      // A soft puff with no edge, so it reads as dust rather than a bubble.
      const puff = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
      puff.addColorStop(0, particle.colour);
      puff.addColorStop(1, withAlpha(particle.colour, 0));
      ctx.fillStyle = puff;
      ctx.fillRect(-size, -size, size * 2, size * 2);
      break;
    }
    case 'mud':
      ctx.fillStyle = particle.colour;
      ctx.beginPath();
      ctx.arc(0, 0, size, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'hay':
    case 'confetti':
      ctx.rotate(particle.spin * particle.age);
      ctx.fillStyle = particle.colour;
      ctx.fillRect(-size, -size * 0.25, size * 2, size * 0.5);
      break;
    case 'spark':
    case 'sparkle':
      ctx.rotate(particle.spin * particle.age * 0.3);
      ctx.fillStyle = particle.colour;
      star(ctx, size * 1.4, size * 0.4);
      break;
    case 'heart':
      ctx.fillStyle = particle.colour;
      heart(ctx, size);
      break;
    case 'note':
      ctx.fillStyle = particle.colour;
      ctx.strokeStyle = particle.colour;
      ctx.lineWidth = Math.max(1, size * 0.18);
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 0.45, size * 0.33, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(size * 0.4, 0);
      ctx.lineTo(size * 0.4, -size * 1.3);
      ctx.lineTo(size * 0.9, -size * 1.0);
      ctx.stroke();
      break;
    case 'rainbow':
      RAINBOW.forEach((colour, band) => {
        ctx.fillStyle = colour;
        ctx.fillRect(-size / 2, (band - 3) * size * 0.08, size, size * 0.08);
      });
      break;
    case 'petal':
      ctx.rotate(particle.spin * particle.age);
      ctx.fillStyle = particle.colour;
      ctx.beginPath();
      ctx.ellipse(0, 0, size, size * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
  ctx.restore();
}

function star(ctx: CanvasRenderingContext2D, outer: number, inner: number) {
  ctx.beginPath();
  for (let point = 0; point < 8; point++) {
    const radius = point % 2 === 0 ? outer : inner;
    const angle = (point * Math.PI) / 4;
    ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  ctx.closePath();
  ctx.fill();
}

function heart(ctx: CanvasRenderingContext2D, size: number) {
  ctx.beginPath();
  ctx.moveTo(0, size * 0.35);
  ctx.bezierCurveTo(-size * 1.1, -size * 0.3, -size * 0.4, -size * 1.1, 0, -size * 0.45);
  ctx.bezierCurveTo(size * 0.4, -size * 1.1, size * 1.1, -size * 0.3, 0, size * 0.35);
  ctx.fill();
}
