import type { TwistKind } from '../engine/twists';
import { withAlpha } from './palette';

/**
 * The tiny animated diagrams on the stage card: each twist shown in a few
 * lines on a 160 × 90 sketch, with a banana arcing across so the effect on
 * a throw is plain before the first one is thrown. A stage with no twist
 * shows its world's slow, floaty arc.
 */
export type DiagramKind = TwistKind | 'lowGravity';

interface Ink {
  line: string;
  faint: string;
  accent: string;
  banana: string;
}

const WIDTH = 160;
const HEIGHT = 90;
const GROUND = 84;
const LEFT = { x: 22, y: 52 };
const RIGHT = { x: 138, y: 46 };

function inkFor(theme: string | undefined): Ink {
  return theme === 'light'
    ? { line: '#3f3a58', faint: 'rgba(28, 25, 60, 0.18)', accent: '#b86a00', banana: '#c99a00' }
    : { line: '#c9c3e0', faint: 'rgba(255, 255, 255, 0.16)', accent: '#ffd23f', banana: '#ffe14d' };
}

export function drawTwistDiagram(
  canvas: HTMLCanvasElement,
  kind: DiagramKind,
  time: number,
  reducedMotion: boolean,
) {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
  const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const scale = Math.min(width / WIDTH, height / HEIGHT);
  ctx.setTransform(scale, 0, 0, scale, (width - WIDTH * scale) / 2, (height - HEIGHT * scale) / 2);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const ink = inkFor(document.documentElement.dataset.theme);
  // Reduced motion freezes each diagram on a telling moment.
  const t = reducedMotion ? 1.4 : time;
  switch (kind) {
    case 'gusts':
      return gusts(ctx, ink, t);
    case 'drone':
      return drone(ctx, ink, t);
    case 'supertall':
      return supertall(ctx, ink, t);
    case 'jetStream':
      return jetStream(ctx, ink, t);
    case 'hiddenWind':
      return hiddenWind(ctx, ink, t);
    case 'hillside':
      return hillside(ctx, ink, t);
    case 'bouncy':
      return bouncy(ctx, ink, t);
    case 'dustDevil':
      return dustDevil(ctx, ink, t);
    case 'lightning':
      return lightning(ctx, ink, t);
    case 'lowGravity':
      return lowGravity(ctx, ink, t);
  }
}

function block(ctx: CanvasRenderingContext2D, ink: Ink, x: number, top: number, width: number) {
  ctx.fillStyle = ink.faint;
  ctx.fillRect(x, top, width, GROUND - top);
  ctx.strokeStyle = ink.line;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, top, width, GROUND - top);
}

function gorilla(ctx: CanvasRenderingContext2D, ink: Ink, at: { x: number; y: number }) {
  ctx.fillStyle = ink.line;
  ctx.beginPath();
  ctx.arc(at.x, at.y - 5, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(at.x - 4, at.y - 2, 8, 6);
}

function city(ctx: CanvasRenderingContext2D, ink: Ink, left = LEFT, right = RIGHT) {
  block(ctx, ink, left.x - 12, left.y + 4, 24);
  block(ctx, ink, right.x - 12, right.y + 4, 24);
  gorilla(ctx, ink, left);
  gorilla(ctx, ink, right);
  ctx.strokeStyle = ink.faint;
  ctx.beginPath();
  ctx.moveTo(0, GROUND);
  ctx.lineTo(WIDTH, GROUND);
  ctx.stroke();
}

/** A banana thrown along `path` (share 0…1 → point), looping every `period` seconds. */
function throwAlong(
  ctx: CanvasRenderingContext2D,
  ink: Ink,
  time: number,
  path: (share: number) => { x: number; y: number },
  period = 2.4,
) {
  const share = Math.min(1, (time % period) / (period * 0.8));
  ctx.setLineDash([2, 3]);
  ctx.strokeStyle = withAlpha(ink.banana, 0.6);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let step = 0; step <= 30; step++) {
    const point = path((step / 30) * share);
    if (step === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  const head = path(share);
  ctx.fillStyle = ink.banana;
  ctx.beginPath();
  ctx.arc(head.x, head.y, 2.2, 0, Math.PI * 2);
  ctx.fill();
}

function arc(from: { x: number; y: number }, to: { x: number; y: number }, lift: number) {
  return (share: number) => ({
    x: from.x + (to.x - from.x) * share,
    y: from.y - 8 + (to.y - from.y) * share - Math.sin(share * Math.PI) * lift,
  });
}

function arrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  length: number,
  colour: string,
) {
  const direction = Math.sign(length) || 1;
  ctx.strokeStyle = colour;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x - length / 2, y);
  ctx.lineTo(x + length / 2, y);
  ctx.moveTo(x + length / 2 - direction * 4, y - 3);
  ctx.lineTo(x + length / 2, y);
  ctx.lineTo(x + length / 2 - direction * 4, y + 3);
  ctx.stroke();
}

function gusts(ctx: CanvasRenderingContext2D, ink: Ink, time: number) {
  city(ctx, ink);
  // A new wind every beat, the way the monsoon changes it after every throw.
  const beat = Math.floor(time / 1.2);
  const winds = [18, -10, 26, -22, 8];
  const wind = winds[beat % winds.length] ?? 0;
  arrow(ctx, 80, 12, wind * 1.4, ink.accent);
  ctx.strokeStyle = ink.line;
  ctx.beginPath();
  ctx.moveTo(80, GROUND);
  ctx.lineTo(80, 50);
  ctx.stroke();
  ctx.fillStyle = ink.accent;
  ctx.beginPath();
  ctx.moveTo(80, 50);
  ctx.lineTo(80 + Math.sign(wind) * 12, 53 + Math.sin(time * 9));
  ctx.lineTo(80, 56);
  ctx.fill();
}

function drone(ctx: CanvasRenderingContext2D, ink: Ink, time: number) {
  city(ctx, ink);
  ctx.setLineDash([1.5, 3]);
  ctx.strokeStyle = withAlpha('#ff3fa4', 0.7);
  ctx.beginPath();
  ctx.moveTo(52, 36);
  ctx.lineTo(108, 36);
  ctx.stroke();
  ctx.setLineDash([]);
  const along = (Math.sin(time * 1.6) + 1) / 2;
  const x = 52 + along * 56;
  ctx.fillStyle = '#ff3fa4';
  ctx.fillRect(x - 8, 32, 16, 8);
  ctx.fillStyle = ink.line;
  ctx.fillRect(x - 9, 29, 4, 1);
  ctx.fillRect(x + 5, 29, 4, 1);
  throwAlong(ctx, ink, time, arc(LEFT, RIGHT, 34));
}

function supertall(ctx: CanvasRenderingContext2D, ink: Ink, time: number) {
  city(ctx, ink);
  block(ctx, ink, 70, 14, 20);
  throwAlong(ctx, ink, time, arc(LEFT, RIGHT, 62));
}

function jetStream(ctx: CanvasRenderingContext2D, ink: Ink, time: number) {
  city(ctx, ink);
  ctx.fillStyle = withAlpha('#8fe6ff', 0.14);
  ctx.fillRect(0, 6, WIDTH, 16);
  ctx.strokeStyle = withAlpha('#8fe6ff', 0.7);
  ctx.lineWidth = 0.8;
  for (let lane = 0; lane < 3; lane++) {
    const offset = (time * 40 + lane * 50) % 180;
    ctx.beginPath();
    ctx.moveTo(offset - 10, 10 + lane * 5);
    ctx.lineTo(offset + 4, 10 + lane * 5);
    ctx.stroke();
  }
  // Inside the band the banana is carried off faster than the ground wind would.
  throwAlong(ctx, ink, time, (share) => {
    const base = arc(LEFT, { x: RIGHT.x - 30, y: RIGHT.y }, 58)(share);
    const inBand = base.y < 22 ? (22 - base.y) * 1.3 : 0;
    return { x: base.x + inBand + share * 20, y: base.y };
  });
}

function hiddenWind(ctx: CanvasRenderingContext2D, ink: Ink, time: number) {
  city(ctx, ink);
  ctx.strokeStyle = ink.line;
  ctx.strokeRect(62, 6, 36, 14);
  ctx.fillStyle = ink.accent;
  ctx.font = '700 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', 80, 13.5);
  // Heat shimmer, and smoke that still gives the wind away.
  ctx.strokeStyle = withAlpha(ink.accent, 0.3);
  for (let row = 0; row < 3; row++) {
    ctx.beginPath();
    for (let x = 40; x <= 120; x += 4) {
      const y = 44 + row * 9 + Math.sin(x * 0.2 + time * 3 + row) * 1.5;
      if (x === 40) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.fillStyle = withAlpha(ink.line, 0.5);
  for (let puff = 0; puff < 5; puff++) {
    const age = (time * 0.8 + puff / 5) % 1;
    ctx.beginPath();
    ctx.arc(RIGHT.x - 10 - age * 18, RIGHT.y - 4 - age * 22, 1.5 + age * 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function hillside(ctx: CanvasRenderingContext2D, ink: Ink, time: number) {
  const low = { x: 20, y: 70 };
  const high = { x: 140, y: 24 };
  for (let index = 0; index < 6; index++) {
    const top = 74 - index * 9.5;
    block(ctx, ink, 8 + index * 24, top, 23);
  }
  gorilla(ctx, ink, low);
  gorilla(ctx, ink, high);
  throwAlong(ctx, ink, time, arc(low, high, 40));
}

function bouncy(ctx: CanvasRenderingContext2D, ink: Ink, time: number) {
  city(ctx, ink);
  block(ctx, ink, 68, 48, 24);
  ctx.strokeStyle = '#7dffcf';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(68, 48);
  ctx.lineTo(92, 48);
  ctx.stroke();
  // First arc drops onto the springy roof, the second springs on to the target.
  throwAlong(ctx, ink, time, (share) => {
    if (share < 0.5) return arc(LEFT, { x: 80, y: 56 }, 26)(share * 2);
    return arc({ x: 80, y: 56 }, { x: RIGHT.x, y: RIGHT.y + 4 }, 24)((share - 0.5) * 2);
  });
}

function dustDevil(ctx: CanvasRenderingContext2D, ink: Ink, time: number) {
  city(ctx, ink);
  ctx.fillStyle = withAlpha('#d9a070', 0.3);
  ctx.beginPath();
  ctx.moveTo(66, 20);
  ctx.quadraticCurveTo(76, 60, 79, GROUND);
  ctx.lineTo(81, GROUND);
  ctx.quadraticCurveTo(84, 60, 94, 20);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#d9a070';
  for (let grain = 0; grain < 16; grain++) {
    const along = grain / 16;
    const radius = 2 + along * 12;
    const angle = time * 5 * (1.5 - along) + grain * 2.3;
    ctx.fillRect(80 + Math.cos(angle) * radius, GROUND - along * 64, 1.2, 1.2);
  }
  arrow(ctx, 80, 34, 14, ink.accent);
  throwAlong(ctx, ink, time, (share) => {
    const base = arc(LEFT, { x: RIGHT.x - 24, y: RIGHT.y }, 40)(share);
    const pushed = Math.max(0, Math.min(1, (base.x - 66) / 28)) * 24;
    return { x: base.x + pushed, y: base.y };
  });
}

function lightning(ctx: CanvasRenderingContext2D, ink: Ink, time: number) {
  city(ctx, ink);
  const cycle = time % 2.6;
  const struck = cycle > 1.6;
  ctx.save();
  if (struck) {
    ctx.beginPath();
    ctx.rect(0, 0, WIDTH, HEIGHT);
    ctx.arc(80, 50, 9, 0, Math.PI * 2, true);
    ctx.clip();
  }
  block(ctx, ink, 68, 50, 24);
  ctx.restore();
  if (!struck) {
    ctx.fillStyle = ink.accent;
    ctx.beginPath();
    ctx.moveTo(80, 30);
    ctx.lineTo(86, 41);
    ctx.lineTo(74, 41);
    ctx.closePath();
    ctx.fill();
  }
  if (cycle > 1.6 && cycle < 1.9) {
    ctx.strokeStyle = '#e8eeff';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(88, 0);
    ctx.lineTo(78, 16);
    ctx.lineTo(86, 24);
    ctx.lineTo(76, 42);
    ctx.lineTo(80, 50);
    ctx.stroke();
  }
}

function lowGravity(ctx: CanvasRenderingContext2D, ink: Ink, time: number) {
  city(ctx, ink);
  ctx.fillStyle = ink.line;
  ctx.font = '600 8px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('⅙ gravity · no wind', 80, 10);
  throwAlong(ctx, ink, time, arc(LEFT, RIGHT, 48), 4.2);
}
