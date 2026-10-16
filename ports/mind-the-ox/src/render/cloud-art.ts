import type { Cloud } from './clouds';
import type { Palette } from './palette';
import { mix, withAlpha } from './side/colour';

/** Canvas backing stores are drawn at device resolution for crisp edges. */
export const devicePixel =
  typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio || 1);

/**
 * A gouache cumulus: a shaded underside, a sunlit body offset up from it,
 * a bright rim on top, all from the same circles.
 */
export function paintCloudCanvas(
  cloud: Cloud,
  pixelsPerUnit: number,
  palette: Palette,
  haze: number,
): HTMLCanvasElement {
  const light = mix(palette.cloud.light, palette.sky[1], haze);
  const shadow = mix(palette.cloud.shade, palette.sky[1], haze * 0.7);
  const rim = mix(palette.cloud.rim, palette.sky[1], haze);
  const size = Math.ceil(cloud.reach * 2.4 * pixelsPerUnit);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const unit = pixelsPerUnit;
  const centre = size / 2;
  const puff = (offsetY: number, grow: number) => {
    ctx.beginPath();
    for (const { dx, dy, radius } of cloud.puffs) {
      ctx.moveTo(centre + dx * unit + radius * grow * unit, centre - (dy + offsetY) * unit);
      ctx.arc(
        centre + dx * unit,
        centre - (dy + offsetY) * unit,
        radius * grow * unit,
        0,
        Math.PI * 2,
      );
    }
    ctx.fill();
  };
  ctx.fillStyle = shadow;
  puff(-1.2, 1);
  ctx.fillStyle = light;
  puff(0.9, 0.9);
  // Sunlit tops by day; at night only a thin silver edge where the moon catches them.
  const night = palette.daylight < 0.5;
  ctx.fillStyle = withAlpha(rim, night ? 0.4 : 0.65);
  puff(night ? 3.4 : 2.2, night ? 0.42 : 0.62);
  // A flat, slightly darker base.
  const base = centre + unit * 1.6;
  const fade = ctx.createLinearGradient(0, base - unit * 6, 0, base + unit * 2);
  fade.addColorStop(0, withAlpha(shadow, 0));
  fade.addColorStop(1, withAlpha(shadow, 0.55));
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = fade;
  ctx.fillRect(0, base - unit * 6, size, unit * 8);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillRect(0, base + unit * 1.2, size, size);
  ctx.globalCompositeOperation = 'source-over';
  return canvas;
}
