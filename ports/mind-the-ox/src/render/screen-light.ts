import type { Palette } from './palette';
import type { Viewport } from './view';

/**
 * Screen-space light shared by both views: the low sun's shafts and glare
 * during the flight into the sun.
 */
export function sunPosition(viewport: Viewport, palette: Palette) {
  return {
    x: viewport.width * palette.sun.x,
    y:
      viewport.insetTop +
      (viewport.height - viewport.insetTop - viewport.insetBottom) * palette.sun.y,
  };
}

/** Shafts of light fanning out from the low sun, behind the land. */
export function paintSunShafts(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  strength: number,
  palette: Palette,
) {
  const { x, y } = sunPosition(viewport, palette);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const reach = Math.max(viewport.width, viewport.height) * 1.2;
  const shaft = ctx.createRadialGradient(x, y, 0, x, y, reach);
  shaft.addColorStop(0, `rgba(255, 220, 170, ${(0.09 * strength).toFixed(3)})`);
  shaft.addColorStop(0.6, `rgba(255, 210, 160, ${(0.03 * strength).toFixed(3)})`);
  shaft.addColorStop(1, 'rgba(255, 210, 160, 0)');
  for (let ray = 0; ray < 9; ray++) {
    const angle = Math.PI * 0.55 + ray * 0.24 + strength * 0.15;
    ctx.fillStyle = shaft;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle - 0.05) * reach, y + Math.sin(angle - 0.05) * reach);
    ctx.lineTo(x + Math.cos(angle + 0.05) * reach, y + Math.sin(angle + 0.05) * reach);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export function paintSunGlare(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  strength: number,
  palette: Palette,
) {
  const { x, y } = sunPosition(viewport, palette);
  const glare = ctx.createRadialGradient(x, y, 0, x, y, Math.max(viewport.width, viewport.height));
  glare.addColorStop(0, `rgba(255, 244, 214, ${(0.85 * strength).toFixed(3)})`);
  glare.addColorStop(0.35, `rgba(255, 214, 150, ${(0.35 * strength).toFixed(3)})`);
  glare.addColorStop(1, 'rgba(255, 200, 140, 0)');
  ctx.fillStyle = glare;
  ctx.fillRect(0, 0, viewport.width, viewport.height);
}
