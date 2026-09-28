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
