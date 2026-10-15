import type { SignKind } from '../../engine/road';
import { roundRect } from './car';

/** Small things on and beside the road: carrots, warning signs, the finish banner. Metres, +y down. */

export function drawCarrot(ctx: CanvasRenderingContext2D, time: number, seed: number) {
  const bob = Math.sin(time * 5 + seed) * 0.06;
  ctx.save();
  ctx.translate(0, -0.35 + bob);
  ctx.rotate(0.5);
  ctx.fillStyle = '#ff8a2a';
  ctx.beginPath();
  ctx.moveTo(-0.14, -0.25);
  ctx.quadraticCurveTo(0, -0.3, 0.14, -0.25);
  ctx.lineTo(0.02, 0.35);
  ctx.quadraticCurveTo(0, 0.38, -0.02, 0.35);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#d9621a';
  ctx.lineWidth = 0.025;
  for (const y of [-0.12, 0.02, 0.16]) {
    ctx.beginPath();
    ctx.moveTo(-0.08, y);
    ctx.lineTo(0.04, y + 0.02);
    ctx.stroke();
  }
  ctx.fillStyle = '#5fbf4a';
  for (const angle of [-0.5, 0, 0.5]) {
    ctx.save();
    ctx.translate(0, -0.26);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.ellipse(0, -0.12, 0.04, 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/** A yellow warning diamond on a post, with a glyph for what is ahead. About 2.4 m tall. */
export function drawSign(ctx: CanvasRenderingContext2D, kind: SignKind) {
  ctx.fillStyle = '#6b6b73';
  ctx.fillRect(-0.06, -1.6, 0.12, 1.6);
  ctx.save();
  ctx.translate(0, -1.95);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = kind === 'boss' ? '#ff5b3a' : '#ffcf33';
  roundRect(ctx, -0.42, -0.42, 0.84, 0.84, 0.08);
  ctx.fill();
  ctx.strokeStyle = '#2a2320';
  ctx.lineWidth = 0.06;
  roundRect(ctx, -0.36, -0.36, 0.72, 0.72, 0.06);
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.translate(0, -1.95);
  ctx.fillStyle = '#2a2320';
  ctx.strokeStyle = '#2a2320';
  ctx.lineWidth = 0.07;
  ctx.lineCap = 'round';
  switch (kind) {
    case 'pairs':
      ears(ctx, -0.14);
      ears(ctx, 0.14);
      break;
    case 'herd':
    case 'boss':
      ears(ctx, -0.2);
      ears(ctx, 0);
      ears(ctx, 0.2);
      break;
    case 'mud':
      // The slippery-road sign: a little car, and the wiggly tracks it leaves.
      ctx.fillRect(-0.12, -0.2, 0.24, 0.13);
      ctx.fillRect(-0.08, -0.26, 0.16, 0.07);
      ctx.beginPath();
      ctx.moveTo(-0.1, 0);
      ctx.bezierCurveTo(-0.2, 0.08, 0, 0.12, -0.1, 0.24);
      ctx.moveTo(0.1, 0);
      ctx.bezierCurveTo(0, 0.08, 0.2, 0.12, 0.1, 0.24);
      ctx.stroke();
      break;
    case 'wobblers':
      ctx.beginPath();
      ctx.arc(0, -0.08, 0.13, Math.PI * 1.1, Math.PI * 0.35);
      ctx.lineTo(0, 0.1);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0.22, 0.035, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'three-lanes':
      for (const x of [-0.18, 0, 0.18]) {
        ctx.beginPath();
        ctx.moveTo(x, 0.22);
        ctx.lineTo(x, -0.16);
        ctx.moveTo(x - 0.06, -0.1);
        ctx.lineTo(x, -0.18);
        ctx.lineTo(x + 0.06, -0.1);
        ctx.stroke();
      }
      break;
    case 'carrots':
      ctx.save();
      ctx.scale(0.7, 0.7);
      ctx.translate(0, 0.3);
      drawCarrot(ctx, 0, 0);
      ctx.restore();
      break;
    case 'shift':
      // Two lanes stepping over to one side together.
      for (const x of [-0.13, 0.07]) {
        ctx.beginPath();
        ctx.moveTo(x, 0.24);
        ctx.lineTo(x, 0.08);
        ctx.bezierCurveTo(x, -0.02, x + 0.1, -0.04, x + 0.1, -0.12);
        ctx.lineTo(x + 0.1, -0.24);
        ctx.stroke();
      }
      break;
  }
  ctx.restore();
}

function ears(ctx: CanvasRenderingContext2D, x: number) {
  ctx.beginPath();
  ctx.ellipse(x - 0.04, -0.1, 0.03, 0.12, -0.2, 0, Math.PI * 2);
  ctx.ellipse(x + 0.04, -0.1, 0.03, 0.12, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x, 0.08, 0.07, 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** The chequered strip across the road at the finish, `width` metres wide and `depth` deep. */
export function drawChequers(
  ctx: CanvasRenderingContext2D,
  width: number,
  depth: number,
  rows = 2,
) {
  const columns = Math.max(4, Math.round((width / depth) * rows));
  const cell = width / columns;
  const cellDepth = depth / rows;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      ctx.fillStyle = (row + column) % 2 === 0 ? '#ffffff' : '#1d1a20';
      ctx.fillRect(
        -width / 2 + column * cell,
        -row * cellDepth - cellDepth,
        cell + 0.01,
        cellDepth + 0.01,
      );
    }
  }
}

/** A traffic cone, about 0.7 m tall. Origin at its foot. */
export function drawCone(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#3a3640';
  roundRect(ctx, -0.24, -0.06, 0.48, 0.08, 0.02);
  ctx.fill();
  ctx.fillStyle = '#ff7a1f';
  ctx.beginPath();
  ctx.moveTo(-0.19, -0.04);
  ctx.lineTo(-0.035, -0.7);
  ctx.lineTo(0.035, -0.7);
  ctx.lineTo(0.19, -0.04);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(-0.135, -0.27);
  ctx.lineTo(-0.085, -0.46);
  ctx.lineTo(0.085, -0.46);
  ctx.lineTo(0.135, -0.27);
  ctx.closePath();
  ctx.fill();
  // The shade on its far side.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.beginPath();
  ctx.moveTo(0.04, -0.04);
  ctx.lineTo(0.03, -0.7);
  ctx.lineTo(0.035, -0.7);
  ctx.lineTo(0.19, -0.04);
  ctx.closePath();
  ctx.fill();
}

/**
 * The end of a closing lane: a red and white striped board on two legs, an
 * amber lamp blinking on each, and cones at its feet. About 3 m wide.
 * Origin at the middle of its foot. `wobble` (radians) rocks it after a hit.
 */
export function drawBarrier(ctx: CanvasRenderingContext2D, time: number, wobble = 0) {
  ctx.save();
  ctx.rotate(wobble);
  ctx.fillStyle = '#4a4650';
  for (const x of [-1.25, 1.25]) {
    ctx.fillRect(x - 0.06, -1.25, 0.12, 1.25);
    ctx.fillRect(x - 0.28, -0.08, 0.56, 0.08);
  }
  ctx.save();
  roundRect(ctx, -1.5, -1.22, 3, 0.48, 0.06);
  ctx.clip();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-1.5, -1.22, 3, 0.48);
  ctx.fillStyle = '#e8364f';
  for (let x = -1.9; x < 1.6; x += 0.5) {
    ctx.beginPath();
    ctx.moveTo(x, -0.74);
    ctx.lineTo(x + 0.25, -0.74);
    ctx.lineTo(x + 0.55, -1.22);
    ctx.lineTo(x + 0.3, -1.22);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = '#2a2320';
  ctx.lineWidth = 0.04;
  roundRect(ctx, -1.5, -1.22, 3, 0.48, 0.06);
  ctx.stroke();
  const on = Math.floor(time * 2.5) % 2 === 0;
  for (const [index, x] of [-1.25, 1.25].entries()) {
    const lit = on === (index === 0);
    ctx.fillStyle = lit ? '#ffcf33' : '#9a7a2a';
    ctx.beginPath();
    ctx.arc(x, -1.36, 0.12, 0, Math.PI * 2);
    ctx.fill();
    if (lit) {
      ctx.fillStyle = 'rgba(255, 214, 90, 0.35)';
      ctx.beginPath();
      ctx.arc(x, -1.36, 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  for (const x of [-0.85, 0, 0.85]) {
    ctx.save();
    ctx.translate(x, 0.25);
    drawCone(ctx);
    ctx.restore();
  }
}

/** The "lane ends" warning: two lanes on a yellow diamond, one bending into the other. */
export function drawLaneEndsSign(ctx: CanvasRenderingContext2D, merge: -1 | 1) {
  ctx.fillStyle = '#6b6b73';
  ctx.fillRect(-0.06, -1.6, 0.12, 1.6);
  ctx.save();
  ctx.translate(0, -1.95);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = '#ffcf33';
  roundRect(ctx, -0.42, -0.42, 0.84, 0.84, 0.08);
  ctx.fill();
  ctx.strokeStyle = '#2a2320';
  ctx.lineWidth = 0.06;
  roundRect(ctx, -0.36, -0.36, 0.72, 0.72, 0.06);
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.translate(0, -1.95);
  ctx.scale(-merge, 1);
  ctx.strokeStyle = '#2a2320';
  ctx.lineWidth = 0.07;
  ctx.lineCap = 'round';
  ctx.beginPath();
  // The lane that carries on, and the one that bends into it.
  ctx.moveTo(-0.1, 0.24);
  ctx.lineTo(-0.1, -0.24);
  ctx.moveTo(0.14, 0.24);
  ctx.lineTo(0.14, 0.02);
  ctx.quadraticCurveTo(0.14, -0.12, -0.02, -0.18);
  ctx.stroke();
  ctx.restore();
}
