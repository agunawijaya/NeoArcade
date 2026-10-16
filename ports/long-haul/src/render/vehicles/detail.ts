import { createRng } from '@shared/rng';
import type { FaceDraw } from './parts';

/**
 * The small things painted onto panels: lettering, glass with someone
 * behind it, panel gaps, rivets, road grime. All of them work in the face's
 * own units (feet, v up) and ask the face for their colours, so a decal in
 * the shade is in the shade and a rivet catches the same sun as its panel.
 */
export const LETTERING = '"Roboto Condensed", "Arial Narrow", "Segoe UI", system-ui, sans-serif';

export interface LetteringOptions {
  size: number;
  colour: string;
  weight?: number;
  /** Forward lean, as on a moving company's name. */
  slant?: number;
  align?: CanvasTextAlign;
  /** Spacing between letters, in feet. */
  spacing?: number;
  outline?: { colour: string; width: number };
  shadow?: string;
  /** Stretch the letters horizontally. */
  stretch?: number;
}

/** Text that reads the right way round whichever side of the vehicle it is on. */
export function lettering(
  face: FaceDraw,
  text: string,
  x: number,
  y: number,
  options: LetteringOptions,
) {
  const { ctx } = face;
  if (options.size * face.pixels < 2.5) return;
  ctx.save();
  ctx.translate(x, y);
  // v is up on a face; on the far side of the vehicle the face is also seen from behind.
  ctx.scale((face.mirrored ? -1 : 1) * (options.stretch ?? 1), -1);
  if (options.slant) ctx.transform(1, 0, -options.slant * (face.mirrored ? -1 : 1), 1, 0, 0);
  ctx.font = `${options.weight ?? 700} ${options.size}px ${LETTERING}`;
  ctx.textAlign = options.align ?? 'center';
  ctx.textBaseline = 'middle';
  if (options.spacing) ctx.letterSpacing = `${options.spacing}px`;
  if (options.shadow) {
    ctx.fillStyle = options.shadow;
    ctx.fillText(text, options.size * 0.05, options.size * 0.07);
  }
  if (options.outline) {
    ctx.strokeStyle = options.outline.colour;
    ctx.lineWidth = options.outline.width;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, 0, 0);
  }
  ctx.fillStyle = options.colour;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/**
 * A pane of glass: the dark inside with whatever sits there, then the sky
 * reflected over it, strongest towards the top, and a soft streak of light.
 */
export function glassPane(
  face: FaceDraw,
  glass: Pane,
  inside?: (face: FaceDraw) => void,
  warm = 0,
) {
  const { ctx } = face;
  const pane = glass.path;
  ctx.save();
  ctx.clip(pane);
  ctx.fillStyle = face.ink('#20262c', 'metal');
  ctx.fill(pane);
  if (warm > 0) {
    ctx.fillStyle = `rgba(255, 180, 110, ${0.45 * warm})`;
    ctx.fill(pane);
  }
  inside?.(face);
  const bounds = glass;
  const sky = ctx.createLinearGradient(0, bounds.top, 0, bounds.bottom);
  sky.addColorStop(0, withAlpha(face.ink('#1e2328', 'chrome', 0.6), 0.85));
  sky.addColorStop(0.55, withAlpha(face.ink('#1e2328', 'chrome', 0.1), 0.5));
  sky.addColorStop(1, withAlpha(face.ink('#1e2328', 'chrome', -0.2), 0.3));
  ctx.fillStyle = sky;
  ctx.fill(pane);
  const width = bounds.right - bounds.left;
  ctx.fillStyle = `rgba(255, 255, 255, ${0.06 + 0.12 * (1 - face.env.night)})`;
  ctx.beginPath();
  ctx.moveTo(bounds.left + width * 0.18, bounds.top);
  ctx.lineTo(bounds.left + width * 0.42, bounds.top);
  ctx.lineTo(bounds.left + width * 0.12, bounds.bottom);
  ctx.lineTo(bounds.left - width * 0.12, bounds.bottom);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = face.ink('#0e0f11', 'rubber');
  ctx.lineWidth = 0.08;
  ctx.stroke(pane);
}

/** A window's outline and its bounds, which the reflection is laid out over. */
export interface Pane {
  path: Path2D;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** A pane from corner points, each corner softened by `round` feet. */
export function pane(points: readonly (readonly [number, number])[], round = 0): Pane {
  const path = new Path2D();
  const count = points.length;
  points.forEach((point, index) => {
    const previous = points[(index - 1 + count) % count] as readonly [number, number];
    const next = points[(index + 1) % count] as readonly [number, number];
    if (round <= 0) {
      if (index === 0) path.moveTo(point[0], point[1]);
      else path.lineTo(point[0], point[1]);
      return;
    }
    const into = towards(point, previous, round);
    const out = towards(point, next, round);
    if (index === 0) path.moveTo(into[0], into[1]);
    else path.lineTo(into[0], into[1]);
    path.quadraticCurveTo(point[0], point[1], out[0], out[1]);
  });
  path.closePath();
  return {
    path,
    left: Math.min(...points.map((point) => point[0])),
    right: Math.max(...points.map((point) => point[0])),
    top: Math.max(...points.map((point) => point[1])),
    bottom: Math.min(...points.map((point) => point[1])),
  };
}

function towards(from: readonly [number, number], to: readonly [number, number], distance: number) {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
  const k = Math.min(distance, length / 2) / length;
  return [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k] as const;
}

function withAlpha(colour: string, alpha: number): string {
  return colour.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
}

/** A panel gap: a dark line with the lip of the next panel catching light under it. */
export function seam(face: FaceDraw, path: Path2D, colour: string, width = 0.07) {
  const { ctx } = face;
  if (face.pixels * width < 0.25) return;
  ctx.save();
  ctx.lineWidth = width * 1.6;
  ctx.strokeStyle = face.ink(colour, 'paint', 0.8);
  ctx.translate(0, -width * 0.9);
  ctx.stroke(path);
  ctx.restore();
  ctx.lineWidth = width;
  ctx.strokeStyle = face.ink('#0c0c0e', 'metal');
  ctx.stroke(path);
}

/** A row of rivet heads: a dotted shadow with a dotted glint above it. */
export function rivets(
  face: FaceDraw,
  from: [number, number],
  to: [number, number],
  spacing: number,
  colour: string,
) {
  const { ctx } = face;
  if (face.pixels * spacing < 3) {
    // Too small to see one by one: a faint line where the row runs.
    if (face.pixels * spacing < 1.2) return;
    ctx.strokeStyle = face.ink(colour, 'aluminium', -0.6);
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(from[0], from[1]);
    ctx.lineTo(to[0], to[1]);
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }
  const size = Math.min(0.06, spacing * 0.22);
  ctx.setLineDash([size * 1.6, spacing - size * 1.6]);
  ctx.lineWidth = size * 1.4;
  ctx.lineCap = 'round';
  ctx.strokeStyle = face.ink(colour, 'aluminium', -0.8);
  ctx.beginPath();
  ctx.moveTo(from[0], from[1] - size * 0.4);
  ctx.lineTo(to[0], to[1] - size * 0.4);
  ctx.stroke();
  ctx.strokeStyle = face.ink(colour, 'aluminium', 0.9);
  ctx.beginPath();
  ctx.moveTo(from[0], from[1] + size * 0.3);
  ctx.lineTo(to[0], to[1] + size * 0.3);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineCap = 'butt';
}

/**
 * Road grime rising from the bottom of a panel: spray thrown up behind the
 * wheels and a film along the sill, in streaks that are the same every frame.
 */
export function grime(
  face: FaceDraw,
  amount: number,
  area: { left: number; right: number; bottom: number; height: number },
  wheels: readonly number[] = [],
  seed = 1,
) {
  if (amount <= 0.02) return;
  const { ctx } = face;
  const { left, right, bottom, height } = area;
  const film = ctx.createLinearGradient(0, bottom, 0, bottom + height);
  film.addColorStop(0, `rgba(96, 82, 64, ${0.55 * amount})`);
  film.addColorStop(0.5, `rgba(110, 96, 76, ${0.22 * amount})`);
  film.addColorStop(1, 'rgba(110, 96, 76, 0)');
  ctx.fillStyle = film;
  ctx.fillRect(left, bottom, right - left, height);
  for (const x of wheels) {
    // A fan of spray thrown back from each wheel.
    const spray = ctx.createRadialGradient(
      x - height * 0.6,
      bottom,
      0,
      x - height * 0.6,
      bottom,
      height * 1.6,
    );
    spray.addColorStop(0, `rgba(88, 74, 58, ${0.4 * amount})`);
    spray.addColorStop(1, 'rgba(88, 74, 58, 0)');
    ctx.fillStyle = spray;
    ctx.fillRect(x - height * 2.4, bottom, height * 2.4, height * 1.6);
  }
  if (face.pixels < 3) return;
  const rng = createRng(`grime:${seed}`);
  ctx.lineCap = 'round';
  for (let streak = 0; streak < (right - left) * 1.4; streak++) {
    const x = left + rng.next() * (right - left);
    const tall = height * rng.float(0.25, 0.9) * (0.5 + amount * 0.5);
    ctx.strokeStyle = `rgba(92, 78, 60, ${rng.float(0.08, 0.22) * amount})`;
    ctx.lineWidth = rng.float(0.04, 0.12);
    ctx.beginPath();
    ctx.moveTo(x, bottom);
    ctx.lineTo(x + rng.float(-0.05, 0.05), bottom + tall);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
}
