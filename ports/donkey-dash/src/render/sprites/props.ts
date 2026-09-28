import type { Palette, PropKind } from '../palette';

/**
 * Roadside things as upright cut-outs, for the Chase view and the Classic
 * view's table-top. Metres, origin on the ground at the foot of the thing,
 * +y down. Each returns nothing; the caller scales, places and orders them.
 */
export interface PropStyle {
  palette: Palette;
  variant: number;
  time: number;
  /** Tiny on screen: skip the details. */
  simple: boolean;
}

/** Roughly how tall each prop is, so views can cull and sort without drawing. */
export const PROP_HEIGHT: Record<PropKind, number> = {
  tree: 5.5,
  pine: 6.5,
  bush: 1.2,
  hay: 1.4,
  fence: 1.1,
  pole: 7,
  barn: 7,
  windmill: 13,
  cactus: 3.2,
  rock: 1.3,
  mesa: 14,
  lamp: 4.2,
  snowman: 1.9,
  flowers: 0.6,
};

export function drawProp(ctx: CanvasRenderingContext2D, kind: PropKind, style: PropStyle) {
  const { palette, variant } = style;
  const size = 0.8 + variant * 0.45;
  ctx.save();
  switch (kind) {
    case 'tree':
      ctx.scale(size, size);
      ctx.fillStyle = palette.trunk;
      ctx.fillRect(-0.18, -2.2, 0.36, 2.2);
      blob(ctx, 0, -3.6, 1.7, palette.foliage[0]);
      blob(ctx, -0.5, -3.9, 1.2, palette.foliage[1]);
      blob(ctx, 0.45, -4.3, 0.95, palette.foliage[2]);
      break;
    case 'pine':
      ctx.scale(size, size);
      ctx.fillStyle = palette.trunk;
      ctx.fillRect(-0.15, -1, 0.3, 1);
      for (let tier = 0; tier < 3; tier++) {
        const base = -1 - tier * 1.5;
        const half = 1.5 - tier * 0.35;
        ctx.fillStyle = palette.foliage[
          tier === 2 && palette.look === 'snow' ? 2 : tier % 2
        ] as string;
        ctx.beginPath();
        ctx.moveTo(-half, base);
        ctx.lineTo(0, base - 2.3);
        ctx.lineTo(half, base);
        ctx.closePath();
        ctx.fill();
      }
      if (palette.look === 'snow') {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(-0.35, -5.2);
        ctx.lineTo(0, -6.3);
        ctx.lineTo(0.35, -5.2);
        ctx.fill();
      }
      break;
    case 'bush':
      ctx.scale(size, size);
      blob(ctx, -0.4, -0.5, 0.6, palette.foliage[0]);
      blob(ctx, 0.35, -0.55, 0.55, palette.foliage[1]);
      blob(ctx, 0, -0.8, 0.5, palette.foliage[2]);
      break;
    case 'hay':
      ctx.fillStyle = '#e0b54c';
      ctx.beginPath();
      ctx.ellipse(0, -0.7, 0.9, 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#c2932f';
      ctx.lineWidth = 0.06;
      for (let ring = 1; ring < 4; ring++) {
        ctx.beginPath();
        ctx.ellipse(0.25, -0.7, 0.18 * ring, 0.16 * ring, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    case 'barn':
      ctx.fillStyle = palette.roof;
      ctx.fillRect(-4, -4.4, 8, 4.4);
      ctx.fillStyle = shade(palette.roof);
      ctx.beginPath();
      ctx.moveTo(-4.5, -4.2);
      ctx.lineTo(-2.4, -6.6);
      ctx.lineTo(2.4, -6.6);
      ctx.lineTo(4.5, -4.2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = palette.wall;
      ctx.fillRect(-1.2, -3, 2.4, 3);
      ctx.strokeStyle = palette.roof;
      ctx.lineWidth = 0.18;
      ctx.beginPath();
      ctx.moveTo(-1.2, -3);
      ctx.lineTo(1.2, 0);
      ctx.moveTo(1.2, -3);
      ctx.lineTo(-1.2, 0);
      ctx.stroke();
      windowGlow(ctx, palette, -3, -3.4);
      windowGlow(ctx, palette, 2.2, -3.4);
      break;
    case 'windmill': {
      ctx.fillStyle = palette.wall;
      ctx.beginPath();
      ctx.moveTo(-1.4, 0);
      ctx.lineTo(-0.8, -8.5);
      ctx.lineTo(0.8, -8.5);
      ctx.lineTo(1.4, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = palette.roof;
      ctx.beginPath();
      ctx.moveTo(-1.1, -8.4);
      ctx.lineTo(0, -10);
      ctx.lineTo(1.1, -8.4);
      ctx.fill();
      ctx.translate(0, -8.8);
      ctx.rotate(style.time * 0.8 + variant * 6);
      ctx.fillStyle = '#f4eadc';
      for (let blade = 0; blade < 4; blade++) {
        ctx.rotate(Math.PI / 2);
        ctx.fillRect(-0.28, -4.2, 0.56, 3.9);
      }
      ctx.fillStyle = palette.trunk;
      ctx.beginPath();
      ctx.arc(0, 0, 0.3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'cactus':
      ctx.scale(size, size);
      ctx.fillStyle = palette.foliage[1];
      capsule(ctx, 0, -3.1, 0.55, 3.1);
      capsule(ctx, -0.95, -2.2, 0.4, 1.1);
      capsule(ctx, 0.95, -2.6, 0.4, 1.2);
      ctx.fillRect(-0.95, -1.35, 0.8, 0.4);
      ctx.fillRect(0.15, -1.75, 0.8, 0.4);
      if (!style.simple) {
        ctx.fillStyle = palette.accent;
        ctx.beginPath();
        ctx.arc(0, -3.15, 0.18, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'rock':
      ctx.scale(size, size);
      ctx.fillStyle = palette.rock;
      ctx.beginPath();
      ctx.moveTo(-1, 0);
      ctx.lineTo(-0.8, -0.8);
      ctx.lineTo(-0.1, -1.25);
      ctx.lineTo(0.7, -0.9);
      ctx.lineTo(1, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.beginPath();
      ctx.moveTo(-0.8, -0.8);
      ctx.lineTo(-0.1, -1.25);
      ctx.lineTo(-0.2, -0.6);
      ctx.fill();
      break;
    case 'mesa':
      ctx.fillStyle = palette.rock;
      ctx.beginPath();
      ctx.moveTo(-11, 0);
      ctx.lineTo(-7, -13);
      ctx.lineTo(6, -13.5);
      ctx.lineTo(10, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
      ctx.fillRect(-9, -6, 18, 1.2);
      break;
    case 'lamp':
      ctx.fillStyle = '#3a3a44';
      ctx.fillRect(-0.08, -4, 0.16, 4);
      ctx.fillRect(-0.08, -4, 0.8, 0.14);
      ctx.fillStyle = palette.daylight < 0.5 ? '#fff1b0' : '#d8d8d8';
      ctx.beginPath();
      ctx.ellipse(0.7, -3.8, 0.24, 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      if (palette.daylight < 0.5) {
        const glow = ctx.createRadialGradient(0.7, -3.7, 0, 0.7, -3.7, 2.4);
        glow.addColorStop(0, 'rgba(255, 230, 150, 0.45)');
        glow.addColorStop(1, 'rgba(255, 230, 150, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(-1.8, -6.2, 5, 5);
      }
      break;
    case 'snowman':
      for (const [y, r] of [
        [-0.5, 0.5],
        [-1.2, 0.36],
        [-1.7, 0.26],
      ] as const) {
        // A cool shade on the shadow side, so a snowman still shows against snow.
        ctx.fillStyle = '#b8c6de';
        ctx.beginPath();
        ctx.arc(0, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-r * 0.14, y - r * 0.12, r * 0.84, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#e8743a';
      ctx.beginPath();
      ctx.moveTo(0.05, -1.72);
      ctx.lineTo(0.45, -1.66);
      ctx.lineTo(0.05, -1.62);
      ctx.fill();
      ctx.fillStyle = palette.accent;
      ctx.fillRect(-0.3, -1.46, 0.6, 0.1);
      break;
    case 'flowers':
      for (let flower = 0; flower < 5; flower++) {
        const x = (flower - 2) * 0.28;
        ctx.strokeStyle = palette.foliage[0];
        ctx.lineWidth = 0.05;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, -0.35 - (flower % 2) * 0.15);
        ctx.stroke();
        ctx.fillStyle = flower % 2 === 0 ? palette.accent : '#ffffff';
        ctx.beginPath();
        ctx.arc(x, -0.4 - (flower % 2) * 0.15, 0.1, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'fence':
    case 'pole':
      break;
  }
  ctx.restore();
}

/** A telegraph pole with its crossbar. */
export function drawPole(ctx: CanvasRenderingContext2D, palette: Palette) {
  ctx.fillStyle = palette.trunk;
  ctx.fillRect(-0.12, -7, 0.24, 7);
  ctx.fillRect(-1, -6.5, 2, 0.18);
  ctx.fillStyle = '#d8d8d8';
  for (const x of [-0.85, 0.85]) ctx.fillRect(x - 0.06, -6.75, 0.12, 0.25);
}

function blob(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, colour: string) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function capsule(
  ctx: CanvasRenderingContext2D,
  x: number,
  top: number,
  width: number,
  height: number,
) {
  const radius = width / 2;
  ctx.beginPath();
  ctx.arc(x, top + radius, radius, Math.PI, 0);
  ctx.lineTo(x + radius, top + height);
  ctx.lineTo(x - radius, top + height);
  ctx.closePath();
  ctx.fill();
}

function windowGlow(ctx: CanvasRenderingContext2D, palette: Palette, x: number, y: number) {
  ctx.fillStyle = palette.daylight < 0.5 ? '#ffd978' : 'rgba(40, 40, 60, 0.6)';
  ctx.fillRect(x, y, 0.8, 0.8);
}

function shade(hex: string): string {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  const r = Math.round(((value >> 16) & 255) * 0.72);
  const g = Math.round(((value >> 8) & 255) * 0.72);
  const b = Math.round((value & 255) * 0.72);
  return `rgb(${r}, ${g}, ${b})`;
}
