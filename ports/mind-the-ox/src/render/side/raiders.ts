import { RAIDER_CLASSES } from '../../engine/raiders';
import type { Raider } from '../../engine/world';
import type { Livery, Palette } from '../palette';
import { drawBiplane } from './biplane';
import type { SideCamera } from './camera';
import { mix, shade, withAlpha } from './colour';

/**
 * The raiders: a heavy bomber is a biplane half as big again with an
 * engine out on each wing; an airship is a long silvered envelope with its
 * cars slung underneath, ribs showing through the doped fabric.
 */
export function paintRaider(
  ctx: CanvasRenderingContext2D,
  camera: SideCamera,
  palette: Palette,
  livery: Livery,
  raider: Raider,
  time: number,
) {
  if (raider.kind === 'zeppelin') paintAirship(ctx, camera, palette, livery, raider, time);
  else paintBomber(ctx, camera, palette, livery, raider, time);
}

function paintBomber(
  ctx: CanvasRenderingContext2D,
  camera: SideCamera,
  palette: Palette,
  livery: Livery,
  raider: Raider,
  time: number,
) {
  const x = camera.x(raider.x);
  const y = camera.y(raider.y);
  const scale = camera.scale * 1.75;
  const falling = raider.state === 'falling';
  const pitch = Math.atan2(raider.vy, raider.vx);
  drawBiplane(
    ctx,
    {
      x,
      y,
      scale,
      pitch: falling ? pitch : raider.direction === 1 ? 0 : Math.PI,
      roll: raider.direction === 1 ? 0 : Math.PI,
      spin: time * 30,
      power: falling ? 0 : 0.8,
      wounded: falling || raider.hitPoints < RAIDER_CLASSES.bomber.hitPoints / 2,
      seed: raider.id,
      time,
      daylight: palette.daylight,
    },
    {
      ...livery,
      fabric: shade(livery.fabric, -0.12),
      fabricShade: shade(livery.fabricShade, -0.12),
    },
  );
  if (falling) return;
  // The two engines on the lower wing, their propellers a blur.
  for (const along of [-0.6, 1.4]) {
    const engineX = x + raider.direction * along * camera.scale;
    const engineY = y + camera.scale * 1.8;
    ctx.fillStyle = shade(livery.cowling, -0.25);
    ctx.beginPath();
    ctx.ellipse(engineX, engineY, camera.scale * 2.4, camera.scale * 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = withAlpha(palette.ink, 0.25);
    ctx.beginPath();
    ctx.ellipse(
      engineX + raider.direction * camera.scale * 2.6,
      engineY,
      camera.scale * 0.4,
      camera.scale * 2.4,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}

function paintAirship(
  ctx: CanvasRenderingContext2D,
  camera: SideCamera,
  palette: Palette,
  livery: Livery,
  raider: Raider,
  time: number,
) {
  const kind = RAIDER_CLASSES.zeppelin;
  const unit = camera.scale;
  const half = kind.length / 2;
  const radius = kind.radius;
  const falling = raider.state === 'falling';
  ctx.save();
  ctx.translate(camera.x(raider.x), camera.y(raider.y));
  ctx.scale(unit * raider.direction, unit);
  if (falling) ctx.rotate(0.35 + Math.sin(time) * 0.03);

  // Fins at the tail, behind the envelope.
  const fabric = mix(livery.linen, '#c9ccd0', 0.55);
  ctx.fillStyle = shade(fabric, -0.18);
  ctx.beginPath();
  ctx.moveTo(-half + 8, -radius * 0.4);
  ctx.lineTo(-half - 1, -radius * 1.25);
  ctx.lineTo(-half - 1, -radius * 0.2);
  ctx.closePath();
  ctx.moveTo(-half + 8, radius * 0.4);
  ctx.lineTo(-half - 1, radius * 1.25);
  ctx.lineTo(-half - 1, radius * 0.2);
  ctx.closePath();
  ctx.fill();

  // The envelope: a long cigar, lit from above.
  const body = ctx.createLinearGradient(0, -radius, 0, radius);
  body.addColorStop(0, shade(fabric, 0.18 * palette.daylight));
  body.addColorStop(0.55, fabric);
  body.addColorStop(1, shade(fabric, -0.35));
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-half, 0);
  ctx.bezierCurveTo(-half + 4, -radius, -half + 16, -radius, -half + 22, -radius);
  ctx.lineTo(half - 18, -radius);
  ctx.bezierCurveTo(half - 6, -radius, half, -radius * 0.45, half, 0);
  ctx.bezierCurveTo(half, radius * 0.45, half - 6, radius, half - 18, radius);
  ctx.lineTo(-half + 22, radius);
  ctx.bezierCurveTo(-half + 16, radius, -half + 4, radius, -half, 0);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = withAlpha(shade(fabric, -0.3), 0.35);
  ctx.lineWidth = Math.max(0.1, 0.6 / unit);
  ctx.beginPath();
  for (let rib = -half + 6; rib < half - 2; rib += 5) {
    ctx.moveTo(rib, -radius);
    ctx.lineTo(rib, radius);
  }
  ctx.stroke();
  if (raider.hitPoints < kind.hitPoints / 2) {
    ctx.fillStyle = withAlpha(palette.scorch, 0.5);
    ctx.beginPath();
    ctx.ellipse(half * 0.2, -radius * 0.3, 8, 4, 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Its side's mark on the envelope, as on the planes.
  const [outer, inner] = livery.insigniaColours;
  ctx.fillStyle = outer ?? palette.ink;
  ctx.beginPath();
  ctx.arc(half - 22, 0, radius * 0.42, 0, Math.PI * 2);
  ctx.fill();
  if (inner) {
    ctx.fillStyle = inner;
    ctx.beginPath();
    ctx.arc(half - 22, 0, radius * 0.24, 0, Math.PI * 2);
    ctx.fill();
  }

  // The control car forward and the engine car aft, slung under the envelope.
  ctx.fillStyle = shade(livery.cowling, -0.3);
  for (const [at, width] of [
    [half - 20, 9],
    [-half + 26, 7],
  ] as const) {
    ctx.fillRect(at - width / 2, radius + 1.2, width, 2.4);
    ctx.strokeStyle = withAlpha(palette.ink, 0.6);
    ctx.lineWidth = Math.max(0.1, 0.5 / unit);
    ctx.beginPath();
    ctx.moveTo(at - width / 2 + 1, radius + 1.2);
    ctx.lineTo(at - width / 2 + 2, radius - 0.4);
    ctx.moveTo(at + width / 2 - 1, radius + 1.2);
    ctx.lineTo(at + width / 2 - 2, radius - 0.4);
    ctx.stroke();
    if (!falling) {
      ctx.fillStyle = withAlpha(palette.ink, 0.2);
      ctx.beginPath();
      ctx.ellipse(at - width / 2 - 1, radius + 2.4, 0.4, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shade(livery.cowling, -0.3);
    }
  }
  if (palette.daylight < 0.5) {
    const glow = ctx.createRadialGradient(half - 20, radius + 2.4, 0, half - 20, radius + 2.4, 3);
    glow.addColorStop(0, withAlpha(palette.window, 0.9));
    glow.addColorStop(1, withAlpha(palette.window, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(half - 23, radius - 0.6, 6, 6);
  }
  ctx.restore();
}
