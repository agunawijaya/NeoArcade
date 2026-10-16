import type { Target } from '../../engine/world';
import type { Palette } from '../palette';
import { mix, shade, withAlpha } from './colour';

/**
 * The Airshow's targets, set out for the crowd: a cart of tethered
 * balloons to pop, a bullseye stunt marker to flour, a fireworks stand
 * (worth double, and it goes up in style) and a ribbon gate between two
 * striped pylons. The parade floats of the convoy chapter roll along on
 * the same wheels. Each "wreck" is what is left when the trick is done.
 */
export function paintAirshowTarget(
  ctx: CanvasRenderingContext2D,
  unit: number,
  target: Target,
  palette: Palette,
  accent: string,
  time: number,
) {
  const half = (target.width / 2) * unit;
  const height = target.height * unit;
  const colours = palette.festive;
  if (target.drivesTo !== null) {
    paintFloat(ctx, unit, target, palette, accent, time);
    return;
  }
  switch (target.kind) {
    case 'hangar':
      paintBalloonCart(ctx, unit, half, height, palette, accent, time, target.standing, target.id);
      return;
    case 'factory':
      paintMarker(ctx, unit, half, height, palette, accent, target.standing);
      return;
    case 'depot':
      paintFireworks(ctx, unit, half, height, palette, colours, target.standing, time);
      return;
    case 'tank':
      paintRibbonGate(ctx, unit, half, height, palette, accent, target.standing, time);
      return;
  }
}

function cart(
  ctx: CanvasRenderingContext2D,
  unit: number,
  half: number,
  palette: Palette,
  accent: string,
) {
  ctx.fillStyle = accent;
  ctx.fillRect(-half * 0.8, -unit * 2.6, half * 1.6, unit * 1.6);
  ctx.fillStyle = withAlpha('#ffffff', 0.8);
  ctx.fillRect(-half * 0.8, -unit * 2.6, half * 1.6, unit * 0.45);
  ctx.fillStyle = palette.ink;
  for (const wheel of [-0.55, 0.55]) {
    ctx.beginPath();
    ctx.arc(half * wheel, -unit * 0.8, unit * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintBalloonCart(
  ctx: CanvasRenderingContext2D,
  unit: number,
  half: number,
  height: number,
  palette: Palette,
  accent: string,
  time: number,
  standing: boolean,
  seed: number,
) {
  cart(ctx, unit, half, palette, accent);
  const balloons = 5;
  for (let index = 0; index < balloons; index++) {
    const anchorX = half * (-0.6 + index * 0.3);
    const bob = Math.sin(time * 1.6 + index * 1.3 + seed) * unit * 0.6;
    const topX = anchorX + Math.sin(index * 2.1) * unit * 1.4;
    const topY = -height * (0.85 + (index % 2) * 0.18) + bob;
    ctx.strokeStyle = withAlpha(palette.ink, 0.55);
    ctx.lineWidth = Math.max(0.5, unit * 0.1);
    ctx.beginPath();
    ctx.moveTo(anchorX, -unit * 2.6);
    ctx.quadraticCurveTo(anchorX, (topY - unit * 2.6) / 2, topX, topY + unit * 1.5);
    ctx.stroke();
    if (!standing) {
      // Popped: a limp scrap of rubber on the string.
      ctx.fillStyle = palette.festive[index % palette.festive.length] as string;
      ctx.fillRect(topX - unit * 0.3, topY + unit * 1.2, unit * 0.6, unit * 0.9);
      continue;
    }
    const colour = palette.festive[index % palette.festive.length] as string;
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.ellipse(topX, topY, unit * 1.5, unit * 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = withAlpha('#ffffff', 0.5);
    ctx.beginPath();
    ctx.ellipse(topX - unit * 0.5, topY - unit * 0.6, unit * 0.4, unit * 0.6, -0.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintMarker(
  ctx: CanvasRenderingContext2D,
  unit: number,
  half: number,
  height: number,
  palette: Palette,
  accent: string,
  standing: boolean,
) {
  ctx.strokeStyle = palette.trunk;
  ctx.lineWidth = Math.max(1, unit * 0.45);
  ctx.beginPath();
  ctx.moveTo(-half * 0.5, 0);
  ctx.lineTo(0, -height * 0.55);
  ctx.lineTo(half * 0.5, 0);
  ctx.stroke();
  const radius = Math.min(half, height * 0.45);
  const centreY = -height + radius;
  const rings = [accent, '#ffffff', accent, '#ffffff', palette.festive[1] ?? '#ffd23c'];
  rings.forEach((colour, index) => {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(0, centreY, radius * (1 - index * 0.19), 0, Math.PI * 2);
    ctx.fill();
  });
  if (!standing) {
    // Hit: a fat splash of flour across the bullseye.
    ctx.fillStyle = withAlpha('#ffffff', 0.92);
    ctx.beginPath();
    for (let lobe = 0; lobe < 9; lobe++) {
      const angle = (lobe / 9) * Math.PI * 2;
      const reach = radius * (0.55 + (lobe % 3) * 0.15);
      ctx.lineTo(Math.cos(angle) * reach, centreY + Math.sin(angle) * reach);
    }
    ctx.closePath();
    ctx.fill();
  }
}

function paintFireworks(
  ctx: CanvasRenderingContext2D,
  unit: number,
  half: number,
  height: number,
  palette: Palette,
  colours: readonly string[],
  standing: boolean,
  time: number,
) {
  // A striped stall with a scalloped awning.
  ctx.fillStyle = palette.wall;
  ctx.fillRect(-half, -height * 0.55, half * 2, height * 0.55);
  const stripes = 6;
  for (let stripe = 0; stripe < stripes; stripe++) {
    ctx.fillStyle = stripe % 2 === 0 ? (colours[0] as string) : '#ffffff';
    const x = -half + (stripe * half * 2) / stripes;
    ctx.beginPath();
    ctx.moveTo(x, -height * 0.55);
    ctx.lineTo(x + (half * 2) / stripes, -height * 0.55);
    ctx.lineTo(x + (half * 2) / stripes, -height * 0.66);
    ctx.lineTo(x, -height * 0.66);
    ctx.arc(x + half / stripes, -height * 0.55, half / stripes, Math.PI, 0, true);
    ctx.fill();
  }
  if (!standing) {
    ctx.fillStyle = withAlpha(palette.smoke, 0.6);
    for (let puff = 0; puff < 3; puff++) {
      const age = (time * 0.5 + puff / 3) % 1;
      ctx.beginPath();
      ctx.arc(
        -half * 0.3 + puff * half * 0.3,
        -height * (0.7 + age),
        unit * (1 + age * 2),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    return;
  }
  // Rockets standing ready on the counter, sticks and all.
  for (let rocket = 0; rocket < 4; rocket++) {
    const x = -half * 0.7 + rocket * half * 0.46;
    ctx.strokeStyle = palette.trunk;
    ctx.lineWidth = Math.max(0.5, unit * 0.12);
    ctx.beginPath();
    ctx.moveTo(x, -height * 0.66);
    ctx.lineTo(x, -height * 1.15);
    ctx.stroke();
    ctx.fillStyle = colours[(rocket + 1) % colours.length] as string;
    ctx.fillRect(x - unit * 0.45, -height * 1.35, unit * 0.9, height * 0.3);
    ctx.fillStyle = shade(colours[(rocket + 1) % colours.length] as string, -0.3);
    ctx.beginPath();
    ctx.moveTo(x - unit * 0.45, -height * 1.35);
    ctx.lineTo(x, -height * 1.35 - unit * 1);
    ctx.lineTo(x + unit * 0.45, -height * 1.35);
    ctx.fill();
  }
}

function paintRibbonGate(
  ctx: CanvasRenderingContext2D,
  unit: number,
  half: number,
  height: number,
  palette: Palette,
  accent: string,
  standing: boolean,
  time: number,
) {
  const top = -height * 1.8;
  for (const side of [-1, 1]) {
    const x = side * half * 0.8;
    for (let band = 0; band < 6; band++) {
      ctx.fillStyle = band % 2 === 0 ? accent : '#ffffff';
      ctx.fillRect(x - unit * 0.6, top + (band * -top) / 6, unit * 1.2, -top / 6 + 0.5);
    }
    ctx.fillStyle = palette.festive[1] ?? '#ffd23c';
    ctx.beginPath();
    ctx.arc(x, top, unit * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = palette.festive[1] ?? '#ffd23c';
  ctx.lineWidth = Math.max(1, unit * 0.5);
  const ribbonY = top + unit * 1.2;
  if (standing) {
    const sag = Math.sin(time * 2) * unit * 0.4 + unit;
    ctx.beginPath();
    ctx.moveTo(-half * 0.8, ribbonY);
    ctx.quadraticCurveTo(0, ribbonY + sag, half * 0.8, ribbonY);
    ctx.stroke();
    return;
  }
  // Cut: two ends hanging and fluttering.
  for (const side of [-1, 1]) {
    const flutter = Math.sin(time * 6 + side) * unit * 0.6;
    ctx.beginPath();
    ctx.moveTo(side * half * 0.8, ribbonY);
    ctx.quadraticCurveTo(
      side * half * 0.6 + flutter,
      ribbonY + unit * 2,
      side * half * 0.55,
      ribbonY + unit * 4,
    );
    ctx.stroke();
  }
}

/** A parade float: a decorated cart under a giant paper duck, rolling along. */
function paintFloat(
  ctx: CanvasRenderingContext2D,
  unit: number,
  target: Target,
  palette: Palette,
  accent: string,
  time: number,
) {
  const facing = target.drivesTo !== null && target.drivesTo < target.x ? -1 : 1;
  const half = (target.width / 2) * unit;
  ctx.save();
  ctx.scale(facing, 1);
  if (!target.standing) {
    cart(ctx, unit, half, palette, accent);
    ctx.restore();
    return;
  }
  cart(ctx, unit, half, palette, accent);
  const sway = Math.sin(time * 3) * unit * 0.3;
  const duck = mix('#ffd23c', palette.wall, 0.15);
  ctx.fillStyle = duck;
  ctx.beginPath();
  ctx.ellipse(-unit * 0.6, -unit * 4.6 + sway, half * 0.55, unit * 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(half * 0.35, -unit * 6.4 + sway, unit * 1.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ff8a2c';
  ctx.beginPath();
  ctx.moveTo(half * 0.35 + unit * 1.1, -unit * 6.6 + sway);
  ctx.lineTo(half * 0.35 + unit * 2.4, -unit * 6.2 + sway);
  ctx.lineTo(half * 0.35 + unit * 1.1, -unit * 5.9 + sway);
  ctx.fill();
  ctx.fillStyle = palette.ink;
  ctx.beginPath();
  ctx.arc(half * 0.35 + unit * 0.4, -unit * 6.7 + sway, unit * 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
