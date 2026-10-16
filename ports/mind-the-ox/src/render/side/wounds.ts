import type { Ship, ShipWound } from '../../engine/world';
import type { Palette } from '../palette';
import { burningHeight, isBurning, woundHash } from '../ship-damage';
import { mix, withAlpha } from './colour';

/**
 * The marks a ship carries where it was struck, painted in the hull's own
 * frame (x along the hull towards the bow, y negative upwards from the
 * waterline): torn holes at the waterline where torpedoes went in, holes
 * and scorching in the side, the superstructure and the flight deck where
 * bombs burst. The diorama paints the same marks onto its hulls and decks.
 */

/** The side of the hull, under the deck: torpedo holes, and bombs that burst against the plating. */
export function paintHullWounds(
  ctx: CanvasRenderingContext2D,
  ship: Ship,
  palette: Palette,
  freeboard: number,
) {
  ship.wounds.forEach((wound, index) => {
    if (wound.cause === 'torpedo') paintTorpedoHole(ctx, ship, wound, index, palette, freeboard);
    else if (wound.height < freeboard - 0.5)
      paintBurst(ctx, ship, index, palette, wound.along, -Math.max(1.2, wound.height), 1);
  });
}

/**
 * The diorama's hulls have no houses painted on them: there a burst above
 * the deck leaves its soot along the deck edge instead.
 */
export function paintDeckEdgeSoot(
  ctx: CanvasRenderingContext2D,
  ship: Ship,
  palette: Palette,
  freeboard: number,
) {
  ship.wounds.forEach((wound, index) => {
    if (wound.cause !== 'torpedo' && wound.height >= freeboard - 0.5)
      paintBurst(ctx, ship, index, palette, wound.along, -(freeboard - 1), 1.1);
  });
}

/**
 * Flames licking up from every wound that is still burning, flickering
 * with `time`, in the hull's frame. A torpedo's fire is on the deck above
 * its hole.
 */
export function paintFlames(
  ctx: CanvasRenderingContext2D,
  ship: Ship,
  palette: Palette,
  tick: number,
  time: number,
) {
  const [core, flame, ember] = palette.fire;
  ship.wounds.forEach((wound, index) => {
    if (!isBurning(ship, wound, tick)) return;
    const base = -burningHeight(ship, wound);
    for (let tongue = 0; tongue < 3; tongue++) {
      const x = wound.along + (tongue - 1) * 1.6 + (woundHash(ship, index, tongue + 80) - 0.5);
      const flicker = Math.sin(time * (11 + tongue * 3) + index * 2.1 + tongue);
      const height = 3.2 + tongue * 0.6 + flicker * 1.1 + woundHash(ship, index, tongue + 90) * 1.5;
      const lean = Math.sin(time * 5 + index + tongue) * 0.6;
      tongueOf(ctx, x, base, 1.5, height, lean, withAlpha(ember, 0.75));
      tongueOf(ctx, x, base, 1.05, height * 0.72, lean * 0.8, withAlpha(flame, 0.9));
      tongueOf(ctx, x, base, 0.55, height * 0.42, lean * 0.6, core);
    }
  });
}

/** One tongue of flame: wide at its foot, pointed and leaning at its tip. */
function tongueOf(
  ctx: CanvasRenderingContext2D,
  x: number,
  base: number,
  halfWidth: number,
  height: number,
  lean: number,
  colour: string,
) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(x - halfWidth, base);
  ctx.quadraticCurveTo(x - halfWidth * 0.9, base - height * 0.6, x + lean, base - height);
  ctx.quadraticCurveTo(x + halfWidth * 0.9, base - height * 0.6, x + halfWidth, base);
  ctx.closePath();
  ctx.fill();
}

/** Above the deck: bursts on the houses, funnels and turrets, drawn over them. */
export function paintUpperWounds(
  ctx: CanvasRenderingContext2D,
  ship: Ship,
  palette: Palette,
  freeboard: number,
) {
  ship.wounds.forEach((wound, index) => {
    if (wound.cause !== 'torpedo' && wound.height >= freeboard - 0.5)
      paintBurst(ctx, ship, index, palette, wound.along, -wound.height, 1.2);
  });
}

/**
 * Bomb holes in a flight deck seen from just above it, between its near
 * edge (`front`) and the far one (`back`), in the hull's frame.
 */
export function paintFlightDeckWounds(
  ctx: CanvasRenderingContext2D,
  ship: Ship,
  palette: Palette,
  front: number,
  back: number,
) {
  ship.wounds.forEach((wound, index) => {
    if (wound.cause === 'torpedo') return;
    const across = front + (back - front) * (0.3 + woundHash(ship, index, 3) * 0.4);
    paintDeckHole(ctx, ship, index, palette, wound.along, across, 1, Math.abs(back - front) / 8);
  });
}

/**
 * The same holes on a flight deck painted flat, as the diorama lays it:
 * x along the deck from its stern end (`sternAt`, in the hull's frame), y
 * across it from the near edge.
 */
export function paintDeckPlanWounds(
  ctx: CanvasRenderingContext2D,
  ship: Ship,
  palette: Palette,
  sternAt: number,
  width: number,
) {
  ship.wounds.forEach((wound, index) => {
    if (wound.cause === 'torpedo') return;
    const across = width * (0.25 + woundHash(ship, index, 3) * 0.5);
    paintDeckHole(ctx, ship, index, palette, wound.along - sternAt, across, 1.5, 1);
  });
}

/**
 * A ragged hole torn in the side from below the waterline almost to the
 * deck, its edges curled out and scorched: tall enough to show once the
 * ship has settled.
 */
function paintTorpedoHole(
  ctx: CanvasRenderingContext2D,
  ship: Ship,
  wound: ShipWound,
  index: number,
  palette: Palette,
  freeboard: number,
) {
  const width = 7 + woundHash(ship, index, 1) * 3;
  const x = wound.along;
  const centre = -freeboard * 0.5;
  const reach = freeboard * 0.4;
  ctx.fillStyle = withAlpha(palette.scorch, 0.6);
  ctx.beginPath();
  ctx.ellipse(x, centre - reach * 0.3, width * 0.9, reach * 1.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ragged(ctx, ship, index, x, centre, width / 2, reach);
  ctx.fillStyle = mix(palette.scorch, '#000000', 0.65);
  ctx.fill();
  // Plating bent outwards round the edge, catching the light.
  ctx.strokeStyle = withAlpha(palette.cloud.light, 0.45);
  ctx.lineWidth = 0.22;
  ctx.beginPath();
  for (let tear = 0; tear < 5; tear++) {
    const angle = (tear / 5) * Math.PI * 2 + woundHash(ship, index, tear + 20) * 0.9;
    const edge = width / 2 + 0.4;
    ctx.moveTo(x + Math.cos(angle) * edge * 0.8, centre + Math.sin(angle) * reach * 0.85);
    ctx.lineTo(x + Math.cos(angle) * (edge + 1.2), centre + Math.sin(angle) * reach * 1.2);
  }
  ctx.stroke();
}

/** Where a bomb burst: a blackened star of scorching round a jagged hole. */
function paintBurst(
  ctx: CanvasRenderingContext2D,
  ship: Ship,
  index: number,
  palette: Palette,
  x: number,
  y: number,
  size: number,
) {
  ctx.fillStyle = withAlpha(palette.scorch, 0.6);
  ctx.beginPath();
  ctx.ellipse(x, y - 0.6 * size, 4.4 * size, 2.6 * size, 0, 0, Math.PI * 2);
  ctx.fill();
  ragged(ctx, ship, index, x, y, 1.9 * size, 1.4 * size);
  ctx.fillStyle = mix(palette.scorch, '#000000', 0.6);
  ctx.fill();
  // Soot streaked up the side above it.
  ctx.fillStyle = withAlpha(palette.scorch, 0.35);
  ctx.beginPath();
  ctx.moveTo(x - 1.6 * size, y);
  ctx.quadraticCurveTo(x - 0.4 * size, y - 4 * size, x + 0.6 * size, y - 5.5 * size);
  ctx.quadraticCurveTo(x + 1.2 * size, y - 3 * size, x + 1.8 * size, y);
  ctx.closePath();
  ctx.fill();
}

/** A hole in the deck planking, splintered round its edge. `squash` flattens it for a deck seen edge-on. */
function paintDeckHole(
  ctx: CanvasRenderingContext2D,
  ship: Ship,
  index: number,
  palette: Palette,
  x: number,
  y: number,
  size: number,
  squash: number,
) {
  ctx.fillStyle = withAlpha(palette.scorch, 0.55);
  ctx.beginPath();
  ctx.ellipse(x, y, 4.6 * size, 3 * size * squash, 0, 0, Math.PI * 2);
  ctx.fill();
  ragged(ctx, ship, index, x, y, 2.4 * size, 1.8 * size * squash);
  ctx.fillStyle = mix(palette.scorch, '#000000', 0.7);
  ctx.fill();
  ctx.strokeStyle = withAlpha(palette.cloud.light, 0.4);
  ctx.lineWidth = 0.16;
  ctx.beginPath();
  for (let splinter = 0; splinter < 6; splinter++) {
    const angle = (splinter / 6) * Math.PI * 2 + woundHash(ship, index, splinter + 40);
    ctx.moveTo(x + Math.cos(angle) * 2.2 * size, y + Math.sin(angle) * 1.6 * size * squash);
    ctx.lineTo(x + Math.cos(angle) * 3.4 * size, y + Math.sin(angle) * 2.4 * size * squash);
  }
  ctx.stroke();
}

/** A ragged outline round a point, the same for a wound every time it is drawn. */
function ragged(
  ctx: CanvasRenderingContext2D,
  ship: Ship,
  index: number,
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
) {
  const points = 13;
  ctx.beginPath();
  for (let point = 0; point < points; point++) {
    const angle = (point / points) * Math.PI * 2;
    const reach = 0.5 + 0.5 * woundHash(ship, index, point + 60);
    const px = x + Math.cos(angle) * radiusX * reach;
    const py = y + Math.sin(angle) * radiusY * reach;
    if (point === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}
