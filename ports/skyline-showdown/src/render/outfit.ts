import type { Point } from '../engine/geometry';
import { shade, withAlpha } from './palette';

/**
 * Wardrobe items, drawn by code. Hats and glasses are drawn in the head's
 * own coordinates (the skull spans about -6…6 around the origin, the eyes
 * sit at x -0.6 and 3, facing right); neckwear in the body's 30 × 30 box.
 * Every piece is decoration: the hitbox stays the gorilla's own, so a
 * banana through the brim of a top hat is still a miss.
 */
const GOLD = '#ffcf4a';
const GOLD_DARK = '#a8761c';
const INK = '#17121c';

export function drawHeadwear(
  ctx: CanvasRenderingContext2D,
  id: string,
  accent: string,
  time: number,
) {
  switch (id) {
    case 'hat-cap':
      return cap(ctx, accent);
    case 'hat-headphones':
      return headphones(ctx, accent);
    case 'hat-beanie':
      return beanie(ctx, accent);
    case 'hat-party':
      return partyHat(ctx, accent);
    case 'hat-propeller':
      return propellerCap(ctx, accent, time);
    case 'hat-top':
      return topHat(ctx, accent);
    case 'hat-helmet':
      return helmet(ctx, accent);
    case 'hat-crown':
      return crown(ctx, accent);
    case 'hat-halo':
      return halo(ctx, accent, time);
  }
}

function outline(ctx: CanvasRenderingContext2D, width = 0.6) {
  ctx.lineWidth = width;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

function cap(ctx: CanvasRenderingContext2D, accent: string) {
  ctx.beginPath();
  ctx.moveTo(-5.5, -1.8);
  ctx.bezierCurveTo(-5.6, -6.6, 5.4, -7.6, 6, -2.4);
  ctx.closePath();
  ctx.fillStyle = accent;
  ctx.fill();
  outline(ctx);
  // The brim, reaching forward.
  ctx.beginPath();
  ctx.moveTo(4.6, -2.6);
  ctx.quadraticCurveTo(8.2, -2.9, 9.8, -1.6);
  ctx.lineTo(5.6, -1.5);
  ctx.closePath();
  ctx.fillStyle = shade(accent, -0.3);
  ctx.fill();
  outline(ctx, 0.5);
  ctx.fillStyle = shade(accent, 0.45);
  ctx.beginPath();
  ctx.arc(0.2, -6.1, 0.8, 0, Math.PI * 2);
  ctx.fill();
}

function headphones(ctx: CanvasRenderingContext2D, accent: string) {
  ctx.beginPath();
  ctx.arc(0.1, -1.2, 6.4, Math.PI * 1.05, Math.PI * 1.95);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.2;
  ctx.stroke();
  ctx.strokeStyle = '#4a4458';
  ctx.lineWidth = 1.3;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(-2.6, -0.2, 2.2, 2.9, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#2a2632';
  ctx.fill();
  outline(ctx);
  ctx.beginPath();
  ctx.ellipse(-2.6, -0.2, 1.3, 1.9, 0, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();
}

function beanie(ctx: CanvasRenderingContext2D, accent: string) {
  ctx.beginPath();
  ctx.moveTo(-5.8, -0.9);
  ctx.bezierCurveTo(-6.4, -8.2, 6.4, -8.8, 6.2, -1.2);
  ctx.closePath();
  ctx.fillStyle = accent;
  ctx.fill();
  outline(ctx);
  // Knitted ribs and a turned-up band.
  ctx.strokeStyle = withAlpha(shade(accent, -0.35), 0.8);
  ctx.lineWidth = 0.35;
  for (let x = -4; x <= 5; x += 1.6) {
    ctx.beginPath();
    ctx.moveTo(x, -2.4);
    ctx.lineTo(x * 0.55, -6.4);
    ctx.stroke();
  }
  ctx.fillStyle = shade(accent, -0.2);
  ctx.fillRect(-5.9, -2.6, 12.1, 1.8);
  ctx.fillStyle = '#fff6ea';
  ctx.beginPath();
  ctx.arc(0.3, -7.9, 1.7, 0, Math.PI * 2);
  ctx.fill();
  outline(ctx, 0.4);
}

function partyHat(ctx: CanvasRenderingContext2D, accent: string) {
  ctx.save();
  ctx.rotate(0.18);
  ctx.beginPath();
  ctx.moveTo(-3.4, -4.6);
  ctx.lineTo(1, -14.5);
  ctx.lineTo(4.6, -4.8);
  ctx.closePath();
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = '#fff6ea';
  ctx.lineWidth = 1.1;
  for (let y = -6; y > -15; y -= 3) {
    ctx.beginPath();
    ctx.moveTo(-4, y + 1.5);
    ctx.lineTo(6, y - 1.5);
    ctx.stroke();
  }
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(-3.4, -4.6);
  ctx.lineTo(1, -14.5);
  ctx.lineTo(4.6, -4.8);
  outline(ctx);
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.arc(1, -14.8, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function propellerCap(ctx: CanvasRenderingContext2D, accent: string, time: number) {
  const panels = [accent, '#ffe14d', '#4fd8ff', '#ff5d8f'];
  panels.forEach((colour, index) => {
    const from = Math.PI + (index / panels.length) * Math.PI;
    const to = Math.PI + ((index + 1) / panels.length) * Math.PI;
    ctx.beginPath();
    ctx.moveTo(0.3, -1.6);
    ctx.ellipse(0.3, -1.6, 6, 5.4, 0, from, to);
    ctx.closePath();
    ctx.fillStyle = colour;
    ctx.fill();
  });
  ctx.beginPath();
  ctx.ellipse(0.3, -1.6, 6, 5.4, 0, Math.PI, Math.PI * 2);
  outline(ctx);
  ctx.fillStyle = INK;
  ctx.fillRect(0, -9, 0.6, 2.2);
  // The propeller, seen edge-on as it turns.
  const reach = 4.6 * Math.cos(time * 14);
  ctx.beginPath();
  ctx.moveTo(0.3 - reach, -9.2);
  ctx.lineTo(0.3 + reach, -9.2);
  ctx.strokeStyle = '#ff5d8f';
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

function topHat(ctx: CanvasRenderingContext2D, accent: string) {
  ctx.beginPath();
  ctx.ellipse(0.6, -4.3, 7.4, 1.5, -0.05, 0, Math.PI * 2);
  ctx.fillStyle = '#1b1822';
  ctx.fill();
  outline(ctx, 0.5);
  ctx.beginPath();
  ctx.moveTo(-3.6, -4.6);
  ctx.lineTo(-3.2, -14.5);
  ctx.quadraticCurveTo(0.8, -15.4, 4.8, -14.6);
  ctx.lineTo(5, -4.8);
  ctx.closePath();
  ctx.fillStyle = '#211d2a';
  ctx.fill();
  outline(ctx, 0.5);
  ctx.fillStyle = accent;
  ctx.fillRect(-3.5, -7.4, 8.4, 1.8);
  ctx.fillStyle = withAlpha('#ffffff', 0.18);
  ctx.fillRect(-2.4, -14, 0.8, 6.2);
}

function helmet(ctx: CanvasRenderingContext2D, accent: string) {
  const glass = ctx.createRadialGradient(-2, -4, 1, 0.8, -0.6, 9);
  glass.addColorStop(0, withAlpha('#ffffff', 0.35));
  glass.addColorStop(0.6, withAlpha('#bfe6ff', 0.12));
  glass.addColorStop(1, withAlpha('#bfe6ff', 0.3));
  ctx.beginPath();
  ctx.arc(0.8, -0.6, 8.6, 0, Math.PI * 2);
  ctx.fillStyle = glass;
  ctx.fill();
  ctx.lineWidth = 0.7;
  ctx.strokeStyle = withAlpha('#e8f6ff', 0.85);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-1.6, -3.6, 4.2, Math.PI * 1.1, Math.PI * 1.45);
  ctx.strokeStyle = withAlpha('#ffffff', 0.8);
  ctx.lineWidth = 0.9;
  ctx.stroke();
  // The collar ring where the helmet meets the suit.
  ctx.beginPath();
  ctx.ellipse(0.8, 7.2, 6.2, 1.4, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#d8dde8';
  ctx.fill();
  outline(ctx, 0.5);
  ctx.fillStyle = accent;
  ctx.fillRect(-2.2, 6.6, 1.6, 1.2);
}

function crown(ctx: CanvasRenderingContext2D, accent: string) {
  ctx.beginPath();
  ctx.moveTo(-4.4, -4.2);
  ctx.lineTo(-5, -10);
  ctx.lineTo(-2.2, -7.2);
  ctx.lineTo(0.4, -11.2);
  ctx.lineTo(3, -7.2);
  ctx.lineTo(5.8, -10);
  ctx.lineTo(5.2, -4.4);
  ctx.closePath();
  const metal = ctx.createLinearGradient(0, -11, 0, -4);
  metal.addColorStop(0, '#fff2a8');
  metal.addColorStop(1, GOLD_DARK);
  ctx.fillStyle = metal;
  ctx.fill();
  outline(ctx, 0.5);
  ctx.fillStyle = accent;
  for (const [x, y] of [
    [-5, -10],
    [0.4, -11.2],
    [5.8, -10],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x, y, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillRect(-0.4, -6.4, 1.6, 1.4);
}

function halo(ctx: CanvasRenderingContext2D, accent: string, time: number) {
  const pulse = 0.7 + 0.3 * Math.sin(time * 5);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath();
  ctx.ellipse(0.5, -10, 5.8, 1.7, 0, 0, Math.PI * 2);
  ctx.strokeStyle = withAlpha(accent, 0.35 * pulse);
  ctx.lineWidth = 2.6;
  ctx.stroke();
  ctx.strokeStyle = withAlpha('#f4f0ff', 0.9);
  ctx.lineWidth = 0.8;
  ctx.stroke();
  // A little crackle of static running round the ring.
  const spark = time * 3;
  const x = 0.5 + Math.cos(spark) * 5.8;
  const y = -10 + Math.sin(spark) * 1.7;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + 1, y - 1.6);
  ctx.lineTo(x - 0.2, y - 1.8);
  ctx.lineTo(x + 0.8, y - 3.4);
  ctx.strokeStyle = withAlpha('#ffffff', pulse);
  ctx.lineWidth = 0.5;
  ctx.stroke();
  ctx.restore();
}

/** Glasses go on after the eyes; opaque lenses hide them, as sunglasses do. */
export function drawEyewear(ctx: CanvasRenderingContext2D, id: string, accent: string) {
  switch (id) {
    case 'eyes-shades':
      return lenses(ctx, '#15121c', INK, 1.1);
    case 'eyes-aviators':
      return aviators(ctx);
    case 'eyes-3d':
      return glasses3d(ctx);
    case 'eyes-goggles':
      return goggles(ctx, accent);
    case 'eyes-monocle':
      return monocle(ctx);
    case 'eyes-visor':
      return visor(ctx, accent);
  }
}

const EYES = [-0.6, 3] as const;

function lenses(ctx: CanvasRenderingContext2D, fill: string, frame: string, height: number) {
  ctx.beginPath();
  for (const x of EYES) ctx.roundRect(x - 1.5, -1.1, 3, height * 1.6, 0.6);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 0.45;
  ctx.strokeStyle = frame;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0.9, -0.6);
  ctx.lineTo(1.5, -0.6);
  ctx.moveTo(-2.1, -0.5);
  ctx.lineTo(-4.8, -1);
  ctx.stroke();
  ctx.fillStyle = withAlpha('#ffffff', 0.55);
  for (const x of EYES) ctx.fillRect(x - 1, -0.8, 0.8, 0.35);
}

function aviators(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  for (const x of EYES) {
    ctx.moveTo(x - 1.6, -1.1);
    ctx.lineTo(x + 1.6, -1.1);
    ctx.quadraticCurveTo(x + 1.6, 1.6, x, 1.4);
    ctx.quadraticCurveTo(x - 1.7, 1.2, x - 1.6, -1.1);
  }
  const tint = ctx.createLinearGradient(0, -1.1, 0, 1.4);
  tint.addColorStop(0, '#3b2a1c');
  tint.addColorStop(1, '#c98a3a');
  ctx.fillStyle = tint;
  ctx.fill();
  ctx.lineWidth = 0.4;
  ctx.strokeStyle = GOLD;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(1, -0.9);
  ctx.lineTo(1.4, -0.9);
  ctx.moveTo(-2.2, -0.9);
  ctx.lineTo(-4.8, -1.2);
  ctx.stroke();
}

function glasses3d(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#f4f1ea';
  ctx.beginPath();
  ctx.roundRect(-2.6, -1.6, 7.4, 2.9, 0.6);
  ctx.fill();
  outline(ctx, 0.4);
  ctx.fillStyle = '#ff3b4f';
  ctx.fillRect(-2, -1.1, 2.6, 1.9);
  ctx.fillStyle = '#29d0ff';
  ctx.fillRect(1.6, -1.1, 2.6, 1.9);
  ctx.fillStyle = '#f4f1ea';
  ctx.fillRect(-5, -1, 2.6, 0.6);
}

function goggles(ctx: CanvasRenderingContext2D, accent: string) {
  ctx.fillStyle = shade(accent, -0.25);
  ctx.beginPath();
  ctx.moveTo(-5.8, -1.8);
  ctx.quadraticCurveTo(0, -2.9, 5.9, -1.7);
  ctx.lineTo(5.9, -0.2);
  ctx.quadraticCurveTo(0, -1.4, -5.8, -0.3);
  ctx.closePath();
  ctx.fill();
  for (const x of EYES) {
    ctx.beginPath();
    ctx.arc(x, -0.4, 1.75, 0, Math.PI * 2);
    ctx.fillStyle = '#6a5a44';
    ctx.fill();
    outline(ctx, 0.5);
    ctx.beginPath();
    ctx.arc(x, -0.4, 1.15, 0, Math.PI * 2);
    ctx.fillStyle = '#9fdcff';
    ctx.fill();
    ctx.fillStyle = withAlpha('#ffffff', 0.7);
    ctx.fillRect(x - 0.7, -1, 0.6, 0.4);
  }
}

function monocle(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.arc(3, -0.2, 1.7, 0, Math.PI * 2);
  ctx.fillStyle = withAlpha('#dff4ff', 0.3);
  ctx.fill();
  ctx.lineWidth = 0.5;
  ctx.strokeStyle = GOLD;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(3.4, 1.5);
  ctx.quadraticCurveTo(4.6, 4, 2.4, 6.2);
  ctx.lineWidth = 0.3;
  ctx.stroke();
}

function visor(ctx: CanvasRenderingContext2D, accent: string) {
  ctx.beginPath();
  ctx.roundRect(-3, -1.5, 8.6, 2.4, 1.2);
  ctx.fillStyle = '#120d1a';
  ctx.fill();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = withAlpha(accent, 0.95);
  ctx.fillRect(-2.4, -0.7, 7.4, 0.8);
  ctx.fillStyle = withAlpha(accent, 0.25);
  ctx.fillRect(-3.4, -1.9, 9.4, 3.2);
  ctx.restore();
}

/** The head bandana: a band across the brow, tails streaming behind. */
export function drawHeadBandana(ctx: CanvasRenderingContext2D, accent: string) {
  ctx.beginPath();
  ctx.moveTo(-5.6, -1.6);
  ctx.quadraticCurveTo(0.3, -3.6, 5.9, -1.9);
  ctx.lineTo(5.9, -0.4);
  ctx.quadraticCurveTo(0.3, -2.1, -5.7, -0.1);
  ctx.closePath();
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-5.4, -0.9);
  ctx.quadraticCurveTo(-8.2, -1.8, -9.6, 0.6);
  ctx.moveTo(-5.4, -0.6);
  ctx.quadraticCurveTo(-7.8, 0.6, -8.4, 2.8);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

/** A cape hangs behind the body, so it is drawn first. */
export function drawCape(
  ctx: CanvasRenderingContext2D,
  accent: string,
  drop: number,
  time: number,
) {
  const sway = Math.sin(time * 2.4) * 1.2;
  ctx.beginPath();
  ctx.moveTo(8, 9 + drop);
  ctx.lineTo(22, 9 + drop);
  ctx.quadraticCurveTo(24, 18 + drop, 21 + sway * 0.4, 27);
  ctx.lineTo(4 + sway, 27.5);
  ctx.quadraticCurveTo(1.5 + sway, 18 + drop, 8, 9 + drop);
  ctx.closePath();
  const cloth = ctx.createLinearGradient(0, 9, 0, 28);
  cloth.addColorStop(0, shade(accent, -0.2));
  cloth.addColorStop(1, shade(accent, -0.5));
  ctx.fillStyle = cloth;
  ctx.fill();
  outline(ctx, 0.6);
}

/** Scarves, bows and medals sit at the neck, over the body and under the head. */
export function drawNeckwear(
  ctx: CanvasRenderingContext2D,
  id: string,
  accent: string,
  drop: number,
  time: number,
) {
  switch (id) {
    case 'neck-scarf':
      return scarf(ctx, accent, drop, time);
    case 'neck-bow':
      return bowTie(ctx, accent, drop);
    case 'neck-cape':
      return capeClasp(ctx, drop);
    case 'neck-medal':
      return medal(ctx, accent, drop);
  }
}

function scarf(ctx: CanvasRenderingContext2D, accent: string, drop: number, time: number) {
  ctx.beginPath();
  ctx.roundRect(9.5, 8.6 + drop, 13, 3.2, 1.4);
  ctx.fillStyle = accent;
  ctx.fill();
  outline(ctx, 0.5);
  // The loose end flutters behind.
  const flutter = Math.sin(time * 6) * 0.8;
  ctx.beginPath();
  ctx.moveTo(10.5, 10 + drop);
  ctx.quadraticCurveTo(6.5, 11 + drop + flutter, 4.2, 13.6 + drop + flutter);
  ctx.lineTo(5.2, 15 + drop + flutter);
  ctx.quadraticCurveTo(8, 12.6 + drop, 11.5, 11.6 + drop);
  ctx.closePath();
  ctx.fillStyle = shade(accent, -0.15);
  ctx.fill();
  outline(ctx, 0.4);
  ctx.strokeStyle = withAlpha('#ffffff', 0.45);
  ctx.lineWidth = 0.5;
  for (const x of [13, 16, 19]) {
    ctx.beginPath();
    ctx.moveTo(x, 8.8 + drop);
    ctx.lineTo(x, 11.6 + drop);
    ctx.stroke();
  }
}

function bowTie(ctx: CanvasRenderingContext2D, accent: string, drop: number) {
  const x = 18;
  const y = 11.2 + drop;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - 3, y - 1.7);
  ctx.lineTo(x - 3, y + 1.7);
  ctx.closePath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + 3, y - 1.7);
  ctx.lineTo(x + 3, y + 1.7);
  ctx.closePath();
  ctx.fillStyle = accent;
  ctx.fill();
  outline(ctx, 0.4);
  ctx.beginPath();
  ctx.arc(x, y, 0.8, 0, Math.PI * 2);
  ctx.fillStyle = shade(accent, -0.3);
  ctx.fill();
}

function capeClasp(ctx: CanvasRenderingContext2D, drop: number) {
  ctx.beginPath();
  ctx.arc(9.5, 10.2 + drop, 1, 0, Math.PI * 2);
  ctx.arc(21, 10.2 + drop, 1, 0, Math.PI * 2);
  ctx.fillStyle = GOLD;
  ctx.fill();
}

function medal(ctx: CanvasRenderingContext2D, accent: string, drop: number) {
  ctx.beginPath();
  ctx.moveTo(12.5, 9.5 + drop);
  ctx.lineTo(17, 16 + drop);
  ctx.lineTo(21.5, 9.5 + drop);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(17, 17.4 + drop, 2.2, 0, Math.PI * 2);
  const metal = ctx.createRadialGradient(16.3, 16.6 + drop, 0.3, 17, 17.4 + drop, 2.2);
  metal.addColorStop(0, '#fff6c4');
  metal.addColorStop(1, GOLD_DARK);
  ctx.fillStyle = metal;
  ctx.fill();
  outline(ctx, 0.4);
}

/**
 * A banana, centred on the origin, about 8 units long, in the thrower's
 * chosen skin. The Golden Banana power-up always looks golden: that is
 * information, not decoration.
 */
export function drawBanana(
  ctx: CanvasRenderingContext2D,
  skin = 'banana-classic',
  golden = false,
  time = 0,
) {
  if (golden) return peel(ctx, '#8a5a00', '#ffd54a', '#fff6c0');
  switch (skin) {
    case 'banana-green':
      return peel(ctx, '#3c5a10', '#b5dc4a', '#effab0');
    case 'banana-ripe':
      peel(ctx, '#5a3a08', '#ffd84a', '#fff4b0');
      return ripeSpots(ctx);
    case 'banana-pixel':
      return pixelBanana(ctx);
    case 'banana-fire':
      return fireBanana(ctx, time);
    case 'banana-candy':
      return candyBanana(ctx);
    case 'banana-glow':
      return glowBanana(ctx);
    case 'banana-chrome':
      return chromeBanana(ctx);
    default:
      return peel(ctx, '#5a3a08', '#ffe14d', '#fff7b8');
  }
}

function bananaArc(ctx: CanvasRenderingContext2D, radius = 4.2, from = 0.2, to = 0.8) {
  ctx.beginPath();
  ctx.arc(0, -2.4, radius, Math.PI * from, Math.PI * to);
}

function peel(ctx: CanvasRenderingContext2D, edge: string, body: string, shine: string) {
  ctx.lineCap = 'round';
  bananaArc(ctx, 4.2, 0.18, 0.82);
  ctx.strokeStyle = edge;
  ctx.lineWidth = 3.4;
  ctx.stroke();
  bananaArc(ctx);
  ctx.strokeStyle = body;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  bananaArc(ctx, 3.6, 0.3, 0.62);
  ctx.strokeStyle = shine;
  ctx.lineWidth = 0.7;
  ctx.stroke();
}

function ripeSpots(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#6a4210';
  for (const angle of [0.3, 0.46, 0.58, 0.7]) {
    const x = Math.cos(Math.PI * angle) * 4.2;
    const y = -2.4 + Math.sin(Math.PI * angle) * 4.2;
    ctx.beginPath();
    ctx.arc(x, y, 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A tiny pixel-art banana, built square by square. */
const PIXEL_ROWS = ['.....##', '....##.', '#..###.', '.####..', '..##...'];

function pixelBanana(ctx: CanvasRenderingContext2D) {
  const size = 1.25;
  PIXEL_ROWS.forEach((row, y) => {
    [...row].forEach((cell, x) => {
      if (cell !== '#') return;
      ctx.fillStyle = y === 0 || x === 0 ? '#6a4a10' : y >= 3 ? '#e8b820' : '#ffe14d';
      ctx.fillRect(-4.4 + x * size, -3.2 + y * size, size, size);
    });
  });
}

function fireBanana(ctx: CanvasRenderingContext2D, time: number) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const flicker = 0.75 + 0.25 * Math.sin(time * 30);
  bananaArc(ctx, 4.2, 0.12, 0.88);
  ctx.strokeStyle = withAlpha('#ff5a1a', 0.5 * flicker);
  ctx.lineWidth = 5.5;
  ctx.stroke();
  ctx.restore();
  peel(ctx, '#7a1a08', '#ff7a2a', '#ffe08a');
}

function candyBanana(ctx: CanvasRenderingContext2D) {
  peel(ctx, '#8a2030', '#fff4f0', '#ffffff');
  ctx.save();
  ctx.setLineDash([1.1, 1.1]);
  bananaArc(ctx);
  ctx.strokeStyle = '#ff3b5c';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();
}

function glowBanana(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  bananaArc(ctx, 4.2, 0.12, 0.88);
  ctx.strokeStyle = withAlpha('#7dff6a', 0.35);
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.restore();
  peel(ctx, '#1f6a20', '#9dff7a', '#f0ffe8');
}

function chromeBanana(ctx: CanvasRenderingContext2D) {
  peel(ctx, '#3a3f4a', '#c4ccd8', '#ffffff');
  bananaArc(ctx, 4.2, 0.45, 0.55);
  ctx.strokeStyle = '#6e7888';
  ctx.lineWidth = 2.5;
  ctx.stroke();
}

/** One banana's recent path, drawn in the thrower's trail style. */
export function drawTrail(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  style: string,
  accent: string,
  golden: boolean,
  time: number,
) {
  if (golden) return streak(ctx, points, '#ffd23f');
  switch (style) {
    case 'trail-hearts':
      return stamps(ctx, points, (x, y, share) => heart(ctx, x, y, share * 2.2, '#ff5d8f', share));
    case 'trail-sparkle':
      return stamps(ctx, points, (x, y, share, index) =>
        sparkle(ctx, x, y, share * 2.6 * (0.6 + 0.4 * Math.sin(time * 20 + index)), share),
      );
    case 'trail-neon':
      return streak(ctx, points, accent, 1.5);
    case 'trail-smoke':
      return smoke(ctx, points);
    case 'trail-rainbow':
      return rainbow(ctx, points);
    case 'trail-bubbles':
      return stamps(ctx, points, (x, y, share) =>
        bubble(ctx, x, y, (1.4 - share) * 2 + 0.6, share),
      );
    default:
      return streak(ctx, points, '#ffe68a');
  }
}

function streak(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  colour: string,
  width = 1,
) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1] as Point;
    const to = points[index] as Point;
    const share = index / points.length;
    ctx.strokeStyle = withAlpha(colour, share * 0.7);
    ctx.lineWidth = share * 3.2 * width;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
  ctx.restore();
}

/** Calls `stamp` on every other point, oldest first, with how recent it is (0…1). */
function stamps(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  stamp: (x: number, y: number, share: number, index: number) => void,
) {
  ctx.save();
  points.forEach((point, index) => {
    if (index % 2 !== 0) return;
    stamp(point.x, point.y, (index + 1) / points.length, index);
  });
  ctx.restore();
}

function heart(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  colour: string,
  alpha: number,
) {
  ctx.fillStyle = withAlpha(colour, alpha * 0.85);
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.6);
  ctx.bezierCurveTo(
    x - size * 1.2,
    y - size * 0.1,
    x - size * 0.5,
    y - size * 0.9,
    x,
    y - size * 0.3,
  );
  ctx.bezierCurveTo(
    x + size * 0.5,
    y - size * 0.9,
    x + size * 1.2,
    y - size * 0.1,
    x,
    y + size * 0.6,
  );
  ctx.fill();
}

function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, alpha: number) {
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = withAlpha('#fff2b0', alpha);
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x + size * 0.25, y - size * 0.25);
  ctx.lineTo(x + size, y);
  ctx.lineTo(x + size * 0.25, y + size * 0.25);
  ctx.lineTo(x, y + size);
  ctx.lineTo(x - size * 0.25, y + size * 0.25);
  ctx.lineTo(x - size, y);
  ctx.lineTo(x - size * 0.25, y - size * 0.25);
  ctx.closePath();
  ctx.fill();
}

function smoke(ctx: CanvasRenderingContext2D, points: readonly Point[]) {
  points.forEach((point, index) => {
    const share = (index + 1) / points.length;
    ctx.fillStyle = withAlpha('#b8b0bc', share * 0.35);
    ctx.beginPath();
    ctx.arc(point.x, point.y, 1 + (1 - share) * 3, 0, Math.PI * 2);
    ctx.fill();
  });
}

const RAINBOW = ['#ff4d4d', '#ffa53d', '#ffe14d', '#5dff7a', '#4dc8ff', '#9b6bff'];

function rainbow(ctx: CanvasRenderingContext2D, points: readonly Point[]) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1] as Point;
    const to = points[index] as Point;
    const share = index / points.length;
    ctx.strokeStyle = withAlpha(RAINBOW[index % RAINBOW.length] as string, share * 0.8);
    ctx.lineWidth = share * 3.6;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
  ctx.restore();
}

function bubble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  alpha: number,
) {
  ctx.strokeStyle = withAlpha('#bfeaff', alpha * 0.8);
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = withAlpha('#ffffff', alpha * 0.6);
  ctx.fillRect(x - radius * 0.5, y - radius * 0.5, 0.5, 0.5);
}
