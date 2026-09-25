import { createRng, type Rng } from '@shared/rng';
import { STREET_Y, WORLD_WIDTH } from '../engine/constants';
import type { WorldId } from '../engine/worlds';
import { BACKDROP_MARGIN, type VisibleArea } from './backdrop';
import type { Rooftops } from './city';
import { withAlpha, type Palette } from './palette';

/**
 * The air over the city, which is also how players read the wind: clouds
 * drift with it, chimney smoke and rooftop flags lean into it and rain
 * slants with it. Plus fog and far-off lightning. Purely visual; none of it
 * touches the physics.
 */
export interface Weather {
  rain: boolean;
  fog: boolean;
  lightning: boolean;
}

interface Cloud {
  sprite: HTMLCanvasElement;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Nearer clouds move faster. */
  depth: number;
}

interface Drop {
  x: number;
  y: number;
  speed: number;
  length: number;
}

interface Puff {
  x: number;
  y: number;
  age: number;
  life: number;
  size: number;
}

interface Bolt {
  points: { x: number; y: number }[];
  age: number;
}

export function rollWeather(rng: Rng, world: WorldId, enabled: boolean): Weather {
  // No air on the Moon, so no weather either; Mars gets dust haze but never rain.
  if (!enabled || world === 'moon') return { rain: false, fog: false, lightning: false };
  if (world === 'mars') return { rain: false, fog: rng.chance(0.6), lightning: false };
  const rain = rng.chance(0.35);
  return { rain, fog: rng.chance(0.35), lightning: rain && rng.chance(0.6) };
}

export class Atmosphere {
  private clouds: Cloud[] = [];
  private drops: Drop[] = [];
  private smoke: Puff[] = [];
  private bolt: Bolt | null = null;
  private nextBolt: number;
  private smokeTimer = 0;
  private readonly rng: Rng;
  private readonly cloudSeed: number;
  /** Brightness of a lightning flash, 0..1. */
  flash = 0;

  constructor(
    seed: number,
    private readonly palette: Palette,
    readonly weather: Weather,
    private readonly world: WorldId,
    private readonly onThunder: () => void,
  ) {
    this.rng = createRng(seed);
    this.cloudSeed = seed + 11;
    this.nextBolt = this.rng.float(4, 9);
    if (world !== 'moon') this.makeClouds();
    if (weather.rain) {
      this.drops = Array.from({ length: 170 }, () => this.newDrop(true));
    }
  }

  update(delta: number, wind: number, rooftops: Rooftops, reducedMotion: boolean) {
    const drift = wind * 2.2 + (wind === 0 ? 0.6 : 0);
    const span = WORLD_WIDTH + BACKDROP_MARGIN * 2;
    for (const cloud of this.clouds) {
      cloud.x += drift * cloud.depth * delta;
      if (cloud.x > WORLD_WIDTH + BACKDROP_MARGIN) cloud.x -= span + cloud.width;
      if (cloud.x + cloud.width < -BACKDROP_MARGIN) cloud.x += span + cloud.width;
    }

    for (const drop of this.drops) {
      drop.y += drop.speed * delta;
      drop.x += wind * 9 * delta;
      if (drop.y > STREET_Y + 20) Object.assign(drop, this.newDrop(false));
    }

    this.smokeTimer -= delta;
    // Smoke needs air to rise in, which the Moon does not have.
    if (this.smokeTimer <= 0 && rooftops.chimneys.length > 0 && this.world !== 'moon') {
      this.smokeTimer = 0.18;
      for (const chimney of rooftops.chimneys) {
        this.smoke.push({
          x: chimney.x,
          y: chimney.y,
          age: 0,
          life: this.rng.float(2.4, 3.6),
          size: this.rng.float(1.2, 2),
        });
      }
    }
    for (const puff of this.smoke) {
      puff.age += delta;
      puff.x += wind * 2.4 * delta * Math.min(1, puff.age * 1.5);
      puff.y -= (6 - Math.min(4.5, Math.abs(wind) * 0.35)) * delta;
    }
    this.smoke = this.smoke.filter((puff) => puff.age < puff.life);

    this.flash = Math.max(0, this.flash - delta * 3.5);
    if (this.bolt) {
      this.bolt.age += delta;
      if (this.bolt.age > 0.35) this.bolt = null;
    }
    if (this.weather.lightning && !reducedMotion) {
      this.nextBolt -= delta;
      if (this.nextBolt <= 0) this.strike();
    }
  }

  drawClouds(ctx: CanvasRenderingContext2D) {
    for (const cloud of this.clouds) {
      ctx.drawImage(cloud.sprite, cloud.x, cloud.y, cloud.width, cloud.height);
    }
  }

  /** Far lightning sits behind the distant towers. */
  drawBolt(ctx: CanvasRenderingContext2D) {
    if (!this.bolt) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = withAlpha('#dfe8ff', 1 - this.bolt.age / 0.35);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    this.bolt.points.forEach((point, index) =>
      index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y),
    );
    ctx.stroke();
    ctx.restore();
  }

  drawFog(ctx: CanvasRenderingContext2D, area: VisibleArea, time: number) {
    if (!this.weather.fog) return;
    const band = ctx.createLinearGradient(0, 200, 0, STREET_Y);
    band.addColorStop(0, withAlpha(this.palette.haze, 0));
    band.addColorStop(0.6, withAlpha(this.palette.haze, 0.22 + Math.sin(time * 0.3) * 0.03));
    band.addColorStop(1, withAlpha(this.palette.haze, 0.3));
    ctx.fillStyle = band;
    ctx.fillRect(area.left, 200, area.right - area.left, STREET_Y - 200);
  }

  /** Smoke, flags and antenna lights on the rooftops. */
  drawRooftops(ctx: CanvasRenderingContext2D, rooftops: Rooftops, wind: number, time: number) {
    for (const puff of this.smoke) {
      const progress = puff.age / puff.life;
      ctx.fillStyle = withAlpha('#b8aab4', 0.28 * (1 - progress));
      ctx.beginPath();
      ctx.arc(puff.x, puff.y, puff.size * (1 + progress * 2.5), 0, Math.PI * 2);
      ctx.fill();
    }

    const direction = wind === 0 ? 1 : Math.sign(wind);
    const reach = 4 + Math.min(1, Math.abs(wind) / 10) * 4;
    const droop = 1 - Math.min(1, Math.abs(wind) / 8);
    for (const flag of rooftops.flags) {
      ctx.fillStyle = '#e8405a';
      ctx.beginPath();
      ctx.moveTo(flag.x, flag.y);
      for (let step = 0; step <= 6; step++) {
        const along = (step / 6) * reach;
        const wave = Math.sin(time * 9 - step * 0.9) * (0.4 + 0.6 * (1 - droop));
        ctx.lineTo(flag.x + along * direction, flag.y + along * droop * 1.2 + wave);
      }
      for (let step = 6; step >= 0; step--) {
        const along = (step / 6) * reach;
        const wave = Math.sin(time * 9 - step * 0.9) * (0.4 + 0.6 * (1 - droop));
        ctx.lineTo(flag.x + along * direction, flag.y + 3 + along * droop * 1.2 + wave);
      }
      ctx.fill();
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    rooftops.antennas.forEach((antenna, index) => {
      const on = Math.sin(time * 3 + index * 1.7) > 0.2;
      if (!on) return;
      const light = ctx.createRadialGradient(antenna.x, antenna.y, 0, antenna.x, antenna.y, 4);
      light.addColorStop(0, withAlpha('#ff4040', 0.9));
      light.addColorStop(1, withAlpha('#ff4040', 0));
      ctx.fillStyle = light;
      ctx.fillRect(antenna.x - 4, antenna.y - 4, 8, 8);
    });
    ctx.restore();
  }

  drawRain(ctx: CanvasRenderingContext2D, wind: number) {
    if (!this.weather.rain) return;
    ctx.strokeStyle = withAlpha('#c8d4ff', 0.28);
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (const drop of this.drops) {
      ctx.moveTo(drop.x, drop.y);
      ctx.lineTo(drop.x - wind * 0.35 * drop.length * 0.1, drop.y - drop.length);
    }
    ctx.stroke();
  }

  private strike() {
    this.nextBolt = this.rng.float(6, 14);
    this.flash = 0.35;
    const points = [{ x: this.rng.float(40, WORLD_WIDTH - 40), y: -20 }];
    while ((points.at(-1)?.y ?? 0) < 190) {
      const last = points.at(-1) ?? { x: 0, y: 0 };
      points.push({ x: last.x + this.rng.float(-9, 9), y: last.y + this.rng.float(10, 22) });
    }
    this.bolt = { points, age: 0 };
    this.onThunder();
  }

  private newDrop(anywhere: boolean): Drop {
    return {
      x: this.rng.float(-BACKDROP_MARGIN, WORLD_WIDTH + BACKDROP_MARGIN),
      y: anywhere ? this.rng.float(-80, STREET_Y) : this.rng.float(-120, -20),
      speed: this.rng.float(260, 360),
      length: this.rng.float(5, 9),
    };
  }

  private makeClouds() {
    const rng = createRng(this.cloudSeed);
    const count = 7;
    this.clouds = Array.from({ length: count }, (_, index) => {
      const width = rng.float(70, 150);
      const height = width * 0.32;
      return {
        sprite: paintCloud(rng, width, height, this.palette.cloud),
        x:
          -BACKDROP_MARGIN +
          (index / count) * (WORLD_WIDTH + BACKDROP_MARGIN * 2) +
          rng.float(-30, 30),
        y: rng.float(40, 170),
        width,
        height,
        depth: rng.float(0.6, 1.2),
      };
    });
  }
}

/** A soft cloud built from overlapping glowing puffs, painted once. */
function paintCloud(rng: Rng, width: number, height: number, colour: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const scale = 2;
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.scale(scale, scale);
  for (let puff = 0; puff < 9; puff++) {
    const x = rng.float(width * 0.15, width * 0.85);
    const y = rng.float(height * 0.35, height * 0.7);
    const radius = rng.float(height * 0.25, height * 0.5);
    const soft = ctx.createRadialGradient(x, y, 0, x, y, radius);
    soft.addColorStop(0, withAlpha(colour, 0.16));
    soft.addColorStop(1, withAlpha(colour, 0));
    ctx.fillStyle = soft;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  return canvas;
}
