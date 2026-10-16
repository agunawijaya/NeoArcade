/**
 * Smoke, fire, sparks, feathers and the like: everything that only exists
 * to be looked at. They live in world units, like the engine's objects, so
 * both views can draw them, but they never touch the game.
 */
export type ParticleKind =
  | 'smoke'
  | 'puff'
  | 'fire'
  | 'spark'
  | 'dirt'
  | 'splinter'
  | 'feather'
  | 'flash'
  | 'ring'
  | 'parachute'
  | 'confetti'
  | 'flour'
  | 'contrail'
  | 'spray'
  | 'column';

export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  /** World units per second. */
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  spin: number;
  seed: number;
  /** For smoke: 0 pale … 1 black. */
  darkness: number;
  /** A colour for contrails; "friend" or "foe" for a parachute's canopy. */
  tint?: string;
}

const GRAVITY: Readonly<Record<ParticleKind, number>> = {
  smoke: -4,
  puff: -2,
  fire: -10,
  spark: 70,
  dirt: 95,
  splinter: 80,
  feather: 5,
  flash: 0,
  ring: 0,
  parachute: 0,
  confetti: 18,
  flour: 60,
  contrail: 0,
  spray: 70,
  column: 0,
};

const DRAG: Readonly<Record<ParticleKind, number>> = {
  smoke: 1.4,
  puff: 3,
  fire: 2.2,
  spark: 0.6,
  dirt: 0.3,
  splinter: 0.5,
  feather: 3.5,
  flash: 0,
  ring: 0,
  parachute: 2,
  confetti: 2.6,
  flour: 1.2,
  contrail: 0.5,
  spray: 0.4,
  column: 0,
};

const MAX_PARTICLES = 1400;

export class ParticleSystem {
  readonly particles: Particle[] = [];
  private seed = 1;

  /** A cheap repeatable random number for spreading particles; looks only. */
  random(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }

  spread(range: number): number {
    return (this.random() * 2 - 1) * range;
  }

  emit(
    particle: Omit<Particle, 'age' | 'seed' | 'spin' | 'darkness'> &
      Partial<Pick<Particle, 'spin' | 'darkness'>>,
  ) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push({
      spin: this.spread(6),
      darkness: 0.5,
      ...particle,
      age: 0,
      seed: Math.floor(this.random() * 1000),
    });
  }

  update(seconds: number, ground: (x: number) => number) {
    let kept = 0;
    for (const particle of this.particles) {
      particle.age += seconds;
      if (particle.age >= particle.life) continue;
      const drag = Math.max(0, 1 - DRAG[particle.kind] * seconds);
      particle.vx *= drag;
      particle.vy = particle.vy * drag - GRAVITY[particle.kind] * seconds;
      if (particle.kind === 'parachute') particle.vy = -7 + Math.sin(particle.age * 1.3) * 1.2;
      if (particle.kind === 'feather' || particle.kind === 'confetti')
        particle.vx += Math.sin(particle.age * 6 + particle.seed) * 12 * seconds;
      particle.x += particle.vx * seconds;
      particle.y += particle.vy * seconds;
      const floor = ground(particle.x);
      if (particle.y < floor) {
        if (
          particle.kind === 'dirt' ||
          particle.kind === 'flour' ||
          particle.kind === 'spark' ||
          particle.kind === 'splinter' ||
          particle.kind === 'spray'
        )
          continue;
        if (
          particle.kind === 'parachute' ||
          particle.kind === 'feather' ||
          particle.kind === 'confetti'
        ) {
          particle.y = floor;
          particle.vx = 0;
          particle.vy = 0;
        }
      }
      this.particles[kept++] = particle;
    }
    this.particles.length = kept;
  }

  clear() {
    this.particles.length = 0;
  }
}
