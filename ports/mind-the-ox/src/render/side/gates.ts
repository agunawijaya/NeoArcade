import type { Gate } from '../../engine/map';
import type { World } from '../../engine/world';
import type { Palette } from '../palette';
import type { SideCamera } from './camera';
import { mix, withAlpha } from './colour';

/** What a gate is in each theme: a photograph's marker kites, a cartoon hoop, an air race's pylon ring. */
export function gateColours(palette: Palette): { ring: string; band: string } {
  if (palette.theme === 'cyan-magenta')
    return { ring: palette.accents[0], band: palette.accents[1] };
  if (palette.theme === 'airshow') return { ring: '#e2483c', band: '#f4efe2' };
  return { ring: '#d8c48a', band: '#b8282e' };
}

/**
 * The gates still to fly through: each a tall ring, seen edge-on, standing
 * between its two heights on a tether down to a buoy (or a stake ashore),
 * numbered in order. The next one is bright and breathes; the ones after
 * it wait, faint.
 */
export function paintGates(
  ctx: CanvasRenderingContext2D,
  camera: SideCamera,
  palette: Palette,
  world: World,
  time: number,
) {
  const { gates } = world.map;
  for (let index = gates.length - 1; index >= world.gatesPassed; index--) {
    const gate = gates[index] as Gate;
    if (gate.x < camera.left - 40 || gate.x > camera.right + 40) continue;
    paintGate(ctx, camera, palette, world, gate, index, index === world.gatesPassed, time);
  }
}

function paintGate(
  ctx: CanvasRenderingContext2D,
  camera: SideCamera,
  palette: Palette,
  world: World,
  gate: Gate,
  index: number,
  next: boolean,
  time: number,
) {
  const { ring, band } = gateColours(palette);
  const unit = camera.scale;
  const x = camera.x(gate.x);
  const top = camera.y(gate.top);
  const bottom = camera.y(gate.bottom);
  const ground = camera.y(world.terrain.heightAt(gate.x));
  const middle = (top + bottom) / 2;
  const breathe = next ? 0.75 + Math.sin(time * 3) * 0.25 : 0.35;
  ctx.save();
  ctx.globalAlpha = next ? 1 : 0.45;
  // The tether and its float.
  ctx.strokeStyle = withAlpha(palette.ink, 0.5);
  ctx.lineWidth = Math.max(1, unit * 0.15);
  ctx.setLineDash([unit * 1.2, unit * 0.8]);
  ctx.beginPath();
  ctx.moveTo(x, bottom);
  ctx.lineTo(x, ground);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = band;
  ctx.beginPath();
  ctx.ellipse(x, ground - unit * 0.4, unit * 1.6, unit * 0.9, 0, 0, Math.PI * 2);
  ctx.fill();
  // The ring, edge-on: a tall narrow hoop, striped.
  const radiusY = (bottom - top) / 2;
  const radiusX = Math.max(unit * 1.4, radiusY * 0.14);
  ctx.lineWidth = Math.max(2, unit * 0.9);
  ctx.strokeStyle = ring;
  ctx.beginPath();
  ctx.ellipse(x, middle, radiusX, radiusY, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = band;
  ctx.setLineDash([unit * 2, unit * 2]);
  ctx.beginPath();
  ctx.ellipse(x, middle, radiusX, radiusY, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  // A glow inside the next one, and its number over it.
  if (next) {
    const glow = ctx.createRadialGradient(x, middle, 0, x, middle, radiusY);
    glow.addColorStop(0, withAlpha(mix(ring, '#ffffff', 0.6), 0.22 * breathe));
    glow.addColorStop(1, withAlpha(ring, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(x - radiusY, middle - radiusY, radiusY * 2, radiusY * 2);
  }
  ctx.fillStyle = next ? palette.ink : withAlpha(palette.ink, 0.6);
  ctx.font = `700 ${Math.max(10, unit * 3.2)}px "Iowan Old Style", Palatino, Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(String(index + 1), x, top - unit * 1.5);
  ctx.restore();
}
