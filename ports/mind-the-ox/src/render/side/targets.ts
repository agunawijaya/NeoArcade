import type { Target } from '../../engine/world';
import type { Palette } from '../palette';
import type { SideCamera } from './camera';
import { mix, shade, withAlpha } from './colour';
import { paintAirshowTarget } from './targets-airshow';
import { paintCartoonTarget } from './targets-cartoon';
import { paintShed } from './targets-shed';

/**
 * A ground target, standing or wrecked, in the frame's theme. The painters
 * draw with the target's foot at the origin, one world unit to `unit`
 * pixels.
 */
export function paintTarget(
  ctx: CanvasRenderingContext2D,
  camera: SideCamera,
  palette: Palette,
  target: Target,
  time: number,
) {
  ctx.save();
  ctx.translate(camera.x(target.x), camera.y(target.y));
  const unit = camera.scale;
  const accent = palette.accents[target.side];
  if (target.kind === 'shed' && target.standing)
    paintShed(ctx, unit, target, palette, accent, time);
  else if (palette.theme === 'cyan-magenta')
    paintCartoonTarget(ctx, unit, target, palette, accent, time);
  else if (palette.theme === 'airshow')
    paintAirshowTarget(ctx, unit, target, palette, accent, time);
  else paintGreatWarTarget(ctx, unit, target, palette, accent, time);
  if (target.standing && target.damage > 0) {
    ctx.fillStyle = withAlpha(palette.scorch, Math.min(0.6, target.damage / 40));
    ctx.fillRect(
      -target.width * unit * 0.5,
      -target.height * unit,
      target.width * unit,
      target.height * unit,
    );
  }
  ctx.restore();
}

/**
 * The four kinds of ground target in the Great War theme: a canvas hangar,
 * a brick munitions works, a fuel depot of tanks and drums (the one worth
 * double), and a rhomboid landship; a convoy is a column of canvas-topped
 * lorries. Each flies its side's pennant; a wrecked one is a blackened
 * frame.
 */
function paintGreatWarTarget(
  ctx: CanvasRenderingContext2D,
  unit: number,
  target: Target,
  palette: Palette,
  accent: string,
  time: number,
) {
  if (!target.standing) {
    paintWreck(ctx, unit, target, palette);
    return;
  }
  if (target.drivesTo !== null) {
    paintLorry(ctx, unit, target, palette, accent, time);
    return;
  }
  switch (target.kind) {
    case 'hangar':
      paintHangar(ctx, unit, target, palette, accent, time);
      break;
    case 'factory':
      paintFactory(ctx, unit, target, palette, accent, time);
      break;
    case 'depot':
      paintDepot(ctx, unit, target, palette, accent);
      break;
    case 'tank':
      paintTank(ctx, unit, target, palette, accent);
      break;
  }
}

/** A canvas-topped lorry of the supply column, wheels turning as it crawls along. */
function paintLorry(
  ctx: CanvasRenderingContext2D,
  unit: number,
  target: Target,
  palette: Palette,
  accent: string,
  time: number,
) {
  const facing = target.drivesTo !== null && target.drivesTo < target.x ? -1 : 1;
  ctx.save();
  ctx.scale(facing, 1);
  const half = (target.width / 2) * unit;
  const body = mix(palette.metal, palette.grass[2], 0.45);
  // The canvas tilt over the load bed.
  ctx.fillStyle = palette.canvas;
  ctx.beginPath();
  ctx.moveTo(-half, -unit * 1.6);
  ctx.lineTo(-half, -unit * 5.4);
  ctx.quadraticCurveTo(-half * 0.3, -unit * 7, half * 0.25, -unit * 5.4);
  ctx.lineTo(half * 0.25, -unit * 1.6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = palette.canvasShade;
  ctx.lineWidth = Math.max(1, unit * 0.25);
  for (const hoop of [-0.75, -0.35, 0.05]) {
    ctx.beginPath();
    ctx.moveTo(half * hoop, -unit * 1.6);
    ctx.lineTo(half * hoop, -unit * 6);
    ctx.stroke();
  }
  // Cab and bonnet.
  ctx.fillStyle = body;
  ctx.fillRect(half * 0.25, -unit * 4.6, half * 0.45, unit * 3);
  ctx.fillRect(half * 0.7, -unit * 3.2, half * 0.3, unit * 1.6);
  ctx.fillStyle = withAlpha(palette.sky[1], 0.8);
  ctx.fillRect(half * 0.33, -unit * 4.2, half * 0.28, unit * 1.2);
  ctx.fillStyle = shade(body, -0.3);
  ctx.fillRect(-half, -unit * 1.8, half * 2, unit * 0.5);
  ctx.fillStyle = accent;
  ctx.fillRect(-half * 0.6, -unit * 4.2, unit * 1.4, unit * 1);
  // Spoked wheels that turn as it goes.
  for (const wheel of [-0.65, 0.65]) {
    const cx = half * wheel;
    ctx.fillStyle = '#26221e';
    ctx.beginPath();
    ctx.arc(cx, -unit * 1, unit * 1.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = shade(palette.metal, 0.2);
    ctx.lineWidth = Math.max(0.6, unit * 0.15);
    const turn = time * 3 * facing;
    for (let spoke = 0; spoke < 3; spoke++) {
      const angle = turn + (spoke * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(angle) * unit * 0.8, -unit - Math.sin(angle) * unit * 0.8);
      ctx.lineTo(cx + Math.cos(angle) * unit * 0.8, -unit + Math.sin(angle) * unit * 0.8);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function pennant(
  ctx: CanvasRenderingContext2D,
  unit: number,
  x: number,
  top: number,
  colour: string,
  time: number,
) {
  ctx.strokeStyle = '#3a2f26';
  ctx.lineWidth = Math.max(1, unit * 0.22);
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, -top * unit);
  ctx.stroke();
  const wave = Math.sin(time * 4 + x) * unit * 0.4;
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(x, -top * unit);
  ctx.quadraticCurveTo(
    x + unit * 1.6,
    -top * unit + wave,
    x + unit * 3.2,
    -top * unit + unit * 0.6,
  );
  ctx.lineTo(x, -(top - 1.4) * unit);
  ctx.closePath();
  ctx.fill();
}

function paintHangar(
  ctx: CanvasRenderingContext2D,
  unit: number,
  target: Target,
  palette: Palette,
  accent: string,
  time: number,
) {
  const half = (target.width / 2) * unit;
  const height = target.height * unit;
  ctx.fillStyle = palette.canvas;
  ctx.beginPath();
  ctx.moveTo(-half, 0);
  ctx.lineTo(-half, -height * 0.45);
  ctx.bezierCurveTo(-half * 0.8, -height * 1.08, half * 0.8, -height * 1.08, half, -height * 0.45);
  ctx.lineTo(half, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = withAlpha(palette.canvasShade, 0.8);
  ctx.beginPath();
  ctx.moveTo(half * 0.2, 0);
  ctx.lineTo(half * 0.2, -height * 0.7);
  ctx.bezierCurveTo(half * 0.5, -height * 0.84, half * 0.85, -height * 0.7, half, -height * 0.45);
  ctx.lineTo(half, 0);
  ctx.closePath();
  ctx.fill();
  // The open door and the dark inside.
  ctx.fillStyle = shade(palette.ink, 0.1);
  ctx.beginPath();
  ctx.moveTo(-half * 0.55, 0);
  ctx.lineTo(-half * 0.55, -height * 0.5);
  ctx.quadraticCurveTo(-half * 0.15, -height * 0.78, half * 0.15, -height * 0.55);
  ctx.lineTo(half * 0.15, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = palette.canvasShade;
  ctx.lineWidth = Math.max(1, unit * 0.25);
  for (const rib of [-0.75, -0.25, 0.25, 0.75]) {
    ctx.beginPath();
    ctx.moveTo(rib * half, 0);
    ctx.lineTo(rib * half, -height * (0.95 - Math.abs(rib) * 0.45));
    ctx.stroke();
  }
  pennant(ctx, unit, half * 0.9, target.height + 4, accent, time);
}

function paintFactory(
  ctx: CanvasRenderingContext2D,
  unit: number,
  target: Target,
  palette: Palette,
  accent: string,
  time: number,
) {
  const half = (target.width / 2) * unit;
  const height = target.height * unit;
  const brick = mix(palette.roof, palette.trunk, 0.35);
  ctx.fillStyle = brick;
  ctx.fillRect(-half, -height * 0.62, half * 2, height * 0.62);
  // Saw-tooth roof with north lights.
  ctx.fillStyle = shade(brick, -0.25);
  ctx.beginPath();
  ctx.moveTo(-half, -height * 0.62);
  for (let tooth = 0; tooth < 4; tooth++) {
    const x = -half + (tooth * half * 2) / 4;
    ctx.lineTo(x + half * 0.5, -height * 0.84);
    ctx.lineTo(x + half * 0.5, -height * 0.62);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = palette.daylight < 0.5 ? palette.window : withAlpha(palette.sky[1], 0.85);
  for (let window = 0; window < 4; window++) {
    ctx.fillRect(-half + unit * 1.2 + window * unit * 3.6, -height * 0.45, unit * 1.6, unit * 1.8);
  }
  // A chimney with a lazy plume.
  ctx.fillStyle = shade(brick, -0.15);
  ctx.fillRect(half * 0.55, -height * 1.15, unit * 1.6, height * 0.6);
  for (let puff = 0; puff < 4; puff++) {
    const age = (time * 0.5 + puff / 4) % 1;
    ctx.fillStyle = withAlpha(palette.smoke, 0.35 * (1 - age));
    ctx.beginPath();
    ctx.arc(
      half * 0.55 + unit * (0.8 + age * 4),
      -height * 1.18 - age * unit * 9,
      unit * (0.9 + age * 2.4),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  pennant(ctx, unit, -half * 0.9, target.height + 2, accent, time);
}

function paintDepot(
  ctx: CanvasRenderingContext2D,
  unit: number,
  target: Target,
  palette: Palette,
  accent: string,
) {
  const half = (target.width / 2) * unit;
  const height = target.height * unit;
  // A big round tank on a plinth.
  ctx.fillStyle = shade(palette.metal, 0.1);
  ctx.fillRect(-half, -height * 0.8, half * 1.25, height * 0.8);
  const gradient = ctx.createLinearGradient(-half, 0, half * 0.25, 0);
  gradient.addColorStop(0, shade(palette.metal, -0.15));
  gradient.addColorStop(0.35, shade(palette.metal, 0.35));
  gradient.addColorStop(1, shade(palette.metal, -0.25));
  ctx.fillStyle = gradient;
  ctx.fillRect(-half, -height * 0.8, half * 1.25, height * 0.8);
  ctx.fillStyle = shade(palette.metal, 0.2);
  ctx.beginPath();
  ctx.ellipse(-half * 0.375, -height * 0.8, half * 0.625, unit * 0.9, 0, 0, Math.PI * 2);
  ctx.fill();
  // The danger band that says "worth double".
  ctx.fillStyle = '#c8412f';
  ctx.fillRect(-half, -height * 0.5, half * 1.25, unit * 0.9);
  // Drums stacked beside it.
  ctx.fillStyle = mix(palette.metal, accent, 0.25);
  for (const [dx, dy] of [
    [0.45, 0],
    [0.75, 0],
    [0.6, 1],
  ] as const) {
    ctx.fillRect(half * dx - unit * 0.8, -unit * (1.6 + dy * 1.6), unit * 1.5, unit * 1.6);
  }
}

function paintTank(
  ctx: CanvasRenderingContext2D,
  unit: number,
  target: Target,
  palette: Palette,
  accent: string,
) {
  const half = (target.width / 2) * unit;
  const height = target.height * unit;
  const hull = mix(palette.metal, palette.grass[2], 0.35);
  ctx.fillStyle = hull;
  ctx.beginPath();
  ctx.moveTo(-half, -height * 0.25);
  ctx.lineTo(-half * 0.7, -height);
  ctx.lineTo(half * 0.6, -height);
  ctx.lineTo(half, -height * 0.25);
  ctx.lineTo(half * 0.8, 0);
  ctx.lineTo(-half * 0.8, 0);
  ctx.closePath();
  ctx.fill();
  // Tracks running round the rhomboid.
  ctx.strokeStyle = shade(hull, -0.4);
  ctx.lineWidth = Math.max(1.2, unit * 0.6);
  ctx.stroke();
  ctx.fillStyle = shade(hull, -0.3);
  for (let wheel = -3; wheel <= 3; wheel++) {
    ctx.beginPath();
    ctx.arc(wheel * half * 0.25, -unit * 0.9, unit * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }
  // The side sponson and its gun.
  ctx.fillStyle = shade(hull, -0.1);
  ctx.fillRect(-unit * 2, -height * 0.75, unit * 4, height * 0.4);
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = Math.max(1, unit * 0.35);
  ctx.beginPath();
  ctx.moveTo(unit * 2, -height * 0.58);
  ctx.lineTo(unit * 4.4, -height * 0.62);
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.fillRect(-half * 0.5, -height * 0.85, unit * 1.2, unit * 0.8);
}

function paintWreck(ctx: CanvasRenderingContext2D, unit: number, target: Target, palette: Palette) {
  const half = (target.width / 2) * unit;
  ctx.fillStyle = palette.scorch;
  ctx.beginPath();
  ctx.ellipse(0, 0, half * 1.2, unit * 1.2, 0, Math.PI, 0);
  ctx.fill();
  ctx.strokeStyle = shade(palette.scorch, 0.15);
  ctx.lineWidth = Math.max(1, unit * 0.4);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-half * 0.7, 0);
  ctx.lineTo(-half * 0.5, -unit * 3.2);
  ctx.moveTo(-half * 0.1, 0);
  ctx.lineTo(half * 0.15, -unit * 2.2);
  ctx.moveTo(half * 0.5, 0);
  ctx.lineTo(half * 0.3, -unit * 2.8);
  ctx.stroke();
  ctx.lineCap = 'butt';
}
