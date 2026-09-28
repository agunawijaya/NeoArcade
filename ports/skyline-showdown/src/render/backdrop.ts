import { createRng, type Rng } from '@shared/rng';
import { STREET_Y, WORLD_HEIGHT, WORLD_WIDTH } from '../engine/constants';
import type { WorldId } from '../engine/worlds';
import type { CityKit, Horizon, Silhouette } from './kits';
import { shade, withAlpha, type Palette } from './palette';

/**
 * Everything behind the playable city: the sky, stars, two layers of distant
 * skyline that drift with the camera, and the street out front. The skylines
 * reach past both edges of the playfield so wide screens never see a gap.
 */
export const BACKDROP_MARGIN = 260;

export interface VisibleArea {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
}

/** One street lamp's pool of light, painted once and stamped along the street. */
const LAMP_GLOW = paintLampGlow();

function paintLampGlow(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  glow.addColorStop(0, withAlpha('#ffcf8a', 0.5));
  glow.addColorStop(1, withAlpha('#ffcf8a', 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 64, 64);
  return canvas;
}

export class Backdrop {
  private readonly far = document.createElement('canvas');
  private readonly mid = document.createElement('canvas');
  private readonly stars: Star[];
  private readonly seed: number;
  private scale = 1;

  constructor(
    seed: number,
    private readonly palette: Palette,
    private readonly world: WorldId,
    private readonly kit: CityKit,
  ) {
    this.seed = seed;
    const rng = createRng(seed);
    this.stars = Array.from({ length: 170 }, () => ({
      x: rng.float(-BACKDROP_MARGIN, WORLD_WIDTH + BACKDROP_MARGIN),
      y: rng.float(-120, 250),
      size: rng.float(0.3, 1.1),
      phase: rng.float(0, Math.PI * 2),
    }));
  }

  render(scale: number) {
    this.scale = scale;
    const rng = createRng(this.seed + 1);
    // Cities with something on the horizon keep their far towers low enough to show it.
    const lowFar = this.kit.horizon === 'pyramids' || this.kit.horizon === 'dunes';
    this.paintSkyline(this.far, rng, {
      colour: this.palette.farCity,
      minHeight: lowFar ? 40 : 90,
      maxHeight: lowFar ? 130 : 250,
      windows: 0.25,
      haze: 0.55,
      horizon: this.kit.horizon,
    });
    this.paintSkyline(this.mid, rng, {
      colour: this.palette.midCity,
      minHeight: 50,
      maxHeight: 170,
      windows: 0.45,
      haze: 0.3,
      horizon: 'none',
    });
  }

  drawSky(ctx: CanvasRenderingContext2D, area: VisibleArea, time: number, flash: number) {
    const { palette } = this;
    const sky = ctx.createLinearGradient(0, area.top, 0, STREET_Y);
    sky.addColorStop(0, palette.skyTop);
    sky.addColorStop(0.55, palette.skyMiddle);
    sky.addColorStop(1, palette.skyHorizon);
    ctx.fillStyle = sky;
    ctx.fillRect(area.left, area.top, area.right - area.left, STREET_Y - area.top + 1);

    if (this.world === 'jupiter') this.drawCloudBands(ctx, area, time);

    const glow = ctx.createRadialGradient(
      WORLD_WIDTH / 2,
      STREET_Y + 40,
      20,
      WORLD_WIDTH / 2,
      STREET_Y + 40,
      460,
    );
    glow.addColorStop(0, withAlpha(palette.horizonGlow, 0.55));
    glow.addColorStop(1, withAlpha(palette.horizonGlow, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(area.left, area.top, area.right - area.left, STREET_Y - area.top);

    if (palette.stars > 0.02) {
      for (const star of this.stars) {
        const twinkle = 0.55 + 0.45 * Math.sin(time * 1.3 + star.phase * 3);
        const fadeTowardsHorizon = Math.max(0, 1 - (star.y + 120) / 330);
        ctx.fillStyle = withAlpha('#ffffff', palette.stars * twinkle * fadeTowardsHorizon);
        ctx.fillRect(star.x, star.y, star.size, star.size);
      }
    }

    if (flash > 0) {
      ctx.fillStyle = withAlpha('#dfe6ff', Math.min(0.5, flash));
      ctx.fillRect(area.left, area.top, area.right - area.left, STREET_Y - area.top);
    }
  }

  /** Far and middle skylines, shifted a little with the camera for depth. */
  drawFar(ctx: CanvasRenderingContext2D, shiftX: number) {
    ctx.drawImage(
      this.far,
      -BACKDROP_MARGIN + shiftX * 0.6,
      0,
      WORLD_WIDTH + BACKDROP_MARGIN * 2,
      WORLD_HEIGHT,
    );
  }

  drawMid(ctx: CanvasRenderingContext2D, shiftX: number) {
    ctx.drawImage(
      this.mid,
      -BACKDROP_MARGIN + shiftX * 0.3,
      0,
      WORLD_WIDTH + BACKDROP_MARGIN * 2,
      WORLD_HEIGHT,
    );
  }

  drawStreet(ctx: CanvasRenderingContext2D, area: VisibleArea, wet: boolean, time: number) {
    const { palette } = this;
    ctx.fillStyle = palette.street;
    ctx.fillRect(area.left, STREET_Y, area.right - area.left, area.bottom - STREET_Y + 1);
    ctx.fillStyle = withAlpha(palette.rimLight, 0.2);
    ctx.fillRect(area.left, STREET_Y, area.right - area.left, 0.6);

    // Street lamps are off in daylight.
    const lampLight = 1 - palette.daylight;
    if (lampLight <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = lampLight;
    for (let x = Math.floor(area.left / 64) * 64 + 20; x < area.right; x += 64) {
      ctx.drawImage(LAMP_GLOW, x - 16, STREET_Y - 14, 32, 32);
      if (wet) {
        // Rain turns the street into a mirror for the lamps.
        const shimmer = 0.15 + 0.05 * Math.sin(time * 3 + x);
        ctx.fillStyle = withAlpha('#ffcf8a', shimmer);
        ctx.fillRect(x - 0.8, STREET_Y + 3, 1.6, 10);
      }
    }
    ctx.restore();
  }

  private drawCloudBands(ctx: CanvasRenderingContext2D, area: VisibleArea, time: number) {
    const bands = ['#e8b884', '#b8745a', '#f2d0a0', '#9a5a4a', '#e0a878'];
    bands.forEach((colour, index) => {
      const y = 10 + index * 38 + Math.sin(time * 0.1 + index) * 2;
      const height = 18 + (index % 2) * 10;
      // Soft-edged bands, like weather seen through a thick atmosphere.
      const band = ctx.createLinearGradient(0, y, 0, y + height);
      band.addColorStop(0, withAlpha(colour, 0));
      band.addColorStop(0.5, withAlpha(colour, 0.14));
      band.addColorStop(1, withAlpha(colour, 0));
      ctx.fillStyle = band;
      ctx.fillRect(area.left, y, area.right - area.left, height);
    });
    // The Great Red Spot, low over the far towers.
    ctx.fillStyle = withAlpha('#c05a3a', 0.2);
    ctx.beginPath();
    ctx.ellipse(470 + Math.sin(time * 0.05) * 6, 128, 34, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private paintSkyline(
    canvas: HTMLCanvasElement,
    rng: Rng,
    layer: {
      colour: string;
      minHeight: number;
      maxHeight: number;
      windows: number;
      haze: number;
      horizon: Horizon;
    },
  ) {
    const width = WORLD_WIDTH + BACKDROP_MARGIN * 2;
    canvas.width = Math.ceil(width * this.scale);
    canvas.height = Math.ceil(WORLD_HEIGHT * this.scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.clearRect(0, 0, width, WORLD_HEIGHT);

    ctx.fillStyle = shade(layer.colour, 0.08);
    paintHorizon(ctx, layer.horizon, width);
    const shapes = this.kit.skyline;

    for (let x = -10; x < width;) {
      const buildingWidth = rng.float(16, 44);
      const height = rng.float(layer.minHeight, layer.maxHeight);
      const top = STREET_Y - height;
      ctx.fillStyle = shade(layer.colour, rng.float(-0.1, 0.08));
      this.paintSilhouette(ctx, rng.pick(shapes), x, top, buildingWidth);

      ctx.fillStyle = withAlpha(rng.pick(this.palette.windowLit), 0.55);
      for (let wy = top + 5; wy < STREET_Y - 4; wy += 6) {
        for (let wx = x + 2.5; wx < x + buildingWidth - 2.5; wx += 4.5) {
          if (rng.chance(layer.windows * 0.35)) ctx.fillRect(wx, wy, 1.4, 2);
        }
      }
      x += buildingWidth + rng.float(-4, 3);
    }

    // Haze thickens towards the street, pushing the layer back into the distance.
    const haze = ctx.createLinearGradient(0, 120, 0, STREET_Y);
    haze.addColorStop(0, withAlpha(this.palette.haze, 0));
    haze.addColorStop(1, withAlpha(this.palette.haze, layer.haze));
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, width, WORLD_HEIGHT);
    ctx.globalCompositeOperation = 'source-over';
  }

  private paintSilhouette(
    ctx: CanvasRenderingContext2D,
    shape: Silhouette,
    x: number,
    top: number,
    width: number,
  ) {
    ctx.fillRect(x, top, width, STREET_Y - top);
    switch (shape) {
      case 'spire':
        ctx.beginPath();
        ctx.moveTo(x + width * 0.3, top);
        ctx.lineTo(x + width / 2, top - width * 0.9);
        ctx.lineTo(x + width * 0.7, top);
        ctx.fill();
        break;
      case 'dome':
        ctx.beginPath();
        ctx.arc(x + width / 2, top, width / 2, Math.PI, 0);
        ctx.fill();
        break;
      case 'stepped':
        ctx.fillRect(x + width * 0.2, top - 8, width * 0.6, 8);
        ctx.fillRect(x + width * 0.38, top - 14, width * 0.24, 6);
        break;
      case 'tower':
        ctx.fillRect(x + width / 2 - 0.3, top - 10, 0.6, 10);
        break;
      case 'needle':
        ctx.fillRect(x + width * 0.25, top - 12, width * 0.5, 12);
        ctx.beginPath();
        ctx.moveTo(x + width * 0.4, top - 12);
        ctx.lineTo(x + width / 2, top - 12 - width * 1.6);
        ctx.lineTo(x + width * 0.6, top - 12);
        ctx.fill();
        break;
      case 'minaret': {
        const column = x + width * 0.75;
        ctx.fillRect(column - 1.6, top - 28, 3.2, 28);
        ctx.fillRect(column - 2.6, top - 20, 5.2, 1.4);
        ctx.beginPath();
        ctx.moveTo(column - 1.8, top - 28);
        ctx.lineTo(column, top - 34);
        ctx.lineTo(column + 1.8, top - 28);
        ctx.fill();
        break;
      }
      case 'deco':
        ctx.fillRect(x + width * 0.15, top - 9, width * 0.7, 9);
        ctx.fillRect(x + width * 0.3, top - 17, width * 0.4, 8);
        ctx.beginPath();
        ctx.moveTo(x + width * 0.38, top - 17);
        ctx.lineTo(x + width / 2, top - 32);
        ctx.lineTo(x + width * 0.62, top - 17);
        ctx.fill();
        break;
      case 'mast': {
        const middle = x + width / 2;
        ctx.fillRect(middle - 0.4, top - 30, 0.8, 30);
        for (let bar = 6; bar < 30; bar += 7) ctx.fillRect(middle - 2.5, top - bar, 5, 0.6);
        break;
      }
      case 'house':
        ctx.beginPath();
        ctx.moveTo(x - 1, top);
        ctx.lineTo(x + width / 2, top - width * 0.35);
        ctx.lineTo(x + width + 1, top);
        ctx.fill();
        break;
    }
  }
}

/** What rises behind a city's far towers: peaks, pyramids, dunes, mesas or crater rims. */
function paintHorizon(ctx: CanvasRenderingContext2D, horizon: Horizon, width: number) {
  const ground = STREET_Y;
  ctx.beginPath();
  switch (horizon) {
    case 'none':
      return;
    case 'mountains':
      // A steep, rounded rock and a long wooded ridge.
      ctx.moveTo(width * 0.52, ground);
      ctx.bezierCurveTo(width * 0.55, 150, width * 0.58, 70, width * 0.62, 72);
      ctx.bezierCurveTo(width * 0.66, 74, width * 0.67, 150, width * 0.7, ground);
      ctx.moveTo(width * 0.05, ground);
      ctx.bezierCurveTo(width * 0.15, 120, width * 0.3, 100, width * 0.4, 150);
      ctx.bezierCurveTo(width * 0.45, 170, width * 0.48, 200, width * 0.52, ground);
      ctx.moveTo(width * 0.72, ground);
      ctx.bezierCurveTo(width * 0.8, 130, width * 0.9, 110, width * 0.98, ground);
      break;
    case 'pyramids':
      for (const [middle, half, height] of [
        [0.3, 70, 120],
        [0.42, 52, 92],
        [0.72, 60, 105],
      ] as const) {
        ctx.moveTo(width * middle - half, ground);
        ctx.lineTo(width * middle, ground - height - 60);
        ctx.lineTo(width * middle + half, ground);
      }
      break;
    case 'dunes':
      ctx.moveTo(0, ground);
      for (let x = 0; x <= width; x += 60) {
        ctx.quadraticCurveTo(x + 30, ground - 120 - Math.sin(x) * 20, x + 60, ground - 80);
      }
      ctx.lineTo(width, ground);
      break;
    case 'mesas':
      for (const [left, right, top] of [
        [0.05, 0.28, 150],
        [0.55, 0.75, 170],
        [0.8, 0.95, 140],
      ] as const) {
        ctx.moveTo(width * left, ground);
        ctx.lineTo(width * left + 20, top);
        ctx.lineTo(width * right - 20, top);
        ctx.lineTo(width * right, ground);
      }
      break;
    case 'craterRims':
      ctx.moveTo(0, ground);
      for (let x = 0; x <= width; x += 90) {
        ctx.quadraticCurveTo(x + 20, ground - 180, x + 45, ground - 170);
        ctx.quadraticCurveTo(x + 70, ground - 180, x + 90, ground - 120);
      }
      ctx.lineTo(width, ground);
      break;
  }
  ctx.closePath();
  ctx.fill();
}
