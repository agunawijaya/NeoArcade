import type { Rng } from '@shared/rng';
import type { Building } from '../engine/skyline';
import type { RoofProp } from './kits';
import { shade, withAlpha } from './palette';

/**
 * The things cities keep on their roofs, painted once with the city. They
 * stand set back on the roof and are scenery only: a banana flies through
 * a billboard as if it were not there, just as it did through the
 * original's empty roofs.
 */
const NEON = ['#ff3fa4', '#3ff3ff', '#ffe066', '#9b6bff'];

/** The narrowest roof each prop fits on. */
export const PROP_MIN_WIDTH: Record<RoofProp, number> = {
  waterTower: 50,
  tank: 26,
  dish: 22,
  billboard: 34,
  helipad: 40,
  smallDome: 26,
  solar: 26,
  rod: 20,
  garden: 26,
};

export function paintRoofProp(
  ctx: CanvasRenderingContext2D,
  prop: RoofProp,
  building: Building,
  colour: string,
  rng: Rng,
) {
  const x = building.x + building.width * rng.float(0.25, 0.6);
  const roof = building.top;
  switch (prop) {
    case 'waterTower':
      return waterTower(ctx, x, roof, colour);
    case 'tank':
      return tank(ctx, x, roof);
    case 'dish':
      return dish(ctx, x, roof, rng.chance(0.5) ? 1 : -1);
    case 'billboard':
      return billboard(ctx, building.x + building.width / 2, roof, rng.pick(NEON));
    case 'helipad':
      return helipad(ctx, building, colour);
    case 'smallDome':
      return smallDome(ctx, x, roof, colour);
    case 'solar':
      return solar(ctx, x, roof);
    case 'rod':
      return rod(ctx, x, roof);
    case 'garden':
      return garden(ctx, x, roof);
  }
}

function waterTower(ctx: CanvasRenderingContext2D, x: number, roof: number, colour: string) {
  ctx.fillStyle = colour;
  ctx.fillRect(x + 0.8, roof - 3, 0.6, 3);
  ctx.fillRect(x + 4.6, roof - 3, 0.6, 3);
  ctx.fillRect(x, roof - 8, 6, 5);
  ctx.beginPath();
  ctx.moveTo(x - 0.4, roof - 8);
  ctx.lineTo(x + 3, roof - 10.5);
  ctx.lineTo(x + 6.4, roof - 8);
  ctx.fill();
}

function tank(ctx: CanvasRenderingContext2D, x: number, roof: number) {
  ctx.fillStyle = '#3a5a7a';
  ctx.fillRect(x, roof - 1.5, 7, 1.5);
  ctx.fillStyle = '#5a88b0';
  ctx.fillRect(x + 0.5, roof - 6.5, 6, 5);
  ctx.beginPath();
  ctx.ellipse(x + 3.5, roof - 6.5, 3, 1, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#8ab8d8';
  ctx.fill();
  ctx.fillStyle = withAlpha('#000000', 0.2);
  ctx.fillRect(x + 4.8, roof - 6.5, 1.7, 5);
}

function dish(ctx: CanvasRenderingContext2D, x: number, roof: number, facing: number) {
  ctx.fillStyle = '#6a6a78';
  ctx.fillRect(x - 0.3, roof - 4, 0.6, 4);
  ctx.save();
  ctx.translate(x, roof - 5);
  ctx.rotate(0.6 * facing);
  ctx.beginPath();
  ctx.ellipse(0, 0, 3.2, 1.6, 0, Math.PI, Math.PI * 2);
  ctx.fillStyle = '#d8d8e0';
  ctx.fill();
  ctx.fillStyle = '#6a6a78';
  ctx.fillRect(-0.2, -2.6, 0.4, 2.6);
  ctx.restore();
}

function billboard(ctx: CanvasRenderingContext2D, centre: number, roof: number, neon: string) {
  const width = 16;
  const left = centre - width / 2;
  ctx.fillStyle = '#1a1622';
  ctx.fillRect(left + 2, roof - 3.5, 0.8, 3.5);
  ctx.fillRect(left + width - 2.8, roof - 3.5, 0.8, 3.5);
  ctx.fillRect(left, roof - 11, width, 7.5);
  // Lines of glowing "lettering": shapes, not words, so no real brand ever appears.
  ctx.fillStyle = neon;
  ctx.fillRect(left + 1.5, roof - 9.5, width - 7, 1.4);
  ctx.fillRect(left + 1.5, roof - 6.8, width - 4, 1);
  ctx.fillStyle = shade(neon, 0.4);
  ctx.beginPath();
  ctx.arc(left + width - 3, roof - 8.8, 1.6, 0, Math.PI * 2);
  ctx.fill();
}

function helipad(ctx: CanvasRenderingContext2D, building: Building, colour: string) {
  const left = building.x + 4;
  const width = building.width - 8;
  ctx.fillStyle = shade(colour, -0.2);
  ctx.fillRect(left + width * 0.3, building.top - 2.2, 0.8, 2.2);
  ctx.fillRect(left + width * 0.7, building.top - 2.2, 0.8, 2.2);
  ctx.fillStyle = shade(colour, 0.15);
  ctx.fillRect(left, building.top - 3.2, width, 1);
  ctx.fillStyle = '#ff4a4a';
  ctx.fillRect(left, building.top - 3.6, 1, 0.6);
  ctx.fillRect(left + width - 1, building.top - 3.6, 1, 0.6);
}

function smallDome(ctx: CanvasRenderingContext2D, x: number, roof: number, colour: string) {
  ctx.beginPath();
  ctx.arc(x + 4, roof, 4.2, Math.PI, Math.PI * 2);
  ctx.fillStyle = shade(colour, 0.2);
  ctx.fill();
  ctx.fillStyle = withAlpha('#ffffff', 0.15);
  ctx.beginPath();
  ctx.arc(x + 3, roof - 1.5, 1.8, Math.PI, Math.PI * 1.6);
  ctx.fill();
  ctx.fillStyle = shade(colour, -0.1);
  ctx.fillRect(x + 3.7, roof - 6.4, 0.6, 2.2);
}

function solar(ctx: CanvasRenderingContext2D, x: number, roof: number) {
  ctx.fillStyle = '#4a4a58';
  ctx.fillRect(x + 3, roof - 2.5, 0.6, 2.5);
  ctx.beginPath();
  ctx.moveTo(x, roof - 2.2);
  ctx.lineTo(x + 8, roof - 2.2);
  ctx.lineTo(x + 6.5, roof - 5.8);
  ctx.lineTo(x - 1.5, roof - 5.8);
  ctx.closePath();
  ctx.fillStyle = '#1e3a78';
  ctx.fill();
  ctx.strokeStyle = withAlpha('#9fc4ff', 0.45);
  ctx.lineWidth = 0.25;
  ctx.beginPath();
  ctx.moveTo(x - 0.75, roof - 4);
  ctx.lineTo(x + 7.25, roof - 4);
  ctx.moveTo(x + 2.5, roof - 2.2);
  ctx.lineTo(x + 1, roof - 5.8);
  ctx.moveTo(x + 5.3, roof - 2.2);
  ctx.lineTo(x + 3.8, roof - 5.8);
  ctx.stroke();
}

function rod(ctx: CanvasRenderingContext2D, x: number, roof: number) {
  ctx.fillStyle = '#9a9aa8';
  ctx.fillRect(x - 0.25, roof - 13, 0.5, 13);
  ctx.beginPath();
  ctx.arc(x, roof - 13.4, 0.9, 0, Math.PI * 2);
  ctx.fillStyle = '#d8d8e8';
  ctx.fill();
}

function garden(ctx: CanvasRenderingContext2D, x: number, roof: number) {
  ctx.fillStyle = '#2f6a3a';
  for (const [dx, radius] of [
    [0, 1.8],
    [2.6, 2.3],
    [5.2, 1.6],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x + dx, roof - radius * 0.8, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  // A little palm leaning over the parapet.
  ctx.strokeStyle = '#6a4a2a';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(x + 8, roof);
  ctx.quadraticCurveTo(x + 8.5, roof - 5, x + 10, roof - 9);
  ctx.stroke();
  ctx.strokeStyle = '#3f8a44';
  ctx.lineWidth = 0.9;
  for (const [dx, dy] of [
    [-3, 1.5],
    [3, 1.8],
    [-1.5, -1.8],
    [2, -1.5],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(x + 10, roof - 9);
    ctx.quadraticCurveTo(x + 10 + dx * 0.6, roof - 9 + dy - 1, x + 10 + dx, roof - 9 + dy);
    ctx.stroke();
  }
}
