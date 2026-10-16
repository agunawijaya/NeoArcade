import { createRng } from '@shared/rng';
import { paintCloudCanvas, devicePixel } from '../cloud-art';
import type { Cloud } from '../clouds';
import type { Palette } from '../palette';
import type { SideCamera } from './camera';

/** Paints the sky behind everything: gradient, sun or moon, stars, and the cloud layers behind the play. */
export class SkyPainter {
  private readonly cloudCache = new Map<string, HTMLCanvasElement>();
  private readonly stars: { x: number; y: number; size: number; twinkle: number }[];

  constructor(seed: number) {
    const rng = createRng(`mind-the-ox:stars:${seed}`);
    this.stars = Array.from({ length: 140 }, () => ({
      x: rng.next(),
      y: rng.next() ** 1.6,
      size: rng.float(0.4, 1.4),
      twinkle: rng.float(0, Math.PI * 2),
    }));
  }

  paintSky(
    ctx: CanvasRenderingContext2D,
    camera: SideCamera,
    palette: Palette,
    time: number,
    sunBoost: number,
  ) {
    const { width, height } = camera.viewport;
    const horizon = camera.y(40);
    const gradient = ctx.createLinearGradient(0, 0, 0, Math.max(horizon, 1));
    gradient.addColorStop(0, palette.sky[0]);
    gradient.addColorStop(0.55, palette.sky[1]);
    gradient.addColorStop(1, palette.sky[2]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    if (palette.stars) this.paintStars(ctx, camera, time);
    this.paintSun(ctx, camera, palette, sunBoost);
  }

  private paintStars(ctx: CanvasRenderingContext2D, camera: SideCamera, time: number) {
    const { width } = camera.viewport;
    const drift = (camera.centreX * 0.04) % width;
    const top = camera.bandTop;
    const depth = camera.y(80) - top;
    for (const star of this.stars) {
      const x = (((star.x * width - drift) % width) + width) % width;
      const y = top + star.y * depth;
      const glow = 0.55 + 0.45 * Math.sin(time * 1.7 + star.twinkle);
      ctx.fillStyle = `rgba(255, 250, 230, ${(0.35 + glow * 0.5).toFixed(3)})`;
      ctx.fillRect(x, y, star.size, star.size);
    }
  }

  private paintSun(
    ctx: CanvasRenderingContext2D,
    camera: SideCamera,
    palette: Palette,
    boost: number,
  ) {
    const { width } = camera.viewport;
    const x = width * palette.sun.x;
    const y = camera.bandTop + (camera.bandBottom - camera.bandTop) * palette.sun.y;
    const radius = Math.min(width, camera.bandBottom - camera.bandTop) * 0.045 * (1 + boost * 0.8);
    const glow = ctx.createRadialGradient(x, y, radius * 0.6, x, y, radius * (6 + boost * 10));
    glow.addColorStop(0, palette.sun.glow);
    glow.addColorStop(1, 'rgba(255, 240, 200, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, radius * (6 + boost * 10), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = palette.sun.body;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    if (palette.sun.moon) {
      ctx.fillStyle = 'rgba(150, 160, 190, 0.35)';
      for (const [dx, dy, size] of [
        [-0.3, -0.2, 0.22],
        [0.25, 0.1, 0.16],
        [-0.05, 0.35, 0.12],
      ] as const) {
        ctx.beginPath();
        ctx.arc(x + dx * radius, y + dy * radius, size * radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /** Clouds whose parallax is in [from, to). */
  paintClouds(
    ctx: CanvasRenderingContext2D,
    camera: SideCamera,
    palette: Palette,
    clouds: readonly Cloud[],
    from: number,
    to: number,
    alpha = 1,
  ) {
    const { width } = camera.viewport;
    for (const cloud of clouds) {
      if (cloud.parallax < from || cloud.parallax >= to) continue;
      const x = camera.parallaxX(cloud.x, cloud.parallax);
      const reach = cloud.reach * camera.scale;
      if (x < -reach || x > width + reach) continue;
      const image = this.cloudImage(
        cloud,
        camera.scale,
        palette,
        Math.max(0, 0.55 - cloud.parallax * 0.6),
      );
      const y = camera.y(cloud.y);
      ctx.globalAlpha = alpha;
      ctx.drawImage(
        image,
        x - image.width / 2 / devicePixel,
        y - image.height / 2 / devicePixel,
        image.width / devicePixel,
        image.height / devicePixel,
      );
      ctx.globalAlpha = 1;
    }
  }

  private cloudImage(
    cloud: Cloud,
    scale: number,
    palette: Palette,
    haze: number,
  ): HTMLCanvasElement {
    const key = `${cloud.id}:${Math.round(scale * 4)}:${palette.lighting}:${palette.theme}`;
    const cached = this.cloudCache.get(key);
    if (cached) return cached;
    if (this.cloudCache.size > 160) this.cloudCache.clear();
    const image = paintCloudCanvas(cloud, scale * devicePixel, palette, haze);
    this.cloudCache.set(key, image);
    return image;
  }
}
