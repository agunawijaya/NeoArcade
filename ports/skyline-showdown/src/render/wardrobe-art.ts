import type { Point } from '../engine/geometry';
import { DEFAULT_OUTFITS, type Outfit, type WardrobeItem } from '../wardrobe/items';
import { GorillaActor, lookFor } from './gorilla';
import { drawBanana, drawTrail } from './outfit';
import { withAlpha } from './palette';

/**
 * Small pictures of wardrobe items for the wardrobe's shelves: the item
 * worn by a plain gorilla, a banana in its skin, a stretch of trail or a
 * little burst. Locked items are painted as dark silhouettes.
 */
const THUMB_UNITS = 44;

export function paintThumbnail(
  canvas: HTMLCanvasElement,
  item: WardrobeItem,
  accent: string,
  locked: boolean,
  silhouette: string,
) {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const size = Math.max(1, Math.round((canvas.clientWidth || 48) * ratio));
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(size / THUMB_UNITS, 0, 0, size / THUMB_UNITS, 0, 0);
  ctx.clearRect(0, 0, THUMB_UNITS, THUMB_UNITS);

  switch (item.slot) {
    case 'banana':
      ctx.translate(22, 24);
      ctx.scale(3.4, 3.4);
      drawBanana(ctx, item.id);
      break;
    case 'trail':
      drawTrail(ctx, trailPoints(), item.id, accent, false, 0.3);
      break;
    case 'explosion':
      drawBurst(ctx, item.id, accent);
      break;
    default:
      drawWearer(ctx, item, accent);
  }

  if (locked) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = silhouette;
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'source-over';
  }
}

/** A plain gorilla wearing just this one item; hats and glasses get a close-up. */
function drawWearer(ctx: CanvasRenderingContext2D, item: WardrobeItem, accent: string) {
  const outfit: Outfit = { ...DEFAULT_OUTFITS[0], neckwear: 'neck-none', [item.slot]: item.id };
  const actor = new GorillaActor(0, lookFor(outfit, accent));
  if (item.slot === 'dance') {
    actor.setMood('dance');
    actor.update(0.12);
    actor.update(0.5);
  } else {
    actor.update(0.5);
  }
  const closeUp = item.slot === 'headwear' || item.slot === 'eyewear';
  if (closeUp) {
    ctx.translate(-10, 6);
    ctx.scale(1.9, 1.9);
  } else {
    ctx.translate(7, 12);
  }
  actor.draw(ctx, { x: 0, y: 0, building: 0 }, '#ffd8b0', 0.4);
}

function trailPoints(): Point[] {
  return Array.from({ length: 16 }, (_, index) => {
    const share = index / 15;
    return { x: 5 + share * 34, y: 34 - Math.sin(share * Math.PI * 0.9) * 26 };
  });
}

function drawBurst(ctx: CanvasRenderingContext2D, style: string, accent: string) {
  const centre = { x: 22, y: 22 };
  const around = (
    count: number,
    radius: number,
    draw: (x: number, y: number, index: number) => void,
  ) => {
    for (let index = 0; index < count; index++) {
      const angle = (index / count) * Math.PI * 2 + 0.3;
      draw(centre.x + Math.cos(angle) * radius, centre.y + Math.sin(angle) * radius, index);
    }
  };
  const glow = ctx.createRadialGradient(centre.x, centre.y, 0, centre.x, centre.y, 13);
  glow.addColorStop(0, '#fff2c0');
  glow.addColorStop(0.45, '#ff9a3a');
  glow.addColorStop(1, withAlpha('#ff5010', 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(centre.x, centre.y, 13, 0, Math.PI * 2);
  ctx.fill();
  const colours = ['#ff4d6d', '#ffd23f', '#3fe0ff', '#7dff8a', accent];
  switch (style) {
    case 'boom-pixel':
      around(10, 16, (x, y, index) => {
        ctx.fillStyle = colours[index % colours.length] as string;
        ctx.fillRect(Math.round(x / 3) * 3, Math.round(y / 3) * 3, 3, 3);
      });
      break;
    case 'boom-confetti':
      around(12, 17, (x, y, index) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(index);
        ctx.fillStyle = colours[index % colours.length] as string;
        ctx.fillRect(-2, -1, 4, 2);
        ctx.restore();
      });
      break;
    case 'boom-fireworks':
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.2;
      around(12, 18, (x, y) => {
        ctx.beginPath();
        ctx.moveTo(centre.x + (x - centre.x) * 0.55, centre.y + (y - centre.y) * 0.55);
        ctx.lineTo(x, y);
        ctx.stroke();
      });
      break;
    case 'boom-stars':
      around(6, 16, (x, y) => star(ctx, x, y, 3.4, '#ffe680'));
      break;
    case 'boom-paint':
      around(8, 16, (x, y, index) => {
        ctx.fillStyle = colours[index % colours.length] as string;
        ctx.beginPath();
        ctx.ellipse(x, y, 3, 2.2, index, 0, Math.PI * 2);
        ctx.fill();
      });
      break;
    default:
      ctx.fillStyle = '#6a5a60';
      around(8, 16, (x, y) => ctx.fillRect(x - 1.2, y - 1, 2.4, 2));
  }
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, colour: string) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  for (let point = 0; point < 10; point++) {
    const radius = point % 2 === 0 ? size : size * 0.45;
    const angle = (point / 10) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
  }
  ctx.closePath();
  ctx.fill();
}
