import { withAlpha } from './palette';

/**
 * Everything short-lived: sparks, concrete debris, smoke, fur, flashes,
 * shock rings, the glow of freshly carved holes and roof sections falling
 * away. All in world units.
 *
 * A thrower's explosion style from the wardrobe adds a flourish on top of
 * the blast (pixels, confetti, fireworks…); the blast itself, and the hole
 * it leaves, are the same for everyone.
 */
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  colour: string;
  angle: number;
  spin: number;
  /** Units per second squared pulling down; negative rises. */
  gravity: number;
  /** 1 = keeps its speed, lower slows down. */
  drag: number;
  shape: 'spark' | 'chunk' | 'puff' | 'tuft' | 'fire' | 'pixel' | 'confetti' | 'star' | 'blob';
  /** How strongly the wind carries it. */
  windy: number;
}

interface Flash {
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
  colour: string;
}

interface Ember {
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
}

interface FallingPiece {
  image: CanvasImageSource;
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
}

const EMBER_SECONDS = 4.5;

export class Effects {
  private particles: Particle[] = [];
  private flashes: Flash[] = [];
  private rings: Flash[] = [];
  private embers: Ember[] = [];
  private pieces: FallingPiece[] = [];

  /** A banana hitting a building. */
  explode(
    x: number,
    y: number,
    radius: number,
    facade: string,
    big = false,
    style = 'boom-classic',
    accent = '#ffd23f',
  ) {
    const scale = radius / 7;
    this.flashes.push({ x, y, radius: radius * 2.4, life: 0, maxLife: 0.22, colour: '#ffe2a0' });
    this.rings.push({ x, y, radius: radius * 2.4, life: 0, maxLife: 0.4, colour: '#ff9a4a' });
    for (let i = 0; i < 5 * scale; i++) this.fireball(x, y, radius);
    this.embers.push({ x, y, radius, life: 0, maxLife: EMBER_SECONDS });
    for (let i = 0; i < 22 * scale; i++) this.spark(x, y, 60 + Math.random() * 120 * scale);
    for (let i = 0; i < 10 * scale; i++) this.chunk(x, y, facade);
    for (let i = 0; i < 6 * scale; i++) this.smoke(x, y, radius);
    if (big) for (let i = 0; i < 16; i++) this.chunk(x, y, facade);
    this.flourish(style, x, y, radius, accent);
  }

  /** A gorilla hit: the big one, with the thrower's flourish. */
  gorillaBlast(
    x: number,
    y: number,
    fur: string,
    accent: string,
    facade: string,
    style = 'boom-classic',
    throwerAccent = accent,
  ) {
    this.flashes.push({ x, y, radius: 46, life: 0, maxLife: 0.35, colour: '#ffe6b0' });
    for (let i = 0; i < 14; i++) this.fireball(x, y, 16);
    this.rings.push({ x, y, radius: 60, life: 0, maxLife: 0.7, colour: accent });
    this.rings.push({ x, y, radius: 38, life: -0.08, maxLife: 0.6, colour: '#ffcf70' });
    this.embers.push({ x, y, radius: 16, life: 0, maxLife: EMBER_SECONDS * 1.3 });
    for (let i = 0; i < 60; i++) this.spark(x, y, 80 + Math.random() * 220);
    for (let i = 0; i < 26; i++) this.tuft(x, y, fur);
    for (let i = 0; i < 18; i++) this.chunk(x, y, facade);
    for (let i = 0; i < 20; i++) this.smoke(x, y, 20);
    this.flourish(style, x, y, 18, throwerAccent);
  }

  /** The extra something a wardrobe explosion style adds to a blast. */
  private flourish(style: string, x: number, y: number, radius: number, accent: string) {
    const amount = Math.round(radius * 2.4);
    const burst = (
      count: number,
      speed: [number, number],
      values: Omit<Partial<Particle>, 'colour'> & { colour: () => string },
    ) => {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const pace = speed[0] + Math.random() * (speed[1] - speed[0]);
        this.particles.push(
          this.make({
            x,
            y,
            vx: Math.cos(angle) * pace,
            vy: Math.sin(angle) * pace - 20,
            maxLife: 1 + Math.random() * 0.8,
            ...values,
            spin: (values.spin ?? 0) * (Math.random() * 2 - 1),
            colour: values.colour(),
          }),
        );
      }
    };
    switch (style) {
      case 'boom-pixel':
        burst(amount, [40, 110], {
          shape: 'pixel',
          size: 2.2,
          gravity: 120,
          drag: 0.95,
          colour: () => pickOf(['#ffe14d', '#ff8a3d', '#ff3f5a', accent]),
        });
        break;
      case 'boom-confetti':
        burst(amount * 1.5, [50, 130], {
          shape: 'confetti',
          size: 1.8,
          gravity: 40,
          drag: 0.9,
          spin: 14,
          maxLife: 2.2,
          colour: () => pickOf(['#ff4d6d', '#ffd23f', '#3fe0ff', '#7dff8a', '#b388ff']),
        });
        break;
      case 'boom-fireworks':
        for (const colour of [accent, '#fff2b0']) {
          const count = 24;
          for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const pace = colour === accent ? 110 : 70;
            this.particles.push(
              this.make({
                x,
                y,
                vx: Math.cos(angle) * pace,
                vy: Math.sin(angle) * pace,
                maxLife: 0.9,
                size: 1.4,
                colour,
                gravity: 50,
                drag: 0.94,
                shape: 'spark',
              }),
            );
          }
        }
        break;
      case 'boom-stars':
        burst(amount * 0.7, [30, 90], {
          shape: 'star',
          size: 2.6,
          gravity: 30,
          drag: 0.93,
          spin: 6,
          colour: () => pickOf(['#ffe680', '#fff6c8', accent]),
        });
        break;
      case 'boom-paint':
        burst(amount, [40, 120], {
          shape: 'blob',
          size: 2.4,
          gravity: 150,
          drag: 0.96,
          colour: () => pickOf([accent, '#ff4d9a', '#4dd2ff', '#ffd23f']),
        });
        break;
    }
  }

  /** A banana landing in the street. */
  dust(x: number, y: number) {
    for (let i = 0; i < 8; i++) this.smoke(x, y, 4);
  }

  /** A shield soaking up a hit. */
  shimmer(x: number, y: number, colour: string) {
    this.rings.push({ x, y, radius: 28, life: 0, maxLife: 0.5, colour });
    for (let i = 0; i < 24; i++) {
      this.spark(x, y, 60 + Math.random() * 80, colour);
    }
  }

  /** A balloon popping. */
  pop(x: number, y: number, colour: string) {
    this.flashes.push({ x, y, radius: 18, life: 0, maxLife: 0.2, colour: '#ffffff' });
    for (let i = 0; i < 18; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 60;
      this.particles.push(
        this.make({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          maxLife: 0.8 + Math.random() * 0.5,
          size: 1.6,
          colour: i % 2 ? colour : '#ffffff',
          gravity: 60,
          drag: 0.9,
          shape: 'chunk',
          spin: (Math.random() - 0.5) * 20,
        }),
      );
    }
  }

  /** A crate bursting into planks and splinters. */
  splinter(x: number, y: number, colour: string) {
    this.flashes.push({ x, y, radius: 14, life: 0, maxLife: 0.18, colour: '#fff4d8' });
    for (let i = 0; i < 16; i++) {
      const angle = -Math.PI * Math.random();
      const speed = 50 + Math.random() * 70;
      this.particles.push(
        this.make({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          maxLife: 0.9 + Math.random() * 0.6,
          size: 1.2 + Math.random() * 1.8,
          colour: i % 3 ? colour : '#ffe16a',
          gravity: 180,
          drag: 0.96,
          shape: 'chunk',
          spin: (Math.random() - 0.5) * 24,
        }),
      );
    }
  }

  /** A small puff where a banana leaves a gorilla's hand. */
  whoosh(x: number, y: number) {
    for (let i = 0; i < 5; i++) {
      this.particles.push(
        this.make({
          x,
          y,
          vx: (Math.random() - 0.5) * 30,
          vy: (Math.random() - 0.5) * 30,
          maxLife: 0.4,
          size: 2.5,
          colour: '#ffffff',
          gravity: 0,
          drag: 0.8,
          shape: 'puff',
        }),
      );
    }
  }

  /** A section of roof knocked loose by a Golden Banana, falling away. */
  dropPiece(image: CanvasImageSource, x: number, y: number, width: number, height: number) {
    this.pieces.push({
      image,
      x,
      y,
      width,
      height,
      vx: (Math.random() - 0.5) * 30,
      vy: -20,
      angle: 0,
      spin: (Math.random() - 0.5) * 2,
    });
  }

  update(delta: number, wind: number) {
    for (const particle of this.particles) {
      particle.life += delta;
      particle.vx = particle.vx * particle.drag ** (delta * 60) + wind * particle.windy * delta;
      particle.vy = particle.vy * particle.drag ** (delta * 60) + particle.gravity * delta;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.angle += particle.spin * delta;
    }
    this.particles = this.particles.filter((particle) => particle.life < particle.maxLife);
    for (const list of [this.flashes, this.rings, this.embers]) {
      for (const item of list) item.life += delta;
    }
    this.flashes = this.flashes.filter((flash) => flash.life < flash.maxLife);
    this.rings = this.rings.filter((ring) => ring.life < ring.maxLife);
    this.embers = this.embers.filter((ember) => ember.life < ember.maxLife);
    for (const piece of this.pieces) {
      piece.vy += 160 * delta;
      piece.x += piece.vx * delta;
      piece.y += piece.vy * delta;
      piece.angle += piece.spin * delta;
    }
    this.pieces = this.pieces.filter((piece) => piece.y < 420);
  }

  /** Glowing, cooling edges of fresh holes; drawn right over the city. */
  drawEmbers(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const ember of this.embers) {
      const heat = 1 - ember.life / ember.maxLife;
      const flicker = 0.85 + Math.random() * 0.15;
      const ring = ctx.createRadialGradient(
        ember.x,
        ember.y,
        ember.radius * 0.7,
        ember.x,
        ember.y,
        ember.radius + 2.5,
      );
      ring.addColorStop(0, withAlpha('#ff4a1a', 0));
      ring.addColorStop(0.55, withAlpha('#ff6a20', heat * heat * 0.9 * flicker));
      ring.addColorStop(0.8, withAlpha('#ffc060', heat * heat * heat * 0.8 * flicker));
      ring.addColorStop(1, withAlpha('#ff4a1a', 0));
      ctx.fillStyle = ring;
      ctx.beginPath();
      ctx.arc(ember.x, ember.y, ember.radius + 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const piece of this.pieces) {
      ctx.save();
      ctx.translate(piece.x + piece.width / 2, piece.y + piece.height / 2);
      ctx.rotate(piece.angle);
      ctx.drawImage(piece.image, -piece.width / 2, -piece.height / 2, piece.width, piece.height);
      ctx.restore();
    }

    for (const particle of this.particles) {
      const fade = 1 - particle.life / particle.maxLife;
      if (drawFlourishParticle(ctx, particle, fade)) continue;
      if (particle.shape === 'puff') {
        const radius = particle.size * (1 + (1 - fade) * 2.2);
        ctx.fillStyle = withAlpha(particle.colour, 0.42 * fade);
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
        ctx.fill();
      } else if (particle.shape === 'chunk' || particle.shape === 'tuft') {
        ctx.save();
        ctx.translate(particle.x, particle.y);
        ctx.rotate(particle.angle);
        ctx.fillStyle = withAlpha(particle.colour, Math.min(1, fade * 2));
        if (particle.shape === 'tuft') {
          ctx.beginPath();
          ctx.ellipse(0, 0, particle.size, particle.size * 0.45, 0, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size * 0.7);
        }
        ctx.restore();
      }
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const particle of this.particles) {
      if (particle.shape !== 'fire') continue;
      const progress = particle.life / particle.maxLife;
      const radius = particle.size * (0.6 + progress * 1.1);
      const flame = ctx.createRadialGradient(
        particle.x,
        particle.y,
        0,
        particle.x,
        particle.y,
        radius,
      );
      flame.addColorStop(0, withAlpha('#fff0b0', (1 - progress) * 0.9));
      flame.addColorStop(0.35, withAlpha('#ff9a30', (1 - progress) * 0.75));
      flame.addColorStop(1, withAlpha('#c02a10', 0));
      ctx.fillStyle = flame;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const particle of this.particles) {
      if (particle.shape !== 'spark') continue;
      const fade = 1 - particle.life / particle.maxLife;
      ctx.strokeStyle = withAlpha(particle.colour, fade);
      ctx.lineWidth = particle.size * fade + 0.3;
      ctx.beginPath();
      ctx.moveTo(particle.x, particle.y);
      ctx.lineTo(particle.x - particle.vx * 0.03, particle.y - particle.vy * 0.03);
      ctx.stroke();
    }
    for (const ring of this.rings) {
      if (ring.life < 0) continue;
      const progress = ring.life / ring.maxLife;
      ctx.strokeStyle = withAlpha(ring.colour, (1 - progress) * 0.45);
      ctx.lineWidth = 1.6 * (1 - progress) + 0.3;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.radius * easeOut(progress), 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const flash of this.flashes) {
      const progress = flash.life / flash.maxLife;
      const radius = flash.radius * (0.4 + 0.6 * easeOut(progress));
      const glow = ctx.createRadialGradient(flash.x, flash.y, 0, flash.x, flash.y, radius);
      glow.addColorStop(0, withAlpha(flash.colour, (1 - progress) * 0.8));
      glow.addColorStop(0.35, withAlpha('#ff8a30', (1 - progress) * 0.45));
      glow.addColorStop(1, withAlpha('#ff5010', 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(flash.x, flash.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** How bright the scene should flash right now, for lighting the sky and street. */
  get brightness(): number {
    return this.flashes.reduce(
      (sum, flash) => sum + (1 - flash.life / flash.maxLife) * (flash.radius / 70),
      0,
    );
  }

  clear() {
    this.particles = [];
    this.flashes = [];
    this.rings = [];
    this.embers = [];
    this.pieces = [];
  }

  private spark(x: number, y: number, speed: number, colour?: string) {
    const angle = Math.random() * Math.PI * 2;
    this.particles.push(
      this.make({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        maxLife: 0.35 + Math.random() * 0.45,
        size: 1.2,
        colour: colour ?? (Math.random() < 0.5 ? '#ffd27a' : '#ff8a3d'),
        gravity: 140,
        drag: 0.93,
        shape: 'spark',
      }),
    );
  }

  /** A rolling ball of flame that swells, reddens and fades. */
  private fireball(x: number, y: number, radius: number) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 8 + Math.random() * radius * 2.2;
    this.particles.push(
      this.make({
        x: x + Math.cos(angle) * radius * 0.3,
        y: y + Math.sin(angle) * radius * 0.3,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 10,
        maxLife: 0.45 + Math.random() * 0.35,
        size: radius * (0.35 + Math.random() * 0.35),
        colour: '#ff8a2a',
        gravity: -20,
        drag: 0.9,
        shape: 'fire',
      }),
    );
  }

  private chunk(x: number, y: number, facade: string) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
    const speed = 50 + Math.random() * 90;
    this.particles.push(
      this.make({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        maxLife: 1.6 + Math.random(),
        size: 1.2 + Math.random() * 1.8,
        colour: facade,
        gravity: 260,
        drag: 0.99,
        shape: 'chunk',
        spin: (Math.random() - 0.5) * 18,
      }),
    );
  }

  private smoke(x: number, y: number, radius: number) {
    this.particles.push(
      this.make({
        x: x + (Math.random() - 0.5) * radius,
        y: y + (Math.random() - 0.5) * radius,
        vx: (Math.random() - 0.5) * 12,
        vy: -8 - Math.random() * 14,
        maxLife: 1.8 + Math.random() * 1.4,
        size: 2 + Math.random() * radius * 0.4,
        colour: '#3a3036',
        gravity: -4,
        drag: 0.97,
        shape: 'puff',
        windy: 2.5,
      }),
    );
  }

  private tuft(x: number, y: number, fur: string) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 110;
    this.particles.push(
      this.make({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 50,
        maxLife: 1.4 + Math.random(),
        size: 2 + Math.random() * 2.2,
        colour: fur,
        gravity: 90,
        drag: 0.95,
        shape: 'tuft',
        spin: (Math.random() - 0.5) * 12,
        windy: 1.5,
      }),
    );
  }

  private make(values: Partial<Particle> & Pick<Particle, 'x' | 'y' | 'maxLife'>): Particle {
    return {
      vx: 0,
      vy: 0,
      life: 0,
      size: 1,
      colour: '#ffffff',
      angle: Math.random() * Math.PI,
      spin: 0,
      gravity: 0,
      drag: 1,
      shape: 'spark',
      windy: 0,
      ...values,
    };
  }
}

function easeOut(progress: number): number {
  return 1 - (1 - progress) ** 3;
}

function pickOf(colours: readonly string[]): string {
  return colours[Math.floor(Math.random() * colours.length)] ?? '#ffffff';
}

/** Draws the wardrobe flourish shapes; returns false for everything else. */
function drawFlourishParticle(
  ctx: CanvasRenderingContext2D,
  particle: Particle,
  fade: number,
): boolean {
  const alpha = Math.min(1, fade * 2);
  switch (particle.shape) {
    case 'pixel': {
      // Snapped to a coarse grid, like an old sprite breaking up.
      const size = particle.size;
      ctx.fillStyle = withAlpha(particle.colour, alpha);
      ctx.fillRect(
        Math.round(particle.x / size) * size,
        Math.round(particle.y / size) * size,
        size,
        size,
      );
      return true;
    }
    case 'confetti':
      ctx.save();
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.angle);
      ctx.scale(1, Math.cos(particle.angle * 2));
      ctx.fillStyle = withAlpha(particle.colour, alpha);
      ctx.fillRect(-particle.size / 2, -particle.size / 4, particle.size, particle.size / 2);
      ctx.restore();
      return true;
    case 'star': {
      ctx.save();
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.angle);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = withAlpha(particle.colour, alpha);
      ctx.beginPath();
      for (let point = 0; point < 10; point++) {
        const radius = point % 2 === 0 ? particle.size : particle.size * 0.45;
        const angle = (point / 10) * Math.PI * 2 - Math.PI / 2;
        ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      return true;
    }
    case 'blob':
      ctx.fillStyle = withAlpha(particle.colour, alpha);
      ctx.beginPath();
      ctx.ellipse(
        particle.x,
        particle.y,
        particle.size,
        particle.size * 0.75,
        particle.angle,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      return true;
    default:
      return false;
  }
}
