import type { Target } from '../../engine/world';
import type { Palette } from '../palette';
import { mix, shade, withAlpha } from './colour';

/**
 * Cyan vs Magenta's targets, drawn like a Saturday-morning cartoon: fat
 * ink outlines, round corners, a stripe of the side's colour on
 * everything. The hangar has a big door, the factory a striped
 * smokestack, the fuel depot a bulging tank with FUEL on it, and the
 * supply truck a round-nosed cab. A wreck is a heap of rubble with a
 * little white flag stuck in it.
 */
export function paintCartoonTarget(
  ctx: CanvasRenderingContext2D,
  unit: number,
  target: Target,
  palette: Palette,
  accent: string,
  time: number,
) {
  const outline = (width = 0.35) => {
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = Math.max(1, unit * width);
    ctx.lineJoin = 'round';
    ctx.stroke();
  };
  const half = (target.width / 2) * unit;
  const height = target.height * unit;
  if (!target.standing) {
    paintRubble(ctx, unit, half, palette, time);
    return;
  }
  switch (target.kind) {
    case 'hangar': {
      roundedBox(ctx, -half, -height * 0.78, half * 2, height * 0.78, unit * 3);
      ctx.fillStyle = palette.canvas;
      ctx.fill();
      outline();
      ctx.fillStyle = accent;
      ctx.fillRect(
        -half + unit * 0.6,
        -height * 0.78 + unit * 1.4,
        half * 2 - unit * 1.2,
        unit * 1.3,
      );
      roundedBox(ctx, -half * 0.5, -height * 0.5, half, height * 0.5, unit * 1.2);
      ctx.fillStyle = shade(palette.ink, 0.15);
      ctx.fill();
      outline(0.25);
      return;
    }
    case 'factory': {
      roundedBox(ctx, -half, -height * 0.6, half * 2, height * 0.6, unit * 1.2);
      ctx.fillStyle = palette.roof;
      ctx.fill();
      outline();
      // A striped smokestack puffing round cartoon clouds.
      const stackX = half * 0.45;
      ctx.beginPath();
      ctx.rect(stackX, -height * 1.2, unit * 2.2, height * 0.62);
      ctx.fillStyle = palette.wall;
      ctx.fill();
      outline(0.3);
      ctx.fillStyle = accent;
      for (const band of [0.25, 0.65])
        ctx.fillRect(stackX, -height * (1.2 - band * 0.6), unit * 2.2, unit * 0.9);
      for (let puff = 0; puff < 3; puff++) {
        const age = (time * 0.6 + puff / 3) % 1;
        ctx.fillStyle = withAlpha(palette.cloud.light, 0.85 * (1 - age));
        ctx.beginPath();
        ctx.arc(
          stackX + unit * (1.1 + age * 3),
          -height * 1.25 - age * unit * 8,
          unit * (1 + age * 2),
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      ctx.fillStyle = palette.daylight < 0.5 ? palette.window : withAlpha(palette.sky[1], 0.9);
      for (let window = 0; window < 3; window++) {
        ctx.beginPath();
        ctx.arc(-half + unit * (2.4 + window * 3.6), -height * 0.32, unit * 1, 0, Math.PI * 2);
        ctx.fill();
        outline(0.2);
      }
      return;
    }
    case 'depot': {
      ctx.beginPath();
      ctx.ellipse(-half * 0.15, -height * 0.5, half * 0.8, height * 0.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = shade(palette.metal, 0.15);
      ctx.fill();
      outline();
      ctx.fillStyle = '#ff5a3c';
      ctx.fillRect(-half * 0.95, -height * 0.58, half * 1.6, unit * 1.6);
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 ${Math.max(6, unit * 1.4)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('FUEL', -half * 0.15, -height * 0.58 + unit * 0.85);
      ctx.fillStyle = withAlpha('#ffffff', 0.55);
      ctx.beginPath();
      ctx.ellipse(-half * 0.45, -height * 0.78, half * 0.2, height * 0.1, -0.4, 0, Math.PI * 2);
      ctx.fill();
      // A barrel or two beside it.
      for (const dx of [0.72, 0.95]) {
        roundedBox(ctx, half * dx - unit * 0.9, -unit * 2.4, unit * 1.8, unit * 2.4, unit * 0.4);
        ctx.fillStyle = accent;
        ctx.fill();
        outline(0.25);
      }
      return;
    }
    case 'tank':
      paintTruck(ctx, unit, target, palette, accent, time, outline);
      return;
  }
}

/** The supply truck: a round-nosed cab and a box with the side's stripe. */
function paintTruck(
  ctx: CanvasRenderingContext2D,
  unit: number,
  target: Target,
  palette: Palette,
  accent: string,
  time: number,
  outline: (width?: number) => void,
) {
  const facing = target.drivesTo !== null && target.drivesTo < target.x ? -1 : 1;
  const half = (target.width / 2) * unit;
  ctx.save();
  ctx.scale(facing, 1);
  // Bounces a little on its springs while it drives.
  const bounce = target.drivesTo === null ? 0 : Math.abs(Math.sin(time * 9)) * unit * 0.3;
  ctx.translate(0, -bounce);
  roundedBox(ctx, -half, -unit * 6, half * 1.25, unit * 4.6, unit * 0.8);
  ctx.fillStyle = palette.wall;
  ctx.fill();
  outline();
  ctx.fillStyle = accent;
  ctx.fillRect(-half + unit * 0.4, -unit * 4.4, half * 1.25 - unit * 0.8, unit * 1.2);
  roundedBox(ctx, half * 0.3, -unit * 4.4, half * 0.7, unit * 3, unit * 1.6);
  ctx.fillStyle = mix(accent, palette.ink, 0.15);
  ctx.fill();
  outline();
  ctx.fillStyle = withAlpha(palette.sky[1], 0.95);
  ctx.beginPath();
  ctx.ellipse(half * 0.66, -unit * 3.3, unit * 0.9, unit * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  for (const wheel of [-0.62, 0.62]) {
    ctx.beginPath();
    ctx.arc(half * wheel * facing, -unit * 1.1, unit * 1.1, 0, Math.PI * 2);
    ctx.fillStyle = palette.ink;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(half * wheel * facing, -unit * 1.1, unit * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = palette.wall;
    ctx.fill();
  }
}

function paintRubble(
  ctx: CanvasRenderingContext2D,
  unit: number,
  half: number,
  palette: Palette,
  time: number,
) {
  ctx.fillStyle = shade(palette.metal, -0.2);
  for (const [dx, radius] of [
    [-0.5, 1.6],
    [0, 2.1],
    [0.5, 1.4],
  ] as const) {
    ctx.beginPath();
    ctx.arc(half * dx, 0, unit * radius, Math.PI, 0);
    ctx.fill();
  }
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = Math.max(1, unit * 0.3);
  ctx.beginPath();
  ctx.moveTo(unit * 0.4, -unit * 1.6);
  ctx.lineTo(unit * 0.4, -unit * 6);
  ctx.stroke();
  // The little white flag of surrender, fluttering.
  const wave = Math.sin(time * 5) * unit * 0.3;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(unit * 0.4, -unit * 6);
  ctx.quadraticCurveTo(unit * 1.6, -unit * 6 + wave, unit * 2.8, -unit * 5.6);
  ctx.lineTo(unit * 2.8, -unit * 4.4);
  ctx.quadraticCurveTo(unit * 1.6, -unit * 4.6 - wave, unit * 0.4, -unit * 4.6);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = Math.max(0.8, unit * 0.18);
  ctx.stroke();
}

function roundedBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, [radius, radius, 0, 0]);
}
